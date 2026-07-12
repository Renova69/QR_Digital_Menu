#!/usr/bin/env node
/**
 * db-backup.js — Backup Neon PostgreSQL database to local file using pg_dump.
 *
 * Uses PostgreSQL 18's pg_dump with custom format (-Fc) — compressed,
 * supports parallel restore, includes all constraints/indexes/sequences.
 *
 * Automatically converts pooled Neon URL to direct connection (required
 * by pg_dump — PgBouncer transaction mode blocks SET commands).
 *
 * Usage:
 *   node scripts/db-backup.js                        # auto-named backup
 *   node scripts/db-backup.js --output ./my.bak      # custom path
 *   npm run db:backup
 *
 * Schedule (Windows Task Scheduler): daily at 8 AM via schedule-backup.ps1
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// PostgreSQL 18 tools — may need adjustment if version differs
const PG_BIN =
  process.env.PG_BIN_DIR || 'C:\\Program Files\\PostgreSQL\\18\\bin';
const PG_DUMP = path.join(PG_BIN, 'pg_dump.exe');

function getDirectUrl() {
  const raw = process.env.DATABASE_URL || '';
  if (!raw) throw new Error('DATABASE_URL not set in .env or environment');

  const url = new URL(raw);
  // Pooler: ep-xxx-pooler.c-3.eu-central-1.aws.neon.tech
  // Direct: ep-xxx.c-3.eu-central-1.aws.neon.tech
  url.hostname = url.hostname.replace('-pooler', '');
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('connection_limit');
  url.searchParams.delete('connect_timeout');
  url.searchParams.set('sslmode', 'require');

  return url.toString();
}

function getOutputPath(customPath) {
  if (customPath) return path.resolve(customPath);

  const backupDir = path.resolve(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  return path.join(backupDir, `qr-menu-db-${ts}.bak`);
}

function main() {
  const customOutput =
    process.argv.includes('--output') || process.argv.includes('-o')
      ? process.argv[process.argv.indexOf('--output') + 1] ||
        process.argv[process.argv.indexOf('-o') + 1]
      : null;

  const outputPath = getOutputPath(customOutput);
  const connUrl = getDirectUrl();

  console.log(`🔌 Source: ${connUrl.replace(/\/\/.*@/, '//***@')}`);
  console.log(`💾 Output: ${outputPath}`);

  if (!fs.existsSync(PG_DUMP)) {
    console.error(`❌ pg_dump not found at: ${PG_DUMP}`);
    console.error('   Install PostgreSQL or set PG_BIN_DIR env var.');
    process.exit(1);
  }

  // Keep the password out of the process argument list (visible to any local
  // process / Task Scheduler history). Only the secret moves to PGPASSWORD; all
  // other connection params stay in the -d URL so Neon SSL/channel-binding/
  // pgbouncer options are preserved exactly.
  const parsed = new URL(connUrl);
  const pgPassword = decodeURIComponent(parsed.password);
  parsed.password = '';
  const sanitizedUrl = parsed.toString();

  try {
    execFileSync(PG_DUMP, ['-Fc', '-v', '-d', sanitizedUrl, '-f', outputPath], {
      stdio: 'inherit',
      timeout: 300000,
      env: { ...process.env, PGPASSWORD: pgPassword },
    });

    const sizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
    console.log(`✅ Backup complete: ${sizeMB} MB`);
  } catch (err) {
    console.error(
      '❌ Backup failed:',
      err.message.replace(/postgres:\/\/[^@]+@/g, 'postgres://***@'),
    );
    process.exit(1);
  }
}

main();
