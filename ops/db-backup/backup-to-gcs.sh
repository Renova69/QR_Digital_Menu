#!/usr/bin/env bash
#
# Dump the Supabase database, prove the protected application data is present
# in both the source and the archive, then upload it with a verification
# manifest.
#
# The verification is not ceremony. Two zero-byte .bak files sat in the local
# backups directory for a fortnight looking like real backups, because
# pg_dump's exit code was the only thing ever checked. An unusable artifact is
# worse than no artifact: it is what you reach for during an incident.
#
# Required env:
#   DIRECT_URL   dedicated read-only Supabase session-pooler URL (Secret Manager)
#   BACKUP_BUCKET  gs:// destination bucket name, no scheme
#
set -euo pipefail

: "${DIRECT_URL:?DIRECT_URL is not set}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set}"
: "${BACKUP_EXPECTED_PROJECT_REF:?BACKUP_EXPECTED_PROJECT_REF is not set}"
: "${BACKUP_EXPECTED_DATABASE:?BACKUP_EXPECTED_DATABASE is not set}"

# A custom-format dump of this schema alone is tens of KB before any rows.
# Anything smaller did not complete, whatever the exit code said.
MIN_PLAUSIBLE_BYTES=$((50 * 1024))

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
object_path="$(date -u +%Y/%m)/qr-menu-db-${timestamp}.bak"
manifest_path="${object_path%.bak}.manifest.json"
dump_file="/tmp/qr-menu-db-${timestamp}.bak"
manifest_file="/tmp/qr-menu-db-${timestamp}.manifest.json"
source_snapshot="/tmp/qr-menu-db-${timestamp}.source-counts.json"
conn_file="/tmp/qr-menu-db-${timestamp}.url"
password_file="/tmp/qr-menu-db-${timestamp}.password"
safety_script="${BACKUP_SAFETY_SCRIPT:-/usr/local/bin/backup_safety.py}"

cleanup() {
  rm -f "$dump_file" "$manifest_file" "$source_snapshot" \
    "$conn_file" "$password_file"
}
trap cleanup EXIT

# Never let the password reach the process list or the logs. The safety helper
# reads DIRECT_URL from its environment, validates the expected Supabase
# project/database/host, and writes the password to a mode-0600 temporary file.
# pg_dump and psql then read it only from PGPASSWORD.
#
# The host is used exactly as DIRECT_URL gives it. That secret is already the
# endpoint migrations run against -- Supabase's session-mode pooler on :5432 --
# and session mode gives pg_dump the real session it needs. (An earlier version
# stripped a "-pooler" suffix, which was Neon-specific: there the pooled host
# ran PgBouncer in transaction mode and rejected pg_dump's SET commands. On
# Supabase that rewrite would point at a host that does not exist.)
#
# Only transaction-pooling flags are dropped, since pg_dump rejects them.
python3 "$safety_script" prepare-connection \
  --url-file "$conn_file" \
  --password-file "$password_file"

conn_url="$(cat "$conn_file")"
PGPASSWORD="$(cat "$password_file")"
export PGPASSWORD
rm -f "$conn_file" "$password_file"

# This is the guard the old job lacked. A readable 184 KB archive from an
# emptied database passed the former 50 KB check. These source floors make an
# empty or wrong database fail before pg_dump and before any object is uploaded.
python3 "$safety_script" verify-source \
  --connection-url "$conn_url" \
  --snapshot-file "$source_snapshot"

# --schema=public: this application owns only `public`. A whole-database dump on
# Supabase also drags in its managed auth/storage/realtime schemas (87 tables
# instead of 53), which collide with the managed schemas of whatever project you
# restore into. Scoping to public keeps the artifact restorable anywhere,
# including plain Postgres.
echo "Dumping ${conn_url%%\?*} (schema: public)"
pg_dump -Fc --schema=public -d "$conn_url" -f "$dump_file"

size="$(stat -c %s "$dump_file")"
if [ "$size" -lt "$MIN_PLAUSIBLE_BYTES" ]; then
  echo "FAILED: dump is implausibly small (${size} bytes, expected >= ${MIN_PLAUSIBLE_BYTES})" >&2
  rm -f "$dump_file"
  exit 1
fi

# Parses the archive's table of contents without touching a database -- the
# cheapest real proof that the bytes on disk are a readable custom-format
# archive. It does not prove the dump is semantically correct; only a restore
# drill does that.
if ! pg_restore --list "$dump_file" > /dev/null; then
  echo "FAILED: not a readable custom-format archive" >&2
  rm -f "$dump_file"
  exit 1
fi

# Read the actual COPY streams for protected tables without logging row data.
# The archive must meet every configured floor and retain at least 80% of the
# pre-dump source snapshot. The manifest preserves counts + checksum as proof.
python3 "$safety_script" verify-archive \
  --archive "$dump_file" \
  --snapshot-file "$source_snapshot" \
  --manifest-file "$manifest_file"

echo "Verified ${size} bytes and protected data, uploading to gs://${BACKUP_BUCKET}/${object_path}"
gcloud storage cp "$dump_file" "gs://${BACKUP_BUCKET}/${object_path}"
gcloud storage cp "$manifest_file" "gs://${BACKUP_BUCKET}/${manifest_path}"

echo "Backup complete: gs://${BACKUP_BUCKET}/${object_path} (${size} bytes)"
echo "Verification manifest: gs://${BACKUP_BUCKET}/${manifest_path}"
