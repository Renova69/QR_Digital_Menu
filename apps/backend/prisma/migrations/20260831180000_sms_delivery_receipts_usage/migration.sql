-- Additive SMS delivery evidence and usage/cost accounting. Existing outbox
-- rows remain untouched; nullable fields preserve deploy compatibility with
-- the previous backend revision while a canary is serving.
CREATE TYPE "SmsProvider" AS ENUM ('TWILIO', 'SMS_GATEWAY');
CREATE TYPE "SmsDeliveryStatus" AS ENUM ('ACCEPTED', 'SENT', 'DELIVERED', 'FAILED');

ALTER TABLE "notification_delivery"
ADD COLUMN "smsProvider" "SmsProvider",
ADD COLUMN "smsDeliveryStatus" "SmsDeliveryStatus",
ADD COLUMN "smsProviderStatus" TEXT,
ADD COLUMN "smsSegmentCount" INTEGER,
ADD COLUMN "smsEstimatedCostMicros" INTEGER,
ADD COLUMN "smsProviderCostMicros" INTEGER,
ADD COLUMN "smsEstimatedCostCurrency" TEXT,
ADD COLUMN "smsProviderCostCurrency" TEXT,
ADD COLUMN "smsEffectiveTier" "SubscriptionTier",
ADD COLUMN "smsAllowanceAtSend" INTEGER,
ADD COLUMN "smsDeliveredPartCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "smsSentAt" TIMESTAMP(3),
ADD COLUMN "smsDeliveredAt" TIMESTAMP(3),
ADD COLUMN "smsFailedAt" TIMESTAMP(3),
ADD COLUMN "smsLastReceiptAt" TIMESTAMP(3),
ADD COLUMN "smsFailureCode" TEXT;

-- Provider event IDs make webhook retries idempotent and let multipart SMS
-- reach DELIVERED only after every distinct part has reported delivery. This
-- table contains opaque provider IDs and status metadata only, never message
-- bodies, phone numbers, or guest details.
CREATE TABLE "sms_provider_receipt" (
  "id" TEXT NOT NULL,
  "deliveryId" TEXT NOT NULL,
  "provider" "SmsProvider" NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "providerStatus" TEXT NOT NULL,
  "eventAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sms_provider_receipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_delivery_restaurantId_channel_acceptedAt_idx"
ON "notification_delivery"("restaurantId", "channel", "acceptedAt");

CREATE INDEX "notification_delivery_channel_providerMessageId_idx"
ON "notification_delivery"("channel", "providerMessageId");

CREATE UNIQUE INDEX "sms_provider_receipt_provider_providerEventId_key"
ON "sms_provider_receipt"("provider", "providerEventId");

CREATE INDEX "sms_provider_receipt_deliveryId_eventAt_idx"
ON "sms_provider_receipt"("deliveryId", "eventAt");

ALTER TABLE "sms_provider_receipt"
ADD CONSTRAINT "sms_provider_receipt_deliveryId_fkey"
FOREIGN KEY ("deliveryId") REFERENCES "notification_delivery"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
