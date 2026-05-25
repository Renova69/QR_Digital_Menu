ALTER TABLE "restaurant" ADD COLUMN IF NOT EXISTS "themeLightBgColor" TEXT;
ALTER TABLE "restaurant" ADD COLUMN IF NOT EXISTS "themeLightTextColor" TEXT;
ALTER TABLE "restaurant" ADD COLUMN IF NOT EXISTS "themeLightCardColor" TEXT;
ALTER TABLE "restaurant" ADD COLUMN IF NOT EXISTS "themeLightAccentColor" TEXT;
ALTER TABLE "restaurant" ADD COLUMN IF NOT EXISTS "themeDarkBgColor" TEXT;
ALTER TABLE "restaurant" ADD COLUMN IF NOT EXISTS "themeDarkTextColor" TEXT;
ALTER TABLE "restaurant" ADD COLUMN IF NOT EXISTS "themeDarkCardColor" TEXT;
ALTER TABLE "restaurant" ADD COLUMN IF NOT EXISTS "themeDarkAccentColor" TEXT;

UPDATE "restaurant"
SET
  "themeLightBgColor" = COALESCE("themeLightBgColor", "themeBgColor", '#FFFFFF'),
  "themeLightTextColor" = COALESCE("themeLightTextColor", "themeTextColor", '#0E0B1A'),
  "themeLightCardColor" = COALESCE("themeLightCardColor", "themeCardColor", "themeBgColor", '#FFFFFF'),
  "themeLightAccentColor" = COALESCE("themeLightAccentColor", "accentColor", '#4F46E5'),
  "themeDarkBgColor" = COALESCE("themeDarkBgColor", '#0B0A14'),
  "themeDarkTextColor" = COALESCE("themeDarkTextColor", '#F5F4FA'),
  "themeDarkCardColor" = COALESCE("themeDarkCardColor", '#15131F'),
  "themeDarkAccentColor" = COALESCE("themeDarkAccentColor", "accentColor", '#8B6FFF');
