-- Add BORICA EMV-3DS hosted checkout configuration columns to the restaurant table.
-- Also adds the BORICA enum value to PaymentProvider so the payment table can record
-- BORICA transactions.
ALTER TABLE "restaurant"
  ADD COLUMN IF NOT EXISTS "boricaEnabled"              BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "boricaMode"                 TEXT     NOT NULL DEFAULT 'DEMO',
  ADD COLUMN IF NOT EXISTS "boricaTerminalId"           TEXT,
  ADD COLUMN IF NOT EXISTS "boricaMerchantId"           TEXT,
  ADD COLUMN IF NOT EXISTS "boricaMerchantName"         TEXT,
  ADD COLUMN IF NOT EXISTS "boricaPrivateKeyEncrypted"  TEXT,
  ADD COLUMN IF NOT EXISTS "boricaPublicCert"           TEXT,
  ADD COLUMN IF NOT EXISTS "boricaCurrency"             TEXT     NOT NULL DEFAULT 'EUR';

-- Add the new enum value.  IF NOT EXISTS prevents failure on re-runs.
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'BORICA';
