-- Feature 4: dining duration / turnover time.
-- Additive + idempotent; safe on PgBouncer transaction pooling.
ALTER TABLE "reservation_settings"
    ADD COLUMN IF NOT EXISTS "diningDurationMinutes" INTEGER NOT NULL DEFAULT 90;

ALTER TABLE "reservation_settings"
    ADD COLUMN IF NOT EXISTS "largePartyThreshold" INTEGER NOT NULL DEFAULT 5;

ALTER TABLE "reservation_settings"
    ADD COLUMN IF NOT EXISTS "largePartyDurationMinutes" INTEGER NOT NULL DEFAULT 150;

ALTER TABLE "reservation"
    ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER;
