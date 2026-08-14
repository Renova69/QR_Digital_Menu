import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  assertCanonicalMigrationBytes,
  sha256Migration,
} from './verify-preproduction-readonly';

export const TARGET_MIGRATION =
  '20260620120000_architecture_todo_fixes' as const;
export const EXPECTED_RECORDED_CHECKSUM =
  '35c4d2f89c2e7d0aebf3c2c4e3a3df2be94f9c4f1c1d5c9c4f3b4e1d2c3a4b5c' as const;

type RepairEnvironment = Record<string, string | undefined>;
type MigrationRow = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};
export type RepairState = 'needs-repair' | 'already-repaired';

function readRequiredArg(args: string[], name: string): string {
  return (
    args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? ''
  );
}

export function getRepairDatabaseIdentity(
  env: RepairEnvironment = process.env,
  options: { allowLocalDisposable?: boolean } = {},
): { databaseUrl: string; databaseIdentity: string } {
  const databaseUrl = env.DIRECT_URL?.trim() ?? '';
  if (!databaseUrl) {
    throw new Error('DIRECT_URL is required for migration checksum repair');
  }

  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\/+/, '');
  if (!parsed.hostname || !database) {
    throw new Error('DIRECT_URL must identify a host and database');
  }
  const isLoopback =
    parsed.hostname === 'localhost' ||
    parsed.hostname === '127.0.0.1' ||
    parsed.hostname === '::1';
  if (isLoopback) {
    if (!options.allowLocalDisposable || database !== 'checksum_test') {
      throw new Error(
        'Migration checksum repair refuses a local database unless --allow-local-disposable targets checksum_test',
      );
    }
  }
  if (parsed.hostname.includes('-pooler')) {
    throw new Error(
      'Migration checksum repair requires the unpooled DIRECT_URL endpoint',
    );
  }

  const port = parsed.port && parsed.port !== '5432' ? `:${parsed.port}` : '';
  return {
    databaseUrl,
    databaseIdentity: `${parsed.hostname}${port}/${database}`,
  };
}

export function assertRepairApplySafety(
  args: string[],
  targetChecksum: string,
  env: RepairEnvironment = process.env,
): { databaseUrl: string; databaseIdentity: string } {
  const database = getRepairDatabaseIdentity(env, {
    allowLocalDisposable: args.includes('--allow-local-disposable'),
  });
  if (!args.includes('--confirm=REPAIR_MIGRATION_CHECKSUM')) {
    throw new Error('Apply mode requires --confirm=REPAIR_MIGRATION_CHECKSUM');
  }
  if (readRequiredArg(args, '--confirm-migration') !== TARGET_MIGRATION) {
    throw new Error(
      `Apply mode requires --confirm-migration=${TARGET_MIGRATION}`,
    );
  }
  if (readRequiredArg(args, '--confirm-from') !== EXPECTED_RECORDED_CHECKSUM) {
    throw new Error(
      `Apply mode requires --confirm-from=${EXPECTED_RECORDED_CHECKSUM}`,
    );
  }
  if (readRequiredArg(args, '--confirm-to') !== targetChecksum) {
    throw new Error(`Apply mode requires --confirm-to=${targetChecksum}`);
  }
  if (
    readRequiredArg(args, '--confirm-database') !== database.databaseIdentity
  ) {
    throw new Error(
      `Apply mode requires --confirm-database=${database.databaseIdentity}`,
    );
  }
  return database;
}

export function classifyRepairState(
  row: MigrationRow | undefined,
  targetChecksum: string,
): RepairState {
  if (!row) {
    throw new Error(
      `Migration ${TARGET_MIGRATION} is missing from the database`,
    );
  }
  if (row.rolled_back_at !== null) {
    throw new Error(`Migration ${TARGET_MIGRATION} is marked rolled back`);
  }
  if (row.finished_at === null) {
    throw new Error(`Migration ${TARGET_MIGRATION} is unfinished`);
  }
  if (row.checksum === targetChecksum) return 'already-repaired';
  if (row.checksum === EXPECTED_RECORDED_CHECKSUM) return 'needs-repair';
  throw new Error(
    `Migration ${TARGET_MIGRATION} has unexpected checksum ${row.checksum}; refusing repair`,
  );
}

async function readTargetChecksum(): Promise<string> {
  const migration = await readFile(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      TARGET_MIGRATION,
      'migration.sql',
    ),
  );
  assertCanonicalMigrationBytes(TARGET_MIGRATION, migration);
  return sha256Migration(migration);
}

async function readMigrationRow(
  client: Prisma.TransactionClient | PrismaClient,
  forUpdate: boolean,
): Promise<MigrationRow | undefined> {
  const suffix = forUpdate ? Prisma.raw(' FOR UPDATE') : Prisma.empty;
  const rows = await client.$queryRaw<MigrationRow[]>`
    SELECT migration_name, checksum, finished_at, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name = ${TARGET_MIGRATION}
    ${suffix}
  `;
  return rows[0];
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const targetChecksum = await readTargetChecksum();
  const database = apply
    ? assertRepairApplySafety(args, targetChecksum)
    : getRepairDatabaseIdentity();
  const prisma = new PrismaClient({
    datasources: { db: { url: database.databaseUrl } },
    log: ['warn', 'error'],
  });

  try {
    if (!apply) {
      const row = await readMigrationRow(prisma, false);
      const state = classifyRepairState(row, targetChecksum);
      console.log(
        JSON.stringify(
          {
            mode: 'dry-run',
            databaseIdentity: database.databaseIdentity,
            migration: TARGET_MIGRATION,
            state,
            recordedChecksum: row?.checksum ?? null,
            targetChecksum,
          },
          null,
          2,
        ),
      );
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const row = await readMigrationRow(tx, true);
      const state = classifyRepairState(row, targetChecksum);
      if (state === 'already-repaired') {
        return { state, rowsChanged: 0 };
      }

      const updated = await tx.$queryRaw<MigrationRow[]>`
        UPDATE "_prisma_migrations"
        SET checksum = ${targetChecksum}
        WHERE migration_name = ${TARGET_MIGRATION}
          AND checksum = ${EXPECTED_RECORDED_CHECKSUM}
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
        RETURNING migration_name, checksum, finished_at, rolled_back_at
      `;
      if (updated.length !== 1 || updated[0]?.checksum !== targetChecksum) {
        throw new Error(
          `Expected exactly one guarded checksum update, changed ${updated.length}`,
        );
      }
      return { state: 'repaired' as const, rowsChanged: 1 };
    });

    console.log(
      JSON.stringify(
        {
          mode: 'apply',
          databaseIdentity: database.databaseIdentity,
          migration: TARGET_MIGRATION,
          fromChecksum: EXPECTED_RECORDED_CHECKSUM,
          targetChecksum,
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Migration checksum repair failed',
    );
    process.exitCode = 1;
  });
}
