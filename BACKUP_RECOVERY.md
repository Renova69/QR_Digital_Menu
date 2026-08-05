# Backup & Recovery

Verified 2026-08-05 directly against the live Neon project (`qr-menu-db`, id `old-fog-33669483`, branch `production` = `br-lingering-mouse-alankxtb`) via the Neon MCP — not assumed from docs.

## Current state

**Neon PITR (point-in-time restore): enabled, 6-hour window.**

`history_retention_seconds: 21600` on the project = 6 hours of WAL history. Within that window you can create a new branch (or reset `production`) to any timestamp/LSN — this is Neon's built-in continuous backup, no extra setup required. **Past 6 hours, PITR cannot recover pre-incident state.** This is almost certainly the Neon Free/Launch tier default; a paid plan tier raises it (up to 7–30 days depending on plan). Check the Neon dashboard's billing/plan page to confirm the current tier and whether a longer window is available without a plan change.

**Manual pre-migration snapshots exist, but are ad hoc.** Two archived branches confirm the team already snapshots before risky changes:

- `backup-pre-refund-migration-2026-07-02` — taken before the refund-attempt migration
- `production-restored-v2` — a restore-in-progress branch from the same period

This is good practice but depends on someone remembering to do it before _each_ risky change — it doesn't cover an incident nobody saw coming (bad deploy, accidental delete, corrupted write) discovered more than 6 hours later.

**Local backup scripts (`apps/backend/scripts/db-backup.js` / `db-restore.js`) are a developer convenience, not a production safety net.** They write unencrypted `pg_dump` output to a local `backups/` folder (gitignored), Windows-only (hardcoded `C:\Program Files\PostgreSQL\...` path), no retention policy, no off-host copy, no monitoring if the scheduled task silently stops running. Do not treat these as covering the >6-hour gap.

## What this means for launch readiness

- **RPO (recovery point objective) today: 6 hours**, assuming someone notices an incident within that window. This is short for a live payment/ordering system — a bad migration discovered the next morning is not recoverable via PITR.
- **RTO (recovery time objective): undemonstrated.** No restore drill has been run against an isolated copy to time how long a real restore takes.

## Recommended next steps (not yet done — needs a decision, not a silent code change)

1. **Check the actual Neon plan** in the dashboard and see what PITR window it allows. If a plan upgrade cheaply buys 7+ days, that closes most of the gap with zero new code.
2. **If staying on the short window**, add a scheduled off-host encrypted backup as a supplement — e.g. a small nightly job (Cloud Run Job or GitHub Action, not a developer's laptop) running `pg_dump` and uploading to R2/S3 with a retention policy. This closes the gap even if a Neon PITR restore is somehow unavailable (region incident, account issue).
3. **Run one restore drill** against an isolated Neon branch or a throwaway project — confirm actual RTO, not assumed RTO. Never restore into `production` as a test.
4. **Alert on backup health** once a scheduled job exists — silent backup failure is worse than no backup, because it creates false confidence.
