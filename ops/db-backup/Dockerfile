# Twice-daily Supabase -> GCS backup job.
#
# google/cloud-sdk:slim gives `gcloud storage`, which handles retries and
# resumable uploads properly. The Postgres client comes from PGDG rather than
# Debian's default, because pg_dump must be at least the server's major
# version and Supabase runs 17 -- a 15 client fails with
# "server version mismatch" and leaves nothing behind.
FROM google/cloud-sdk:slim

ARG PG_MAJOR=17

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends "postgresql-client-${PG_MAJOR}" \
 && rm -rf /var/lib/apt/lists/*

COPY backup-to-gcs.sh /usr/local/bin/backup-to-gcs.sh
COPY backup_safety.py /usr/local/bin/backup_safety.py
# Cloud Build contexts are often prepared from Windows worktrees. Normalise
# line endings here as a second boundary so `#!/usr/bin/env bash` can never
# become `bash\r` even if a checkout ignores .gitattributes.
RUN sed -i 's/\r$//' /usr/local/bin/backup-to-gcs.sh /usr/local/bin/backup_safety.py \
 && chmod +x /usr/local/bin/backup-to-gcs.sh /usr/local/bin/backup_safety.py

ENTRYPOINT ["/usr/local/bin/backup-to-gcs.sh"]
