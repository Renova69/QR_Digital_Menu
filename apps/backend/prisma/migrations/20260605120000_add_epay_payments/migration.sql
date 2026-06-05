-- Add ePay.bg hosted checkout configuration and provider-neutral payment metadata.
ALTER TABLE "restaurant"
  ADD COLUMN "epayEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "epayMode" TEXT NOT NULL DEFAULT 'DEMO',
  ADD COLUMN "epayClientId" TEXT,
  ADD COLUMN "epayMerchantEmail" TEXT,
  ADD COLUMN "epaySecretEncrypted" TEXT,
  ADD COLUMN "epayPage" TEXT NOT NULL DEFAULT 'credit_paydirect';

ALTER TABLE "payment"
  ADD COLUMN "providerReference" TEXT,
  ADD COLUMN "providerStatus" TEXT,
  ADD COLUMN "providerPayload" JSONB;

CREATE UNIQUE INDEX "payment_providerReference_key" ON "payment"("providerReference");

ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'EPAY';
