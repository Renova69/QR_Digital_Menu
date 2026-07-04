-- Feature 5: reservation blackout days (owner-declared closed dates).
-- Additive + idempotent; safe on PgBouncer transaction pooling.
CREATE TABLE IF NOT EXISTS "reservation_blackout" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reservation_blackout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "reservation_blackout_restaurantId_date_key"
    ON "reservation_blackout" ("restaurantId", "date");

CREATE INDEX IF NOT EXISTS "reservation_blackout_restaurantId_idx"
    ON "reservation_blackout" ("restaurantId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'reservation_blackout_restaurantId_fkey'
    ) THEN
        ALTER TABLE "reservation_blackout"
            ADD CONSTRAINT "reservation_blackout_restaurantId_fkey"
            FOREIGN KEY ("restaurantId") REFERENCES "restaurant" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
