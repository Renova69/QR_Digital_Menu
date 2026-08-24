-- Persist the rollout grace period instead of deriving it from a date compiled
-- into application code.
--
-- A hardcoded enforcement date is wrong in every environment except the one it
-- was written for: staging, a fresh self-host, or a restore from backup all
-- inherit a window that started before their data existed. Writing the dates
-- here means each database carries its own correct timeline, and application
-- logic contains no calendar at all.

-- ---------------------------------------------------------------------------
-- Print agents: when this token first becomes eligible for quarantine.
-- ---------------------------------------------------------------------------
ALTER TABLE "print_agent_token"
  ADD COLUMN IF NOT EXISTS "stalenessEnforcedAt" TIMESTAMP(3);

-- Every token that already exists gets a full 90-day warning window starting
-- now. These carry a lastSeenAt from before it was recorded meaningfully, so
-- judging them immediately would revoke working printers with no notice.
UPDATE "print_agent_token"
   SET "stalenessEnforcedAt" = NOW() + INTERVAL '90 days'
 WHERE "stalenessEnforcedAt" IS NULL;

-- ---------------------------------------------------------------------------
-- Staff devices: give already-enrolled tablets a real expiry rather than
-- leaving NULL to mean "trusted forever".
-- ---------------------------------------------------------------------------
-- Only devices that actually completed enrolment. An unused enrolment link is
-- governed by its own short expiresAt and must not be granted 180 days of trust
-- it never earned.
UPDATE "device_enrollment_token"
   SET "deviceTrustExpiresAt" = NOW() + INTERVAL '180 days'
 WHERE "deviceTrustExpiresAt" IS NULL
   AND "usedAt" IS NOT NULL
   AND "revokedAt" IS NULL;

-- Supports the sweep's enforcement filter.
CREATE INDEX IF NOT EXISTS "print_agent_token_stalenessEnforcedAt_idx"
  ON "print_agent_token" ("stalenessEnforcedAt");
