-- Align metadata created by the original translation schema migration with
-- the current Prisma datamodel. These operations do not rewrite or delete any
-- translation rows.

-- TranslationRun.locales is required, but the Prisma model intentionally has
-- no database default. The original migration supplied an empty-array default,
-- which makes a database built from migrations drift from schema.prisma.
ALTER TABLE "translation_run"
  ALTER COLUMN "locales" DROP DEFAULT;

-- PostgreSQL truncated the original over-length index identifier at 63 bytes.
-- Prisma preserves its `_key` suffix by truncating the field portion instead,
-- so give the existing unique index Prisma's canonical identifier.
ALTER INDEX IF EXISTS
  "translation_usage_restaurantId_periodMonth_provider_sourceLang_"
  RENAME TO
  "translation_usage_restaurantId_periodMonth_provider_sourceL_key";
