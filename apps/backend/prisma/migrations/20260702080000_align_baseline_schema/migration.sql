-- Forward-only repair for objects that existed in the live database through
-- earlier db-push/manual evolution but were absent from the migration history.
-- Every operation is idempotent so this is a no-op for an already-aligned
-- production database and completes a database built only from migrations.

ALTER TABLE "app_user"
  ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

ALTER TABLE "cash_payment_request"
  ALTER COLUMN "updatedAt" DROP DEFAULT;

ALTER TABLE "customer_order"
  ADD COLUMN IF NOT EXISTS "tableName" TEXT;

ALTER TABLE "device_enrollment_token"
  ADD COLUMN IF NOT EXISTS "pinAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pinLockedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revokedAt" TIMESTAMP(3);

ALTER TABLE "order_item"
  ADD COLUMN IF NOT EXISTS "notes" VARCHAR(500);

ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "announcementBannerEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "announcementBannerText" TEXT,
  ADD COLUMN IF NOT EXISTS "announcementBannerType" TEXT NOT NULL DEFAULT 'info';

ALTER TABLE "restaurant"
  ADD COLUMN IF NOT EXISTS "forceTierExpiresAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "data_request" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "processedByUserId" TEXT,
  "notes" TEXT,
  "downloadUrl" TEXT,

  CONSTRAINT "data_request_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "impersonation_session" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "exchangeCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),

  CONSTRAINT "impersonation_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "data_request_userId_idx"
  ON "data_request"("userId");
CREATE INDEX IF NOT EXISTS "data_request_status_idx"
  ON "data_request"("status");
CREATE INDEX IF NOT EXISTS "data_request_type_idx"
  ON "data_request"("type");
CREATE UNIQUE INDEX IF NOT EXISTS "impersonation_session_exchangeCode_key"
  ON "impersonation_session"("exchangeCode");
CREATE INDEX IF NOT EXISTS "impersonation_session_actorId_idx"
  ON "impersonation_session"("actorId");
CREATE INDEX IF NOT EXISTS "impersonation_session_targetId_idx"
  ON "impersonation_session"("targetId");
CREATE INDEX IF NOT EXISTS "impersonation_session_exchangeCode_idx"
  ON "impersonation_session"("exchangeCode");
CREATE INDEX IF NOT EXISTS "restaurant_stripeCustomerId_idx"
  ON "restaurant"("stripeCustomerId");
CREATE INDEX IF NOT EXISTS "restaurant_pastDueGraceExpiry_idx"
  ON "restaurant"("pastDueGraceExpiry");
CREATE INDEX IF NOT EXISTS "restaurant_forceTierExpiresAt_idx"
  ON "restaurant"("forceTierExpiresAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'data_request_userId_fkey'
  ) THEN
    ALTER TABLE "data_request"
      ADD CONSTRAINT "data_request_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "app_user"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'data_request_processedByUserId_fkey'
  ) THEN
    ALTER TABLE "data_request"
      ADD CONSTRAINT "data_request_processedByUserId_fkey"
      FOREIGN KEY ("processedByUserId") REFERENCES "app_user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'impersonation_session_actorId_fkey'
  ) THEN
    ALTER TABLE "impersonation_session"
      ADD CONSTRAINT "impersonation_session_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "app_user"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'impersonation_session_targetId_fkey'
  ) THEN
    ALTER TABLE "impersonation_session"
      ADD CONSTRAINT "impersonation_session_targetId_fkey"
      FOREIGN KEY ("targetId") REFERENCES "app_user"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
