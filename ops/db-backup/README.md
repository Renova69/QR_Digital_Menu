# Production database backups

The Cloud Run job creates a twice-daily, `public`-schema custom-format
PostgreSQL archive in `gs://qr-menu-db-backups-469216` at 02:15 and 14:15 UTC.

Safety properties:

- `BACKUP_DIRECT_URL` uses the dedicated `qr_menu_backup` database role. It can
  `SELECT` through RLS for complete dumps, but has no application write or
  schema-create privileges and defaults every transaction to read-only.
- The expected Supabase project, host, port, database, and exact
  `qr_menu_backup` role are checked before a dump begins.
- Protected source and archive counts must clear configured production floors.
  The archive must also retain at least 80% of the source snapshot.
- Every `.bak` gets a `.manifest.json` containing counts and a SHA-256 digest.
- The bucket has versioning, seven-day soft delete, public-access prevention,
  and the job service account has no object-delete permission.
- `deploy.ps1` requires a fresh successful backup before applying migrations.
- Production PostgreSQL guards block public table/schema/column drops and table
  truncation; deployment fails if their database-wide event triggers are absent.
- Cloud Monitoring emails on an explicit job failure and when no successful
  execution is recorded for 15 hours.

Provision the role with `create-readonly-role.sql`, store its session-pooler URL
as the `BACKUP_DIRECT_URL` Secret Manager secret, then run `setup.ps1`. Never
bind the privileged `DIRECT_URL` migration secret to the backup job.

Changing a protected floor is an operational approval: first verify the lower
count is an intentional production deletion, then update the value in
`setup.ps1` and redeploy the job. Do not lower a floor merely to make a failed
backup turn green.

Restore drills must target a newly created empty local database whose name
contains `restore`, `drill`, `scratch`, `disposable`, or `test`. The repository
restore helper rejects every remote database and contains no clean/reset path.
Because a schema-scoped dump does not carry database-wide event triggers, a
real disaster recovery must reinstall and verify `ops/db-safety` before any
deployment or migration; `deploy.ps1` enforces that dependency.
