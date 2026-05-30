-- #10 — store only the SHA-256 hash of the menu-import API key.
--
-- Run ONCE against the database (Neon) to migrate existing plaintext keys,
-- then `npx prisma db push` + `npx prisma generate` to sync the client.
--   npx prisma db execute --file prisma/sql/2026-05-30-hash-import-api-key.sql --schema prisma/schema.prisma
--
-- Order matters: the hash is backfilled from the existing plaintext BEFORE the
-- plaintext column is dropped, so existing OCR tool keys keep authenticating
-- (digest(...,'sha256') hex == Node crypto.createHash('sha256').digest('hex')).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "restaurant" ADD COLUMN IF NOT EXISTS "importApiKeyHash" TEXT;

UPDATE "restaurant"
SET "importApiKeyHash" = encode(digest("importApiKey", 'sha256'), 'hex')
WHERE "importApiKey" IS NOT NULL
  AND "importApiKeyHash" IS NULL;

ALTER TABLE "restaurant" DROP COLUMN IF EXISTS "importApiKey";

CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_importApiKeyHash_key"
  ON "restaurant" ("importApiKeyHash");
