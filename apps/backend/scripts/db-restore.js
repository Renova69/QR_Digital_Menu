#!/usr/bin/env node
/**
 * db-restore.js — Restore a PostgreSQL backup into a new empty local database.
 *
 * This helper permanently refuses remote/default databases and refuses any
 * local target that already contains public tables. It never drops objects.
 * Production recovery is a separate, explicitly approved break-glass event.
 *
 * Usage:
 *   node scripts/db-restore.js ./backups/qr-menu-db-2026-07-09_16-00-00.bak
 *   node scripts/db-restore.js --list                      # list backups
 *   npm run db:restore -- ./backups/file.bak
 *   npm run db:backups
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PG_BIN =
  process.env.PG_BIN_DIR || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PG_RESTORE = path.join(PG_BIN, 'pg_restore.exe');

function getLocalRestoreTarget(raw = process.env.DATABASE_URL || '') {
  if (!raw) throw new Error('DATABASE_URL not set in .env or environment');
  const url = new URL(raw);
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    throw new Error(
      'Remote database restore is permanently blocked by this helper.',
    );
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (
    !database ||
    ['postgres', 'template0', 'template1'].includes(database) ||
    !/(restore|drill|scratch|disposable|test)/i.test(database)
  ) {
    throw new Error(
      'Restore target must be a named local disposable/restore/drill/test database.',
    );
  }
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('connection_limit');
  url.searchParams.delete('connect_timeout');
  url.searchParams.delete('pool_timeout');
  // Remote targets were rejected above. Standard disposable PostgreSQL
  // containers do not enable TLS, so requiring it here would make the safe
  // local restore-drill path unusable.
  url.searchParams.set('sslmode', 'disable');
  return { database, url: url.toString() };
}

function listBackups() {
  const backupDir = path.resolve(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    console.log('No backups directory found.');
    return [];
  }
  const files = fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith('.bak') && !f.includes('.pre-restore.'))
    .sort()
    .reverse();
  if (files.length === 0) {
    console.log('No .bak backup files found.');
    return [];
  }
  console.log(`\nAvailable backups in ${backupDir}:\n`);
  files.forEach((f, i) => {
    const stat = fs.statSync(path.join(backupDir, f));
    const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
    console.log(`  ${i + 1}. ${f}  (${sizeMB} MB)`);
  });
  console.log('');
  return files.map((f) => path.join(backupDir, f));
}

async function confirm(msg) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(
      `${msg}\nType RESTORE LOCAL DISPOSABLE to continue: `,
      (answer) => {
        rl.close();
        resolve(answer === 'RESTORE LOCAL DISPOSABLE');
      },
    );
  });
}

function omitRedundantPublicSchema(restoreList) {
  return restoreList
    .split(/(?<=\n)/u)
    .map((line) =>
      /\bSCHEMA - public\b/u.test(line) && !line.startsWith(';')
        ? `;${line}`
        : line,
    )
    .join('');
}

async function main() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
  }

  if (process.argv.includes('--list') || process.argv.includes('-l')) {
    listBackups();
    process.exit(0);
  }

  let backupFile = process.argv[2];
  if (!backupFile) {
    console.error('Usage: node scripts/db-restore.js <backup-file.bak>');
    console.error('       node scripts/db-restore.js --list');
    listBackups();
    process.exit(1);
  }

  backupFile = path.resolve(backupFile);
  if (!fs.existsSync(backupFile)) {
    console.error(`❌ File not found: ${backupFile}`);
    process.exit(1);
  }

  if (!fs.existsSync(PG_RESTORE)) {
    console.error(`❌ pg_restore not found at: ${PG_RESTORE}`);
    console.error('   Install PostgreSQL or set PG_BIN_DIR env var.');
    process.exit(1);
  }

  const target = getLocalRestoreTarget();
  const connUrl = target.url;

  console.log(`📄 Backup: ${path.basename(backupFile)}`);
  console.log(
    `   Size: ${(fs.statSync(backupFile).size / (1024 * 1024)).toFixed(2)} MB`,
  );
  console.log(`🎯 Target: ${connUrl.replace(/\/\/.*@/, '//***@')}`);
  console.log('');

  const ok = await confirm(
    `This restores only into empty local database ${target.database}.`,
  );
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  // Keep the password out of the process argument list; only the secret moves
  // to PGPASSWORD; supported connection params stay in the -d URL.
  const parsedRestore = new URL(connUrl);
  const pgPassword = decodeURIComponent(parsedRestore.password);
  parsedRestore.password = '';
  const sanitizedUrl = parsedRestore.toString();

  const { Client } = require('pg');
  const client = new Client({ connectionString: connUrl });
  await client.connect();
  try {
    const result = await client.query(
      `SELECT count(*)::integer AS count
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    if (result.rows[0]?.count !== 0) {
      throw new Error(
        `Restore aborted: local database ${target.database} is not empty. Create a new disposable database.`,
      );
    }
  } finally {
    await client.end();
  }

  const restoreList = execFileSync(PG_RESTORE, ['--list', backupFile], {
    encoding: 'utf8',
    timeout: 60000,
  });
  const listFile = path.join(
    path.dirname(backupFile),
    `.${path.basename(backupFile)}.${process.pid}.restore-list`,
  );
  fs.writeFileSync(listFile, omitRedundantPublicSchema(restoreList), {
    encoding: 'utf8',
    mode: 0o600,
  });

  // Restore
  console.log('🔄 Restoring...');
  try {
    execFileSync(
      PG_RESTORE,
      [
        '-v',
        '--no-owner',
        '--no-privileges',
        '--no-tablespaces',
        `--use-list=${listFile}`,
        '-d',
        sanitizedUrl,
        '--',
        backupFile,
      ],
      {
        stdio: 'inherit',
        timeout: 600000,
        env: { ...process.env, PGPASSWORD: pgPassword },
      },
    );
    console.log('✅ Restore complete.');
  } catch (err) {
    console.error(
      '❌ Restore failed (exit %d):',
      err.status,
      (err.message || '').replace(/postgres:\/\/[^@]+@/g, 'postgres://***@'),
    );
    process.exitCode = 1;
  } finally {
    fs.rmSync(listFile, { force: true });
  }
}

if (require.main === module) {
  void main();
}

module.exports = { getLocalRestoreTarget, omitRedundantPublicSchema };
