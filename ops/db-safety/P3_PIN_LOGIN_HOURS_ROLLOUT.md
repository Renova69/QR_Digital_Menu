# P3-7 PIN-login-hours migration evidence

Migration: `20260829120000_add_pin_login_hours`

- **Phase:** expand.
- **Old app + new schema:** yes. The previous revision ignores both nullable
  columns.
- **New app + old schema:** no. The backend selects the new fields, so migrations
  must run before the new revision receives traffic.
- **Affected rows / lock estimate:** zero row updates and no backfill. The
  `restaurant` table receives two nullable `TEXT` columns. PostgreSQL takes the
  normal table lock for additive column metadata; acquisition is bounded by a
  five-second lock timeout and the transaction by a 30-second statement timeout.
- **Backfill resumability:** not applicable. Existing rows remain NULL/NULL and
  therefore unrestricted.
- **Pre-migration invariant:** the migration chain is intact and either both
  columns are absent or a previous partial attempt left only additive nullable
  state.
- **Post-migration invariant:** both columns exist, are nullable, and all
  pre-existing restaurants retain NULL/NULL unless changed later by an owner.
- **Forward recovery:** add either missing nullable column in a new reviewed
  forward migration, then redeploy. Never remove ledger rows or reset the
  database.
- **Application rollback:** safe while both additive columns remain. The old
  application does not read them.
- **Staging:** the approved no-real-data development exception remains active;
  exact-SHA isolated staging proof is a pre-real-traffic gate.

Deployment order is backend preflight and verified backup, migration safety
checks, `prisma migrate deploy`, post-migration verification, no-traffic backend
canary, traffic shift, then frontend. No migration or live database command was
run while preparing this branch.
