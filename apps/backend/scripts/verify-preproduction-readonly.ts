import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';

type CountRow = { count: bigint };
type CurrencyRow = { currency: string; count: bigint };
export type MigrationRow = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};
type VersionRow = { server_version: string };
type DatabasePostconditionRow = {
  check_name: string;
  passed: boolean;
  details: string | null;
};

export type DatabasePostconditionResult = {
  checkName: string;
  passed: boolean;
  details: string | null;
};

export type MigrationIntegrityIssue =
  | 'MISSING'
  | 'UNFINISHED'
  | 'ROLLED_BACK'
  | 'CHECKSUM_MISMATCH';

export type MigrationIntegrityResult = {
  name: string;
  applied: boolean;
  checksumMatchesFile: boolean;
  expectedChecksum: string;
  recordedChecksum: string | null;
  issues: MigrationIntegrityIssue[];
};

const RELEVANT_MIGRATIONS = [
  '20260620120000_architecture_todo_fixes',
  '20260701120000_add_refund_pending_status',
  '20260702090000_add_refund_attempt',
  '20260813193000_align_consent_and_legal_schema',
  '20260813200000_align_translation_schema_metadata',
] as const;

const auditDatabaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
const prisma = new PrismaClient(
  auditDatabaseUrl
    ? { datasources: { db: { url: auditDatabaseUrl } } }
    : undefined,
);
const asNumber = (rows: CountRow[]): number => Number(rows[0]?.count ?? 0n);

export function sha256Migration(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}

export function assessMigrationIntegrity(
  expectedChecksums: ReadonlyMap<string, string>,
  rows: readonly MigrationRow[],
): MigrationIntegrityResult[] {
  const rowsByName = new Map(rows.map((row) => [row.migration_name, row]));

  return Array.from(expectedChecksums, ([name, expectedChecksum]) => {
    const row = rowsByName.get(name);
    if (!row) {
      return {
        name,
        applied: false,
        checksumMatchesFile: false,
        expectedChecksum,
        recordedChecksum: null,
        issues: ['MISSING'],
      };
    }

    const issues: MigrationIntegrityIssue[] = [];
    if (row.rolled_back_at !== null) {
      issues.push('ROLLED_BACK');
    } else if (row.finished_at === null) {
      issues.push('UNFINISHED');
    }
    if (row.checksum !== expectedChecksum) {
      issues.push('CHECKSUM_MISMATCH');
    }

    return {
      name,
      applied: row.finished_at !== null && row.rolled_back_at === null,
      checksumMatchesFile: row.checksum === expectedChecksum,
      expectedChecksum,
      recordedChecksum: row.checksum,
      issues,
    };
  });
}

export function countMigrationIntegrityBlockers(
  migrations: readonly MigrationIntegrityResult[],
  allowPendingMigrations = false,
): number {
  return migrations.filter((migration) =>
    migration.issues.some(
      (issue) => !(allowPendingMigrations && issue === 'MISSING'),
    ),
  ).length;
}

export function countFailedDatabasePostconditions(
  checks: readonly DatabasePostconditionResult[],
): number {
  return checks.filter((check) => !check.passed).length;
}

async function main(): Promise<void> {
  const allowPendingMigrations = process.argv.includes(
    '--allow-pending-migrations',
  );
  const migrationChecksums = new Map<string, string>();
  for (const name of RELEVANT_MIGRATIONS) {
    const sql = await readFile(
      join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql'),
    );
    migrationChecksums.set(name, sha256Migration(sql));
  }

  const result = await prisma.$transaction(
    async (tx) => {
      // Defense in depth: even if this script is accidentally extended with a
      // write later, PostgreSQL rejects it for the entire transaction.
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');

      const [
        menuCurrencies,
        bgnMenuItems,
        bgnParentOptions,
        embeddedBgnOptionCurrency,
        nonEurPayments,
        legacyRefundPending,
        relevantMigrations,
        architectureMigrationPostconditions,
        databaseVersion,
      ] = await Promise.all([
        tx.$queryRawUnsafe<CurrencyRow[]>(`
          SELECT "currency"::text AS currency, COUNT(*)::bigint AS count
          FROM "menu_item"
          GROUP BY "currency"::text
          ORDER BY "currency"::text
        `),
        tx.$queryRawUnsafe<CountRow[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "menu_item"
          WHERE "currency"::text = 'BGN'
        `),
        tx.$queryRawUnsafe<CountRow[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "menu_option" AS option
          JOIN "menu_item" AS item ON item."id" = option."menuItemId"
          WHERE item."currency"::text = 'BGN'
        `),
        tx.$queryRawUnsafe<CountRow[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "menu_option"
          WHERE "choices"::text ~* '"currency"\\s*:\\s*"BGN"'
        `),
        tx.$queryRawUnsafe<CountRow[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "payment"
          WHERE UPPER(COALESCE("currency", '')) <> 'EUR'
        `),
        tx.$queryRawUnsafe<CountRow[]>(`
          SELECT COUNT(*)::bigint AS count
          FROM "payment"
          WHERE "status"::text = 'REFUND_PENDING'
        `),
        tx.$queryRawUnsafe<MigrationRow[]>(`
          SELECT migration_name, checksum, finished_at, rolled_back_at
          FROM "_prisma_migrations"
          WHERE migration_name IN (
            '20260620120000_architecture_todo_fixes',
            '20260701120000_add_refund_pending_status',
            '20260702090000_add_refund_attempt',
            '20260813193000_align_consent_and_legal_schema',
            '20260813200000_align_translation_schema_metadata'
          )
          ORDER BY migration_name
        `),
        tx.$queryRawUnsafe<DatabasePostconditionRow[]>(`
          SELECT
            'pgcrypto_extension' AS check_name,
            EXISTS (
              SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
            ) AS passed,
            'pgcrypto must exist for print-agent token hashing' AS details
          UNION ALL
          SELECT
            'print_agent_token_hash_column',
            EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'print_agent_token'
                AND column_name = 'tokenHash'
                AND data_type = 'text'
                AND is_nullable = 'NO'
            ),
            'tokenHash must be required text'
          UNION ALL
          SELECT
            'print_agent_token_raw_token_nullable',
            EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'print_agent_token'
                AND column_name = 'token'
                AND data_type = 'text'
                AND is_nullable = 'YES'
                AND column_default IS NULL
            ),
            'legacy token must be nullable with no default'
          UNION ALL
          SELECT
            'print_agent_token_hash_values',
            NOT EXISTS (
              SELECT 1
              FROM "print_agent_token"
              WHERE "tokenHash" IS NULL
                 OR "tokenHash" !~ '^[0-9a-f]{64}$'
            ),
            'every tokenHash must be a lowercase SHA-256 hex digest'
          UNION ALL
          SELECT
            'print_agent_token_raw_tokens_removed',
            NOT EXISTS (
              SELECT 1 FROM "print_agent_token" WHERE "token" IS NOT NULL
            ),
            'no raw print-agent bearer tokens may remain'
          UNION ALL
          SELECT
            'print_agent_token_hash_unique_index',
            EXISTS (
              SELECT 1
              FROM pg_class AS index_class
              JOIN pg_index AS index_metadata
                ON index_metadata.indexrelid = index_class.oid
              JOIN pg_class AS table_class
                ON table_class.oid = index_metadata.indrelid
              JOIN pg_namespace AS table_namespace
                ON table_namespace.oid = table_class.relnamespace
              WHERE table_namespace.nspname = current_schema()
                AND table_class.relname = 'print_agent_token'
                AND index_class.relname = 'print_agent_token_tokenHash_key'
                AND index_metadata.indisunique
                AND pg_get_indexdef(index_class.oid) LIKE '%("tokenHash")%'
            ),
            'tokenHash must have its named unique index'
          UNION ALL
          SELECT
            'order_item_unit_price_column',
            EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'order_item'
                AND column_name = 'unitPrice'
                AND data_type = 'double precision'
                AND is_nullable = 'NO'
                AND column_default IN ('0', '0::double precision')
            ),
            'unitPrice must be required double precision with default zero'
          UNION ALL
          SELECT
            'order_item_unit_price_with_options_column',
            EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'order_item'
                AND column_name = 'unitPriceWithOptions'
                AND data_type = 'double precision'
                AND is_nullable = 'NO'
                AND column_default IN ('0', '0::double precision')
            ),
            'unitPriceWithOptions must be required double precision with default zero'
          UNION ALL
          SELECT
            'payment_provider_event_table',
            to_regclass(
              format('%I.%I', current_schema(), 'payment_provider_event')
            ) IS NOT NULL,
            'payment_provider_event table must exist'
          UNION ALL
          SELECT
            'payment_provider_event_columns',
            (
              SELECT COUNT(*)
              FROM information_schema.columns
              WHERE table_schema = current_schema()
                AND table_name = 'payment_provider_event'
                AND (
                  (column_name = 'id' AND data_type = 'text' AND is_nullable = 'NO')
                  OR (column_name = 'provider' AND data_type = 'USER-DEFINED' AND udt_name = 'PaymentProvider' AND is_nullable = 'NO')
                  OR (column_name = 'eventKey' AND data_type = 'text' AND is_nullable = 'NO')
                  OR (column_name = 'paymentId' AND data_type = 'text' AND is_nullable = 'YES')
                  OR (column_name = 'restaurantId' AND data_type = 'text' AND is_nullable = 'YES')
                  OR (column_name = 'payload' AND data_type = 'jsonb' AND is_nullable = 'YES')
                  OR (column_name = 'createdAt' AND data_type = 'timestamp without time zone' AND is_nullable = 'NO')
                )
            ) = 7,
            'payment_provider_event must retain its seven migration-defined columns'
          UNION ALL
          SELECT
            'payment_provider_event_primary_key',
            EXISTS (
              SELECT 1
              FROM pg_constraint AS constraint_metadata
              JOIN pg_class AS table_class
                ON table_class.oid = constraint_metadata.conrelid
              JOIN pg_namespace AS table_namespace
                ON table_namespace.oid = table_class.relnamespace
              WHERE table_namespace.nspname = current_schema()
                AND table_class.relname = 'payment_provider_event'
                AND constraint_metadata.conname = 'payment_provider_event_pkey'
                AND constraint_metadata.contype = 'p'
            ),
            'payment_provider_event must retain its primary key'
          UNION ALL
          SELECT
            'payment_provider_event_dedup_index',
            EXISTS (
              SELECT 1
              FROM pg_class AS index_class
              JOIN pg_index AS index_metadata
                ON index_metadata.indexrelid = index_class.oid
              JOIN pg_class AS table_class
                ON table_class.oid = index_metadata.indrelid
              JOIN pg_namespace AS table_namespace
                ON table_namespace.oid = table_class.relnamespace
              WHERE table_namespace.nspname = current_schema()
                AND table_class.relname = 'payment_provider_event'
                AND index_metadata.indisunique
                AND ARRAY(
                  SELECT attribute_metadata.attname::text
                  FROM unnest(index_metadata.indkey)
                    WITH ORDINALITY AS index_column(attnum, position)
                  JOIN pg_attribute AS attribute_metadata
                    ON attribute_metadata.attrelid = table_class.oid
                   AND attribute_metadata.attnum = index_column.attnum
                  WHERE index_column.position <= index_metadata.indnkeyatts
                  ORDER BY index_column.position
                ) = ARRAY['provider', 'eventKey']
            ),
            'provider and eventKey must have a unique index in that order'
          UNION ALL
          SELECT
            'payment_provider_event_payment_index',
            EXISTS (
              SELECT 1
              FROM pg_indexes
              WHERE schemaname = current_schema()
                AND tablename = 'payment_provider_event'
                AND indexname = 'payment_provider_event_paymentId_idx'
                AND indexdef LIKE '%("paymentId")%'
            ),
            'paymentId lookup index must exist'
          UNION ALL
          SELECT
            'payment_provider_event_restaurant_index',
            EXISTS (
              SELECT 1
              FROM pg_indexes
              WHERE schemaname = current_schema()
                AND tablename = 'payment_provider_event'
                AND indexname = 'payment_provider_event_restaurantId_createdAt_idx'
                AND indexdef LIKE '%("restaurantId", "createdAt")%'
            ),
            'restaurantId and createdAt lookup index must exist'
          UNION ALL
          SELECT
            'payment_provider_event_payment_fk',
            EXISTS (
              SELECT 1
              FROM pg_constraint AS constraint_metadata
              JOIN pg_class AS table_class
                ON table_class.oid = constraint_metadata.conrelid
              JOIN pg_namespace AS table_namespace
                ON table_namespace.oid = table_class.relnamespace
              WHERE table_namespace.nspname = current_schema()
                AND table_class.relname = 'payment_provider_event'
                AND constraint_metadata.conname = 'payment_provider_event_paymentId_fkey'
                AND constraint_metadata.contype = 'f'
                AND constraint_metadata.confdeltype = 'n'
                AND constraint_metadata.confupdtype = 'c'
            ),
            'payment FK must use ON DELETE SET NULL and ON UPDATE CASCADE'
          UNION ALL
          SELECT
            'payment_provider_event_restaurant_fk',
            EXISTS (
              SELECT 1
              FROM pg_constraint AS constraint_metadata
              JOIN pg_class AS table_class
                ON table_class.oid = constraint_metadata.conrelid
              JOIN pg_namespace AS table_namespace
                ON table_namespace.oid = table_class.relnamespace
              WHERE table_namespace.nspname = current_schema()
                AND table_class.relname = 'payment_provider_event'
                AND constraint_metadata.conname = 'payment_provider_event_restaurantId_fkey'
                AND constraint_metadata.contype = 'f'
                AND constraint_metadata.confdeltype = 'n'
                AND constraint_metadata.confupdtype = 'c'
            ),
            'restaurant FK must use ON DELETE SET NULL and ON UPDATE CASCADE'
          ORDER BY check_name
        `),
        tx.$queryRawUnsafe<VersionRow[]>(`
          SELECT current_setting('server_version') AS server_version
        `),
      ]);

      return {
        menuCurrencies: menuCurrencies.map((row) => ({
          currency: row.currency,
          count: Number(row.count),
        })),
        bgnMenuItems: asNumber(bgnMenuItems),
        optionsUnderBgnItems: asNumber(bgnParentOptions),
        optionsWithEmbeddedBgnCurrency: asNumber(embeddedBgnOptionCurrency),
        nonEurPayments: asNumber(nonEurPayments),
        legacyRefundPendingPayments: asNumber(legacyRefundPending),
        relevantMigrations: assessMigrationIntegrity(
          migrationChecksums,
          relevantMigrations,
        ),
        architectureMigrationPostconditions:
          architectureMigrationPostconditions.map((check) => ({
            checkName: check.check_name,
            passed: check.passed,
            details: check.details,
          })),
        databaseVersion: databaseVersion[0]?.server_version ?? 'unknown',
      };
    },
    { timeout: 30_000 },
  );

  console.log(JSON.stringify(result, null, 2));

  const authoritativeDataBlockers =
    result.bgnMenuItems +
    result.optionsUnderBgnItems +
    result.optionsWithEmbeddedBgnCurrency +
    result.nonEurPayments +
    result.legacyRefundPendingPayments;
  const migrationIntegrityBlockers = countMigrationIntegrityBlockers(
    result.relevantMigrations,
    allowPendingMigrations,
  );
  const databasePostconditionBlockers = countFailedDatabasePostconditions(
    result.architectureMigrationPostconditions,
  );
  const blockers =
    authoritativeDataBlockers +
    migrationIntegrityBlockers +
    databasePostconditionBlockers;
  if (blockers > 0) {
    throw new Error(
      `Pre-production read-only audit found ${authoritativeDataBlockers} authoritative currency/refund blocker(s), ${migrationIntegrityBlockers} migration integrity blocker(s), and ${databasePostconditionBlockers} database postcondition blocker(s)`,
    );
  }
}

if (require.main === module) {
  void main()
    .catch((error) => {
      console.error(
        error instanceof Error ? error.message : 'Read-only audit failed',
      );
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
