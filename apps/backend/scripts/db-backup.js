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
const PG_RESTORE = path.join(PG_BIN, 'pg_restore.exe');

// A custom-format dump of this schema alone is tens of KB before any rows.
// Anything smaller than this did not complete, whatever pg_dump's exit code
// said. Two zero-byte files sat in backups/ for a fortnight looking like real
// backups because nothing ever inspected the artifact.
const MIN_PLAUSIBLE_BYTES = 50 * 1024;

function getDirectUrl(raw = process.env.DATABASE_URL || '') {
  if (!raw) throw new Error('DATABASE_URL not set in .env or environment');

  const url = new URL(raw);
  // Pooler: ep-xxx-pooler.c-3.eu-central-1.aws.neon.tech
  // Direct: ep-xxx.c-3.eu-central-1.aws.neon.tech
  url.hostname = url.hostname.replace('-pooler', '');
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('connection_limit');
  url.searchParams.delete('connect_timeout');
  url.searchParams.delete('pool_timeout');
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

/**
 * Prove the file on disk is actually a restorable dump, not just a file that
 * exists. pg_dump exiting 0 is necessary but not sufficient — a dump
 * interrupted mid-write, or one whose output was never flushed, still leaves
 * something behind. `pg_restore --list` parses the archive's table of contents
 * without touching a database, which is the cheapest real proof available.
 *
 * This is not a restore drill. It catches a corrupt artifact, not a dump that
 * is internally valid but semantically wrong; only restoring into a scratch
 * database proves that, and that belongs in a scheduled drill.
 */
function verifyArtifact(outputPath) {
  if (!fs.existsSync(outputPath)) {
    throw new Error('pg_dump reported success but produced no file');
  }

  const { size } = fs.statSync(outputPath);
  if (size < MIN_PLAUSIBLE_BYTES) {
    throw new Error(
      `dump is implausibly small (${size} bytes, expected at least ` +
        `${MIN_PLAUSIBLE_BYTES}) — treating as a failed backup`,
    );
  }

  if (!fs.existsSync(PG_RESTORE)) {
    console.warn(
      `⚠️  pg_restore not found at ${PG_RESTORE} — skipping archive ` +
        'integrity check. Size looked plausible, but the archive was not read.',
    );
    return;
  }

  try {
    execFileSync(PG_RESTORE, ['--list', outputPath], {
      stdio: 'pipe',
      timeout: 60000,
    });
  } catch {
    throw new Error(
      'dump is not a readable custom-format archive (pg_restore --list failed)',
    );
  }
}

function discardArtifact(outputPath) {
  try {
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
      console.error(`   Removed unusable artifact: ${outputPath}`);
    }
  } catch (unlinkErr) {
    console.error(
      `   Could not remove unusable artifact ${outputPath}: ${unlinkErr.message}`,
    );
  }
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
  // supported connection params stay in the -d URL so Neon SSL and channel
  // binding options are preserved.
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

    verifyArtifact(outputPath);

    const sizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
    console.log(`✅ Backup complete and verified: ${sizeMB} MB`);
  } catch (err) {
    console.error(
      '❌ Backup failed:',
      err.message.replace(/postgres:\/\/[^@]+@/g, 'postgres://***@'),
    );
    // Remove the partial file. A truncated or empty .bak left on disk is worse
    // than no file at all: it reads as a successful backup to anyone glancing
    // at the directory, and it is the thing you reach for in an incident.
    discardArtifact(outputPath);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { getDirectUrl, verifyArtifact, discardArtifact };
