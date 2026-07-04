-- Marketing opt-in for reservation guests / patrons. Additive.
ALTER TABLE "reservation"
  ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMP(3);
ALTER TABLE "patron"
  ADD COLUMN IF NOT EXISTS "marketingConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "patron"
  ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMP(3);
