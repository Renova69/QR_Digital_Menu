import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';

type CountRow = { count: bigint };
type CurrencyRow = { currency: string; count: bigint };
type MigrationRow = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};
type VersionRow = { server_version: string };

const prisma = new PrismaClient();
const asNumber = (rows: CountRow[]): number => Number(rows[0]?.count ?? 0n);

async function main(): Promise<void> {
  const migrationChecksums = new Map<string, string>();
  for (const name of [
    '20260620120000_architecture_todo_fixes',
    '20260701120000_add_refund_pending_status',
    '20260702090000_add_refund_attempt',
  ]) {
    const sql = await readFile(
      join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql'),
      'utf8',
    );
    migrationChecksums.set(
      name,
      createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex'),
    );
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
            '20260702090000_add_refund_attempt'
          )
          ORDER BY migration_name
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
        relevantMigrations: relevantMigrations.map((migration) => ({
          name: migration.migration_name,
          applied:
            migration.finished_at !== null && migration.rolled_back_at === null,
          checksumMatchesFile:
            migration.checksum ===
            migrationChecksums.get(migration.migration_name),
        })),
        databaseVersion: databaseVersion[0]?.server_version ?? 'unknown',
      };
    },
    { timeout: 30_000 },
  );

  console.log(JSON.stringify(result, null, 2));

  const blockers =
    result.bgnMenuItems +
    result.optionsUnderBgnItems +
    result.optionsWithEmbeddedBgnCurrency +
    result.nonEurPayments +
    result.legacyRefundPendingPayments;
  if (blockers > 0) {
    throw new Error(
      `Pre-production read-only audit found ${blockers} authoritative currency/refund blocker(s)`,
    );
  }
}

main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Read-only audit failed',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
