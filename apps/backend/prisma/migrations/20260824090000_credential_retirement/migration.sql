-- P2-10: retire stale credentials without ever interrupting service.
--
-- All columns are nullable with no default and no backfill, so every existing
-- token keeps working exactly as before. Retirement only begins for tokens the
-- sweep subsequently marks, and device trust only begins for enrolments that
-- set it.
--
-- Additive: two nullable columns on each table plus one index. No rewrite of
-- existing rows, no lock held beyond the catalog update.

-- Print agents retire on INACTIVITY, never on a calendar. A fixed expiry would
-- stop kitchen tickets mid-service; a token unseen for months is on a device
-- that is gone.
ALTER TABLE "print_agent_token"
  ADD COLUMN IF NOT EXISTS "staleWarnedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "quarantinedAt" TIMESTAMP(3);

-- Supports the sweep, which orders by how long a token has been unseen.
CREATE INDEX IF NOT EXISTS "print_agent_token_lastSeenAt_idx"
  ON "print_agent_token" ("lastSeenAt");

-- Separate from `expiresAt`, which gates the one-time enrolment link. This is
-- how long the device stays trusted to accept a 4-digit PIN afterwards.
-- NULL means "trusted indefinitely", which is what every device enrolled before
-- this migration already was -- nothing is un-trusted retroactively.
ALTER TABLE "device_enrollment_token"
  ADD COLUMN IF NOT EXISTS "deviceTrustExpiresAt" TIMESTAMP(3);
