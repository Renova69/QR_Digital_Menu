#!/usr/bin/env bash
#
# Dump the Neon database, prove the artifact is restorable, then upload it.
#
# The verification is not ceremony. Two zero-byte .bak files sat in the local
# backups directory for a fortnight looking like real backups, because
# pg_dump's exit code was the only thing ever checked. An unusable artifact is
# worse than no artifact: it is what you reach for during an incident.
#
# Required env:
#   DIRECT_URL   unpooled Neon connection string (Secret Manager)
#   BACKUP_BUCKET  gs:// destination bucket name, no scheme
#
set -euo pipefail

: "${DIRECT_URL:?DIRECT_URL is not set}"
: "${BACKUP_BUCKET:?BACKUP_BUCKET is not set}"

# A custom-format dump of this schema alone is tens of KB before any rows.
# Anything smaller did not complete, whatever the exit code said.
MIN_PLAUSIBLE_BYTES=$((50 * 1024))

timestamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
object_path="$(date -u +%Y/%m)/qr-menu-db-${timestamp}.bak"
dump_file="/tmp/qr-menu-db-${timestamp}.bak"

# Never let the password reach the process list or the logs. pg_dump reads it
# from PGPASSWORD; everything else stays in the URL so sslmode and channel
# binding are preserved.
#
# The host is used exactly as DIRECT_URL gives it. That secret is already the
# endpoint migrations run against -- Supabase's session-mode pooler on :5432 --
# and session mode gives pg_dump the real session it needs. (An earlier version
# stripped a "-pooler" suffix, which was Neon-specific: there the pooled host
# ran PgBouncer in transaction mode and rejected pg_dump's SET commands. On
# Supabase that rewrite would point at a host that does not exist.)
#
# Only the transaction-pooling flags are dropped, since they are meaningless to
# pg_dump and it errors on unknown keywords.
python3 - "$DIRECT_URL" <<'PY' > /tmp/conn
import sys
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode, unquote

url = urlsplit(sys.argv[1])
netloc = url.username or ""
if netloc:
    netloc += "@"
netloc += url.hostname or ""
if url.port:
    netloc += f":{url.port}"

query = [(k, v) for k, v in parse_qsl(url.query) if k not in
         {"pgbouncer", "connection_limit", "pool_timeout"}]
if not any(k == "sslmode" for k, _ in query):
    query.append(("sslmode", "require"))

print(urlunsplit((url.scheme, netloc, url.path, urlencode(query), "")))
print(unquote(url.password or ""))
PY

conn_url="$(sed -n '1p' /tmp/conn)"
PGPASSWORD="$(sed -n '2p' /tmp/conn)"
export PGPASSWORD
rm -f /tmp/conn

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

echo "Verified ${size} bytes, uploading to gs://${BACKUP_BUCKET}/${object_path}"
gcloud storage cp "$dump_file" "gs://${BACKUP_BUCKET}/${object_path}"
rm -f "$dump_file"

echo "Backup complete: gs://${BACKUP_BUCKET}/${object_path} (${size} bytes)"
