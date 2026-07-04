-- Reservations Phase 1: reservation *requests* decoupled from TableSession.
-- Fully additive.

-- Enums (guarded — CREATE TYPE has no IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReservationStatus') THEN
    CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'NO_SHOW', 'ARRIVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReservationSource') THEN
    CREATE TYPE "ReservationSource" AS ENUM ('PUBLIC', 'STAFF');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReservationOccasion') THEN
    CREATE TYPE "ReservationOccasion" AS ENUM ('NONE', 'BIRTHDAY', 'ANNIVERSARY', 'BUSINESS', 'FAMILY', 'OTHER');
  END IF;
END
$$;

-- reservation_settings (one per restaurant)
CREATE TABLE IF NOT EXISTS "reservation_settings" (
  "id"                     TEXT NOT NULL,
  "restaurantId"           TEXT NOT NULL,
  "enabled"                BOOLEAN NOT NULL DEFAULT false,
  "slotIntervalMinutes"    INTEGER NOT NULL DEFAULT 30,
  "minLeadMinutes"         INTEGER NOT NULL DEFAULT 60,
  "bookingHorizonDays"     INTEGER NOT NULL DEFAULT 60,
  "maxTotalGuests"         INTEGER NOT NULL DEFAULT 12,
  "maxCoversPerSlot"       INTEGER,
  "autoConfirm"            BOOLEAN NOT NULL DEFAULT false,
  "requirePhone"           BOOLEAN NOT NULL DEFAULT true,
  "allergenSectionEnabled" BOOLEAN NOT NULL DEFAULT true,
  "notifyEmail"            TEXT,
  "notifyPhone"            TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reservation_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_settings_restaurantId_key" ON "reservation_settings" ("restaurantId");

-- reservation_service_hours (one window per weekday in Phase 1)
CREATE TABLE IF NOT EXISTS "reservation_service_hours" (
  "id"             TEXT NOT NULL,
  "restaurantId"   TEXT NOT NULL,
  "weekday"        INTEGER NOT NULL,
  "openMinute"     INTEGER NOT NULL,
  "lastSlotMinute" INTEGER NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reservation_service_hours_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_service_hours_restaurantId_weekday_key" ON "reservation_service_hours" ("restaurantId", "weekday");

-- patron (cross-visit staff-only tags, keyed by phone)
CREATE TABLE IF NOT EXISTS "patron" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "phone"        TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "email"        TEXT,
  "staffTags"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "staffNotes"   TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "patron_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "patron_restaurantId_phone_key" ON "patron" ("restaurantId", "phone");
CREATE INDEX IF NOT EXISTS "patron_restaurantId_idx" ON "patron" ("restaurantId");

-- reservation
CREATE TABLE IF NOT EXISTS "reservation" (
  "id"                  TEXT NOT NULL,
  "restaurantId"        TEXT NOT NULL,
  "patronId"            TEXT,
  "referenceCode"       TEXT NOT NULL,
  "source"              "ReservationSource" NOT NULL DEFAULT 'PUBLIC',
  "status"              "ReservationStatus" NOT NULL DEFAULT 'PENDING',
  "guestName"           TEXT NOT NULL,
  "guestPhone"          TEXT NOT NULL,
  "guestEmail"          TEXT,
  "startsAt"            TIMESTAMP(3) NOT NULL,
  "occasion"            "ReservationOccasion" NOT NULL DEFAULT 'NONE',
  "adultsCount"         INTEGER NOT NULL,
  "childrenCount"       INTEGER NOT NULL DEFAULT 0,
  "customerNotes"       TEXT,
  "internalNotes"       TEXT,
  "customerPreferences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "allergyNotes"        TEXT,
  "dietaryConsentAt"    TIMESTAMP(3),
  "idempotencyKey"      TEXT,
  "createdById"         TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reservation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_restaurantId_referenceCode_key" ON "reservation" ("restaurantId", "referenceCode");
CREATE UNIQUE INDEX IF NOT EXISTS "reservation_restaurantId_idempotencyKey_key" ON "reservation" ("restaurantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "reservation_restaurantId_startsAt_idx" ON "reservation" ("restaurantId", "startsAt");
CREATE INDEX IF NOT EXISTS "reservation_restaurantId_status_startsAt_idx" ON "reservation" ("restaurantId", "status", "startsAt");
CREATE INDEX IF NOT EXISTS "reservation_patronId_idx" ON "reservation" ("patronId");

-- reservation_event (append-only audit)
CREATE TABLE IF NOT EXISTS "reservation_event" (
  "id"            TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "type"          TEXT NOT NULL,
  "actorUserId"   TEXT,
  "metadata"      JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reservation_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "reservation_event_reservationId_createdAt_idx" ON "reservation_event" ("reservationId", "createdAt");

-- Foreign keys (guarded)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservation_settings_restaurantId_fkey') THEN
    ALTER TABLE "reservation_settings" ADD CONSTRAINT "reservation_settings_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservation_service_hours_restaurantId_fkey') THEN
    ALTER TABLE "reservation_service_hours" ADD CONSTRAINT "reservation_service_hours_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patron_restaurantId_fkey') THEN
    ALTER TABLE "patron" ADD CONSTRAINT "patron_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservation_restaurantId_fkey') THEN
    ALTER TABLE "reservation" ADD CONSTRAINT "reservation_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservation_patronId_fkey') THEN
    ALTER TABLE "reservation" ADD CONSTRAINT "reservation_patronId_fkey"
      FOREIGN KEY ("patronId") REFERENCES "patron"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservation_event_reservationId_fkey') THEN
    ALTER TABLE "reservation_event" ADD CONSTRAINT "reservation_event_reservationId_fkey"
      FOREIGN KEY ("reservationId") REFERENCES "reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
