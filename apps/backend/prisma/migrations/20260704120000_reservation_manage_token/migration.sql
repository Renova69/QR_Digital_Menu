-- Feature 2: private self-service token for guest view/modify/cancel links.
-- Additive + idempotent; safe on PgBouncer transaction pooling.
ALTER TABLE "reservation"
    ADD COLUMN IF NOT EXISTS "manageToken" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "reservation_manageToken_key"
    ON "reservation" ("manageToken");
