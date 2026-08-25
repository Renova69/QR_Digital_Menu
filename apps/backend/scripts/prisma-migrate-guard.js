#!/usr/bin/env node
/**
 * Safety guard — blocks destructive Prisma operations on remote databases.
 *
 * `prisma migrate reset` drops the entire database. On a remote (non-local)
 * DB, this wipes all production/dev-cloud data with no undo.
 *
 * This script runs before `migrate:reset` and `migrate:dev` and refuses to
 * proceed unless the DATABASE_URL points to localhost/127.0.0.1. There is no
 * remote override: an override turns a safety boundary into a spelling test.
 *
 * Usage:
 *   node scripts/prisma-migrate-guard.js            # blocks reset on remote
 *   node scripts/prisma-migrate-guard.js --allow-reset  # blocks reset on remote
 */

const path = require('node:path');
const dotenv = require('dotenv');

// Prisma loads apps/backend/.env itself. The guard must resolve the same file
// first; otherwise an unset shell variable looks "local" here while Prisma
// immediately loads a remote production URL after this process exits.
dotenv.config({
  path: path.resolve(process.cwd(), '.env'),
  override: false,
  quiet: true,
});

const dbUrl = process.env.DATABASE_URL || '';

if (!dbUrl) {
  console.error(
    '🛑 BLOCKED: DATABASE_URL is not set, so the reset target cannot be proven local.',
  );
  process.exit(1);
}

let isLocal = false;
try {
  const hostname = new URL(dbUrl).hostname.toLowerCase();
  isLocal =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]';
} catch {
  // Unparseable URL — fail safe and treat it as remote.
}

if (!isLocal) {
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
  console.error(
    '│                                                             │',
  );
  console.error(
    '│ Use migrate:deploy for remote forward-only migrations.       │',
  );
  console.error(
    '│ Remote reset has no override in this repository.             │',
  );
  console.error(
    '└─────────────────────────────────────────────────────────────┘',
  );
  process.exit(1);
}

// Local DB — safe to proceed
console.log('✅ Local database detected — proceeding.');
