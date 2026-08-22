-- P1-2: per-account lockout for password login, mirroring the existing PIN
-- lockout (pinAttempts / pinLockedUntil).
--
-- Rate limiting cannot carry this on its own: an anonymous caller is keyed by
-- address, and X-Forwarded-For is caller-controlled on the direct Cloud Run
-- origin, so an attacker rotating the header gets unlimited login attempts.
-- A counter scoped to the account cannot be rotated away.
--
-- Additive and idempotent: two nullable/defaulted columns, no rewrite of
-- existing rows, no lock held beyond the catalog update.
ALTER TABLE "app_user"
  ADD COLUMN IF NOT EXISTS "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "loginLockedUntil" TIMESTAMP(3);
