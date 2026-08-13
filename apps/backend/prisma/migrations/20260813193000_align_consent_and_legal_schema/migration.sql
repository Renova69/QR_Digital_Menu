-- Forward-only repair for Prisma schema changes that reached existing
-- databases through db push/manual evolution but were never represented in
-- the committed migration chain.
--
-- This migration is intentionally additive and idempotent. It does not drop,
-- truncate, delete, or rewrite any application data. Existing databases that
-- already contain these objects are left unchanged, while a database built
-- only from committed migrations is brought up to the Prisma Client contract.

DO $$
BEGIN
  CREATE TYPE "ConsentCategory" AS ENUM ('ANALYTICS', 'MARKETING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "analyticsCookieEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "policyVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "dpaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "refundPolicyEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "msaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dpaContent" JSONB,
  ADD COLUMN IF NOT EXISTS "refundPolicyContent" JSONB,
  ADD COLUMN IF NOT EXISTS "msaContent" JSONB;

CREATE TABLE IF NOT EXISTS "consent_record" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT,
  "visitorId" TEXT NOT NULL,
  "category" "ConsentCategory" NOT NULL,
  "granted" BOOLEAN NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "ipHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "consent_record_restaurantId_visitorId_idx"
  ON "consent_record"("restaurantId", "visitorId");
