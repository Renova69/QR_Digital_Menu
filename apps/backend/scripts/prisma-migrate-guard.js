#!/usr/bin/env node
/**
 * Safety guard — blocks destructive Prisma operations on remote databases.
 *
 * `prisma migrate reset` drops the entire database. On a remote (non-local)
 * DB, this wipes all production/dev-cloud data with no undo.
 *
 * This script runs before `migrate:reset` and `migrate:dev` and refuses to
 * proceed unless the DATABASE_URL points to localhost/127.0.0.1 OR the
 * operator explicitly sets ALLOW_REMOTE_RESET=true.
 *
 * Usage:
 *   node scripts/prisma-migrate-guard.js            # blocks reset on remote
 *   node scripts/prisma-migrate-guard.js --allow-reset  # blocks reset on remote
 *   ALLOW_REMOTE_RESET=true node scripts/prisma-migrate-guard.js --allow-reset
 */

const allowReset = process.argv.includes('--allow-reset');
const dbUrl = process.env.DATABASE_URL || '';

let isLocal = dbUrl === '';
if (!isLocal) {
  try {
    const hostname = new URL(dbUrl).hostname.toLowerCase();
    isLocal =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.endsWith('.local');
  } catch {
    // Unparseable URL — err safe, treat as remote
    isLocal = false;
  }
}

if (!isLocal) {
  if (allowReset && process.env.ALLOW_REMOTE_RESET === 'true') {
    console.warn(
      '⚠️  ALLOW_REMOTE_RESET=true — proceeding with reset on remote database.',
    );
    console.warn(
      '   This will DESTROY ALL DATA on:',
      dbUrl.replace(/\/\/.*@/, '//***@'),
    );
    process.exit(0);
  }

  console.error(
    '┌─────────────────────────────────────────────────────────────┐',
  );
  console.error(
    '│ 🛑  BLOCKED: Destructive Prisma operation on REMOTE database │',
  );
  console.error(
    '├─────────────────────────────────────────────────────────────┤',
  );
  console.error(
    '│ Target:',
    dbUrl.replace(/\/\/.*@/, '//***@').padEnd(50),
    '│',
  );
  console.error(
    '│                                                             │',
  );
  console.error(
    '│ migrate reset DROPS the entire database.                     │',
  );
  if (allowReset) {
    console.error(
      '│                                                             │',
    );
    console.error(
      '│ To proceed anyway (DESTRUCTIVE):                             │',
    );
    console.error(
      '│   ALLOW_REMOTE_RESET=true npm run migrate:reset              │',
    );
  } else {
    console.error(
      '│                                                             │',
    );
    console.error(
      '│ Use migrate:deploy instead for production-safe migrations:   │',
    );
    console.error(
      '│   npm run migrate:deploy                                    │',
    );
  }
  console.error(
    '└─────────────────────────────────────────────────────────────┘',
  );
  process.exit(1);
}

// Local DB — safe to proceed
console.log('✅ Local database detected — proceeding.');
