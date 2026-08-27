# Forward-only migration and recovery policy

**Policy date:** 27 August 2026
**Scope:** Every Prisma schema change, migration, data backfill, and production
database recovery action.

The production database is durable application state. A deployment may move
that state forward; it must never assume that rolling the application image
back also rolls the database back.

## Non-negotiable rules

1. **Migrations are forward-only.** Never edit or delete a migration that has
   been applied to any shared environment. Repair it with a new migration.
2. **No executable down scripts are stored beside migrations.** A generic
   reversal can discard rows written after deployment and creates a convenient
   production data-loss path. Every migration instead carries a reviewed
   recovery plan using the template below.
3. **Application rollback is allowed only while the expanded schema remains
   compatible with the previous revision.** Database rollback is not part of a
   normal deploy.
4. **Production reset, schema push, broad delete, truncate, and destructive
   restore are prohibited.** Disaster recovery is a separate, owner-authorized
   procedure using a fresh verified backup and an independently reviewed
   one-off command.
5. **Applied migration history is evidence.** Do not delete ledger rows, change
   checksums to hide drift, or mark a migration applied until the database has
   been proved to match it.

These rules intentionally supersede the original audit suggestion to write a
rollback script beside every migration. The safer deliverable is a
forward-recovery plan plus a compatibility window, not reusable destructive
SQL.

## Required expand-contract sequence

### 1. Expand

Add only structures that both the serving revision and the new revision can
tolerate:

- new nullable columns or columns with safe defaults;
- new tables, indexes, constraints that do not invalidate existing rows;
- additive enum values where all active readers tolerate them;
- compatibility reads or dual writes when data moves between shapes.

The migration must bound lock acquisition where practical and must fail before
changing data if its preconditions are not satisfied.

### 2. Deploy compatibility code

Deploy code that works with the expanded schema while the previous revision is
still serving. The old revision must remain a valid Cloud Run rollback target.
Do not remove old reads or writes in this release.

### 3. Backfill and verify

Backfills must be deterministic, idempotent, and scoped. Record:

- expected row count and runtime;
- batching or lock strategy for a large table;
- the invariant query that proves completion;
- what happens if the operation stops halfway;
- whether newly arriving writes are covered during the backfill.

Prefer a separate resumable job for a large backfill. A small migration-time
backfill is acceptable only when its data volume and lock behavior are known.

### 4. Contract later

Remove the old shape only in a later release after telemetry and invariant
checks prove that no serving or rollback revision depends on it. Contract work
is not an exception to the repository's destructive-SQL gate. If removal is
ever genuinely required, it needs a separately authorized design that retains
or archives data; do not weaken the gate in an ordinary feature PR.

## Migration PR evidence

Every PR containing a migration must state:

- **Phase:** expand, backfill, compatibility, or contract.
- **Compatibility:** whether old app/new schema and new app/old schema work.
- **Data impact:** affected tables, estimated rows, locks, and runtime.
- **Recovery:** the forward corrective action and whether application rollback
  remains safe.
- **Verification:** exact invariants or read paths checked before and after.
- **Deployment:** ordering of migration, backend, frontend, jobs, and traffic.
- **Staging:** exact-SHA proof when the pre-launch staging gate is active; while
  the approved development exception is in use, record the explicit exception.

Use this template in the PR description:

```text
Migration phase:
Old app + new schema:
New app + old schema:
Affected rows / lock estimate:
Backfill resumability:
Pre-migration invariant:
Post-migration invariant:
Forward recovery migration:
Application rollback safe until:
Staging proof or approved development exception:
```

## Normal release path

The repository already enforces most of this sequence:

1. CI rejects destructive migration SQL and runs the migration chain against a
   fresh database.
2. `deploy.ps1` verifies the exact `main` commit and green CI.
3. Once activated for real traffic, isolated staging must prove the same commit,
   migration digest, and image digest. During the current no-real-data
   development period, bypassing this proof requires the explicit
   `-DevelopmentWithoutStaging` switch.
4. Deployment creates and verifies a pre-migration backup.
5. Migration integrity, the production target, database loss guards, and
   domain invariants are verified before `prisma migrate deploy`.
6. Post-migration verification runs before a no-traffic canary is created.
7. Traffic moves only after the tagged canary passes its smoke test.

The pre-migration backup is a disaster-recovery asset, not the first response
to an application defect.

## Failure handling

### Failure before a migration starts

Stop. Leave the serving revision and database unchanged. Fix the code or
migration in a new commit and rerun CI.

### Migration command fails

1. Do not rerun blindly and do not deploy application traffic.
2. Preserve the migration output and inspect `_prisma_migrations` plus the
   actual schema to determine whether any statement committed.
3. Take a fresh safety snapshot of the current state before repair.
4. Prefer a new forward corrective migration that makes the partial state match
   the intended schema.
5. Use `prisma migrate resolve` only after review proves the exact ledger state:
   - `--rolled-back` is valid only when the failed migration left none of its
     intended changes behind, or those changes were safely reversed by a
     reviewed one-off repair;
   - `--applied` is valid only when independent schema checks prove every
     statement and invariant already holds.
6. Rerun integrity and post-migration verification before creating a revision.

Never remove a failed ledger row to make Prisma continue. Never change an
already published migration to make its checksum fit the database.

### Migration succeeds but the new application fails

If the migration was additive and the previous revision is still compatible,
keep or restore traffic to that revision and ship a forward code fix. If the
previous revision is not compatible, the migration violated this policy: stop
traffic changes and write a forward compatibility repair before proceeding.

### Defect found after new writes occur

Do not run a down migration. New rows may exist only in the expanded shape.
Disable the affected feature if necessary, preserve all data, and ship a
forward code or schema correction.

### Suspected corruption or data loss

Freeze deploys and writers where operationally safe, take a current snapshot,
identify the loss window, and verify candidate backups without restoring over
the database. A production restore requires explicit owner authorization and a
reviewed one-off runbook. The repository intentionally provides no automated
remote restore/reset path.

## Prohibited shortcuts

- `prisma migrate reset` against any shared or remote database;
- `prisma db push` against any shared or remote database;
- direct edits to applied migration files or `_prisma_migrations` rows;
- treating a successful `migrate deploy` as proof of full schema parity;
- using the pre-migration backup to erase legitimate post-deploy writes;
- bypassing the destructive-SQL scanner or production database guards in an
  ordinary deployment.

See [README.md](./README.md) for the independent PostgreSQL loss guards and
[`ops/db-backup/README.md`](../db-backup/README.md) for backup verification.
