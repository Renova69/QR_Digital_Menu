-- Durable user-session inventory and revocation.
--
-- Expand-only: the existing JWT columns and passwordChangedAt checks remain
-- intact for the old serving revision. No rows are deleted or rewritten.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "app_user"
  ADD COLUMN IF NOT EXISTS "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "user_session" (
  "id"             TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "authMethod"     TEXT NOT NULL,
  "deviceTokenId"  TEXT,
  "ipAddress"      TEXT,
  "userAgent"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  "revokedAt"      TIMESTAMP(3),
  "revokedReason"  TEXT,

  CONSTRAINT "user_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_session_userId_revokedAt_expiresAt_idx"
  ON "user_session" ("userId", "revokedAt", "expiresAt");

CREATE INDEX IF NOT EXISTS "user_session_expiresAt_idx"
  ON "user_session" ("expiresAt");

ALTER TABLE "user_session"
  ADD CONSTRAINT "user_session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "app_user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- The schema is migrated before the canary revision starts. During that brief
-- overlap the old revision can still mint a JWT without a session id. Accept
-- those legacy tokens only for their existing maximum 24-hour TTL, then make
-- the durable session row mandatory. This timestamp belongs to the database,
-- so staging, restores, and later installations each get the correct window.
CREATE TABLE IF NOT EXISTS "auth_session_rollout" (
  "id"                    INTEGER NOT NULL,
  "legacyAcceptedUntil"   TIMESTAMP(3) NOT NULL,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "auth_session_rollout_pkey" PRIMARY KEY ("id")
);

INSERT INTO "auth_session_rollout" ("id", "legacyAcceptedUntil")
VALUES (1, CURRENT_TIMESTAMP + INTERVAL '24 hours')
ON CONFLICT ("id") DO NOTHING;

COMMIT;
