-- Feature 1: guest notification preferences + 24h reminder dedup.
-- Additive + idempotent; safe on PgBouncer transaction pooling.
ALTER TABLE "reservation"
    ADD COLUMN IF NOT EXISTS "notifyByEmail" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "reservation"
    ADD COLUMN IF NOT EXISTS "notifyBySms" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "reservation"
    ADD COLUMN IF NOT EXISTS "reminderSentAt" TIMESTAMP(3);
