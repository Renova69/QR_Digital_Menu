-- Preset catalog key on table zones (translatable seating zones).
-- Additive + idempotent; safe on PgBouncer transaction pooling.
ALTER TABLE "table_zone"
    ADD COLUMN IF NOT EXISTS "zoneKey" TEXT;
