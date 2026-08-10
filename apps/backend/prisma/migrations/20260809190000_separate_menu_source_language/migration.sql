-- The dashboard UI locale and the language authors use for menu content are
-- separate concepts. The initial deployment authors menus in Bulgarian, so
-- both existing and new restaurants receive that explicit source default.
ALTER TABLE "restaurant"
ADD COLUMN "menuSourceLanguage" TEXT NOT NULL DEFAULT 'bg';
