-- Feature 3: guest preferred seating zone (soft hint, stored as zone name).
-- Additive + idempotent; safe on PgBouncer transaction pooling.
ALTER TABLE "reservation"
    ADD COLUMN IF NOT EXISTS "preferredZone" TEXT;
