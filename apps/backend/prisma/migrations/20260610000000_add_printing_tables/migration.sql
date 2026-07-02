-- The printing tables pre-date the original migration baseline but were not
-- represented in it. Keep this bridge idempotent: existing installations
-- already have these objects, while a clean database needs them before
-- 20260611000000_schema_safety_constraints alters print_job.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrintJobStatus') THEN
    CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'SENT', 'PRINTED', 'FAILED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "print_station" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "printerIp" TEXT NOT NULL,
  "printerPort" INTEGER NOT NULL DEFAULT 9100,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "receiptTemplate" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "print_station_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "print_agent_token" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "printStationId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "label" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "print_agent_token_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "print_job" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "printStationId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "ticketBase64" TEXT NOT NULL,
  "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "lastAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "print_job_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "menu_category"
  ADD COLUMN IF NOT EXISTS "printStationId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "print_station_restaurantId_name_key"
  ON "print_station"("restaurantId", "name");
CREATE INDEX IF NOT EXISTS "print_station_restaurantId_idx"
  ON "print_station"("restaurantId");
CREATE UNIQUE INDEX IF NOT EXISTS "print_agent_token_token_key"
  ON "print_agent_token"("token");
CREATE INDEX IF NOT EXISTS "print_agent_token_restaurantId_idx"
  ON "print_agent_token"("restaurantId");
CREATE INDEX IF NOT EXISTS "print_job_printStationId_status_idx"
  ON "print_job"("printStationId", "status");
CREATE INDEX IF NOT EXISTS "print_job_restaurantId_status_idx"
  ON "print_job"("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "print_job_status_createdAt_idx"
  ON "print_job"("status", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_station_restaurantId_fkey'
  ) THEN
    ALTER TABLE "print_station"
      ADD CONSTRAINT "print_station_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_agent_token_printStationId_fkey'
  ) THEN
    ALTER TABLE "print_agent_token"
      ADD CONSTRAINT "print_agent_token_printStationId_fkey"
      FOREIGN KEY ("printStationId") REFERENCES "print_station"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_agent_token_restaurantId_fkey'
  ) THEN
    ALTER TABLE "print_agent_token"
      ADD CONSTRAINT "print_agent_token_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_job_restaurantId_fkey'
  ) THEN
    ALTER TABLE "print_job"
      ADD CONSTRAINT "print_job_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_job_printStationId_fkey'
  ) THEN
    ALTER TABLE "print_job"
      ADD CONSTRAINT "print_job_printStationId_fkey"
      FOREIGN KEY ("printStationId") REFERENCES "print_station"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'print_job_orderId_fkey'
  ) THEN
    ALTER TABLE "print_job"
      ADD CONSTRAINT "print_job_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "customer_order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_category_printStationId_fkey'
  ) THEN
    ALTER TABLE "menu_category"
      ADD CONSTRAINT "menu_category_printStationId_fkey"
      FOREIGN KEY ("printStationId") REFERENCES "print_station"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
