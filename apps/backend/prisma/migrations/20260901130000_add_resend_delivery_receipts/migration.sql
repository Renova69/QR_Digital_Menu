-- Additive Resend delivery-state evidence. Existing email outbox rows remain
-- unchanged and readable; there is no backfill, rewrite, reset, or deletion.
CREATE TYPE "EmailDeliveryStatus" AS ENUM (
  'ACCEPTED',
  'SENT',
  'DELAYED',
  'DELIVERED',
  'BOUNCED',
  'COMPLAINED',
  'FAILED'
);

ALTER TABLE "notification_delivery"
ADD COLUMN "emailDeliveryStatus" "EmailDeliveryStatus",
ADD COLUMN "emailProviderStatus" TEXT,
ADD COLUMN "emailSentAt" TIMESTAMP(3),
ADD COLUMN "emailDeliveredAt" TIMESTAMP(3),
ADD COLUMN "emailFailedAt" TIMESTAMP(3),
ADD COLUMN "emailComplainedAt" TIMESTAMP(3),
ADD COLUMN "emailLastReceiptAt" TIMESTAMP(3),
ADD COLUMN "emailLastEventAt" TIMESTAMP(3),
ADD COLUMN "emailFailureCode" TEXT;

CREATE TABLE "email_provider_receipt" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "providerStatus" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_provider_receipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_provider_receipt_providerEventId_key"
ON "email_provider_receipt"("providerEventId");

CREATE INDEX "email_provider_receipt_deliveryId_eventAt_idx"
ON "email_provider_receipt"("deliveryId", "eventAt");

ALTER TABLE "email_provider_receipt"
ADD CONSTRAINT "email_provider_receipt_deliveryId_fkey"
FOREIGN KEY ("deliveryId") REFERENCES "notification_delivery"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
