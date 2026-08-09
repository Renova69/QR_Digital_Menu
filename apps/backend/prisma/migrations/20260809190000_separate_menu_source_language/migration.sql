-- The dashboard UI locale and the language authors use for menu content are
-- separate concepts. Preserve existing restaurants' former source-language
-- behaviour while giving new restaurants an explicit Bulgarian default.
ALTER TABLE "restaurant"
ADD COLUMN "menuSourceLanguage" TEXT NOT NULL DEFAULT 'bg';

UPDATE "restaurant"
SET "menuSourceLanguage" = COALESCE(NULLIF(LOWER(TRIM("dashboardLanguage")), ''), 'bg');
