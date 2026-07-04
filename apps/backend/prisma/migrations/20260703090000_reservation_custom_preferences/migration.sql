-- Owner-defined custom preference chips for the public booking form. Additive.
ALTER TABLE "reservation_settings"
  ADD COLUMN IF NOT EXISTS "customPreferences" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
