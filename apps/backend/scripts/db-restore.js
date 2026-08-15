#!/usr/bin/env node
/**
 * db-restore.js — Restore Neon PostgreSQL database from local pg_dump backup.
 *
 * Uses PostgreSQL 18's pg_restore with --no-owner (required for Neon —
 * neon_superuser can't run ALTER OWNER) and --clean --if-exists.
 *
 * ⚠️  DESTRUCTIVE — drops and recreates all tables, then restores data.
 * A safety backup is automatically created before restoring.
 *
 * Usage:
 *   node scripts/db-restore.js ./backups/qr-menu-db-2026-07-09_16-00-00.bak
 *   node scripts/db-restore.js --list                      # list backups
 *   FORCE_RESTORE=true node scripts/db-restore.js ...      # skip confirm
 *   npm run db:restore -- ./backups/file.bak
 *   npm run db:backups
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const PG_BIN =
  process.env.PG_BIN_DIR || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PG_RESTORE = path.join(PG_BIN, 'pg_restore.exe');

function getDirectUrl(raw = process.env.DATABASE_URL || '') {
  if (!raw) throw new Error('DATABASE_URL not set in .env or environment');
  const url = new URL(raw);
  url.hostname = url.hostname.replace('-pooler', '');
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('connection_limit');
  url.searchParams.delete('connect_timeout');
  url.searchParams.delete('pool_timeout');
  url.searchParams.set('sslmode', 'require');
  return url.toString();
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
  if (process.env.FORCE_RESTORE === 'true') return true;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${msg} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

async function main() {
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

  const connUrl = getDirectUrl();

  console.log(`📄 Backup: ${path.basename(backupFile)}`);
  console.log(
    `   Size: ${(fs.statSync(backupFile).size / (1024 * 1024)).toFixed(2)} MB`,
  );
  console.log(`🎯 Target: ${connUrl.replace(/\/\/.*@/, '//***@')}`);
  console.log('');

  const ok = await confirm(
    '⚠️  This will DROP and recreate ALL tables. Data will be replaced. Continue?',
  );
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  // Safety backup
  console.log('📦 Creating safety backup of current state...');
  const backupScript = path.resolve(__dirname, 'db-backup.js');
  try {
    execFileSync(
      'node',
      [backupScript, '--output', `${backupFile}.pre-restore.bak`],
      { stdio: 'inherit', timeout: 300000 },
    );
  } catch (e) {
    console.error('❌ Pre-restore backup failed. Aborting.');
    process.exit(1);
  }

  // Keep the password out of the process argument list; only the secret moves
  // to PGPASSWORD; supported connection params stay in the -d URL.
  const parsedRestore = new URL(connUrl);
  const pgPassword = decodeURIComponent(parsedRestore.password);
  parsedRestore.password = '';
  const sanitizedUrl = parsedRestore.toString();

  // Restore
  console.log('🔄 Restoring...');
  try {
    execFileSync(
      PG_RESTORE,
      [
        '-v',
        '--no-owner',
        '--no-privileges',
        '--clean',
        '--if-exists',
        '--no-tablespaces',
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
    // pg_restore exit codes: 0=success, 1=non-fatal warnings (OK),
    // 2=fatal error, 3=fatal+warnings. Exit 1 is safe.
    if (err.status === 1) {
      console.log('✅ Restore complete (non-fatal warnings only).');
    } else {
      console.error(
        '❌ Restore failed (exit %d):',
        err.status,
        (err.message || '').replace(/postgres:\/\/[^@]+@/g, 'postgres://***@'),
      );
      console.error(
        '   Pre-restore backup saved at:',
        `${backupFile}.pre-restore.bak`,
      );
      process.exit(1);
    }
  }
}

if (require.main === module) {
  void main();
}

module.exports = { getDirectUrl };
