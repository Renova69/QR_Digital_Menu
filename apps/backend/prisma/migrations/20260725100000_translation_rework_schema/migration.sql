-- Translation rework: glossary classification columns, DeepL native-glossary
-- cache, translation work-queue/status sidecar table, poisoned-translation
-- backup table, translation run tracking, and usage/quota ledger.
--
-- `glossary_term` already exists on this database (created via `prisma db
-- push` before any migration for it was ever written — see CLAUDE.md's own
-- guidance to prefer `db push` when migration history has drifted). Every
-- statement touching it is therefore guarded so this migration is safe to
-- run whether or not the table/columns are already present.

-- ── restaurant: per-tenant quota override ────────────────────────────────
ALTER TABLE "restaurant" ADD COLUMN IF NOT EXISTS "translationCharCapOverride" INTEGER;

-- ── glossary_term: classification columns ───────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "GlossaryTermKind" AS ENUM ('TERM', 'PROTECTED_DISH', 'DO_NOT_TRANSLATE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "glossary_term" (
  "id"             TEXT NOT NULL,
  "sourceLang"     TEXT NOT NULL,
  "sourceText"     TEXT NOT NULL,
  "targetLang"     TEXT NOT NULL,
  "translatedText" TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "glossary_term_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "glossary_term_sourceLang_sourceText_targetLang_key"
  ON "glossary_term"("sourceLang", "sourceText", "targetLang");
CREATE INDEX IF NOT EXISTS "glossary_term_sourceLang_sourceText_idx"
  ON "glossary_term"("sourceLang", "sourceText");

ALTER TABLE "glossary_term" ADD COLUMN IF NOT EXISTS "kind" "GlossaryTermKind" NOT NULL DEFAULT 'TERM';
ALTER TABLE "glossary_term" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "glossary_term" ADD COLUMN IF NOT EXISTS "verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "glossary_term" ADD COLUMN IF NOT EXISTS "notes" TEXT;

CREATE INDEX IF NOT EXISTS "glossary_term_sourceLang_targetLang_kind_idx"
  ON "glossary_term"("sourceLang", "targetLang", "kind");

-- Identity mappings (translatedText equals sourceText once both are
-- normalized) are self-evidently a "leave this alone" instruction, not a
-- translation — classify + verify them up front so the reconciler seed
-- doesn't have to re-decide the ~58 brand rows on first run.
UPDATE "glossary_term"
SET "kind" = 'DO_NOT_TRANSLATE', "verified" = true
WHERE "sourceText" = lower(btrim("translatedText"))
  AND "kind" = 'TERM';

-- ── deepl_glossary: cached native-glossary id per language pair ─────────────
CREATE TABLE IF NOT EXISTS "deepl_glossary" (
  "id"              TEXT NOT NULL,
  "sourceLang"      TEXT NOT NULL,
  "targetLang"      TEXT NOT NULL,
  "deeplGlossaryId" TEXT,
  "entryCount"      INTEGER NOT NULL DEFAULT 0,
  "contentHash"     TEXT,
  "syncedAt"        TIMESTAMP(3),
  "lastError"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deepl_glossary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "deepl_glossary_sourceLang_targetLang_key"
  ON "deepl_glossary"("sourceLang", "targetLang");

-- ── menu_translation_state: per (entity, field, locale) status/queue ────────
DO $$ BEGIN
  CREATE TYPE "MenuTranslationEntity" AS ENUM ('CATEGORY', 'ITEM', 'OPTION');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "MenuTranslationField" AS ENUM ('NAME', 'DESCRIPTION', 'ALLERGENS', 'DIETARY_TAGS', 'CHOICES');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "MenuTranslationStatus" AS ENUM ('CURRENT', 'STALE', 'PENDING', 'FAILED', 'SKIPPED', 'NEEDS_REVIEW');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "menu_translation_state" (
  "id"            TEXT NOT NULL,
  "restaurantId"  TEXT NOT NULL,
  "entityType"    "MenuTranslationEntity" NOT NULL,
  "entityId"      TEXT NOT NULL,
  "field"         "MenuTranslationField" NOT NULL,
  "locale"        TEXT NOT NULL,
  "sourceLang"    TEXT NOT NULL,
  "sourceHash"    TEXT NOT NULL,
  "status"        "MenuTranslationStatus" NOT NULL DEFAULT 'STALE',
  "provider"      TEXT,
  "charCount"     INTEGER NOT NULL DEFAULT 0,
  "failureCount"  INTEGER NOT NULL DEFAULT 0,
  "lastError"     TEXT,
  "claimedAt"     TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "translatedAt"  TIMESTAMP(3),
  "reviewedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "menu_translation_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "menu_translation_state_entityType_entityId_field_locale_key"
  ON "menu_translation_state"("entityType", "entityId", "field", "locale");
CREATE INDEX IF NOT EXISTS "menu_translation_state_restaurantId_locale_status_idx"
  ON "menu_translation_state"("restaurantId", "locale", "status");
CREATE INDEX IF NOT EXISTS "menu_translation_state_restaurantId_status_idx"
  ON "menu_translation_state"("restaurantId", "status");
CREATE INDEX IF NOT EXISTS "menu_translation_state_status_nextAttemptAt_idx"
  ON "menu_translation_state"("status", "nextAttemptAt");

DO $$ BEGIN
  ALTER TABLE "menu_translation_state"
    ADD CONSTRAINT "menu_translation_state_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── menu_translation_backup: pre-repair snapshot for rollback ───────────────
CREATE TABLE IF NOT EXISTS "menu_translation_backup" (
  "id"           TEXT NOT NULL,
  "batchId"      TEXT NOT NULL,
  "entityType"   "MenuTranslationEntity" NOT NULL,
  "entityId"     TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "translations" JSONB NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "menu_translation_backup_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "menu_translation_backup_batchId_idx" ON "menu_translation_backup"("batchId");
CREATE INDEX IF NOT EXISTS "menu_translation_backup_entityType_entityId_idx" ON "menu_translation_backup"("entityType", "entityId");

-- ── translation_run: one row per Translate-All click / auto-enqueue ─────────
DO $$ BEGIN
  CREATE TYPE "TranslationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'PARTIAL', 'FAILED', 'QUOTA_BLOCKED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "translation_run" (
  "id"            TEXT NOT NULL,
  "restaurantId"  TEXT NOT NULL,
  "requestedById" TEXT,
  "status"        "TranslationRunStatus" NOT NULL DEFAULT 'QUEUED',
  "locales"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "totalUnits"    INTEGER NOT NULL DEFAULT 0,
  "doneUnits"     INTEGER NOT NULL DEFAULT 0,
  "failedUnits"   INTEGER NOT NULL DEFAULT 0,
  "charsUsed"     INTEGER NOT NULL DEFAULT 0,
  "message"       TEXT,
  "startedAt"     TIMESTAMP(3),
  "finishedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "translation_run_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "translation_run_restaurantId_createdAt_idx" ON "translation_run"("restaurantId", "createdAt");
CREATE INDEX IF NOT EXISTS "translation_run_status_idx" ON "translation_run"("status");

DO $$ BEGIN
  ALTER TABLE "translation_run"
    ADD CONSTRAINT "translation_run_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── translation_usage: monthly char-usage ledger ─────────────────────────────
CREATE TABLE IF NOT EXISTS "translation_usage" (
  "id"           TEXT NOT NULL,
  "restaurantId" TEXT,
  "periodMonth"  TEXT NOT NULL,
  "provider"     TEXT NOT NULL,
  "sourceLang"   TEXT NOT NULL,
  "targetLang"   TEXT NOT NULL,
  "charCount"    INTEGER NOT NULL DEFAULT 0,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "translation_usage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "translation_usage_restaurantId_periodMonth_provider_sourceLang_targetLang_key"
  ON "translation_usage"("restaurantId", "periodMonth", "provider", "sourceLang", "targetLang");
CREATE INDEX IF NOT EXISTS "translation_usage_periodMonth_idx" ON "translation_usage"("periodMonth");

DO $$ BEGIN
  ALTER TABLE "translation_usage"
    ADD CONSTRAINT "translation_usage_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Backfill menu_translation_state from existing translations JSON ─────────
-- Only backfills units that already have stored content — absence of a row
-- means "never translated", which the enqueuer synthesizes on demand.
-- md5(lower(btrim(...))) here must match the Node-side hash computed by
-- MenuTranslationWorkerService so a backfilled row and a freshly-enqueued
-- row for unchanged content compare equal.

-- Categories: name
INSERT INTO "menu_translation_state" (
  "id", "restaurantId", "entityType", "entityId", "field", "locale",
  "sourceLang", "sourceHash", "status", "provider", "translatedAt", "createdAt", "updatedAt"
)
SELECT
  'bf_cat_name_' || md5(c."id" || ':' || tr.key),
  c."restaurantId", 'CATEGORY', c."id", 'NAME', tr.key,
  COALESCE(r."dashboardLanguage", 'bg'),
  md5(lower(btrim(c."name"))),
  'CURRENT', 'backfill', c."updatedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "menu_category" c
JOIN "restaurant" r ON r."id" = c."restaurantId"
CROSS JOIN LATERAL jsonb_each(COALESCE(c."translations", '{}'::jsonb)) AS tr(key, value)
WHERE jsonb_typeof(tr.value) = 'object'
  AND COALESCE(tr.value ->> 'name', '') <> ''
ON CONFLICT ("entityType", "entityId", "field", "locale") DO NOTHING;

-- Items: name
INSERT INTO "menu_translation_state" (
  "id", "restaurantId", "entityType", "entityId", "field", "locale",
  "sourceLang", "sourceHash", "status", "provider", "translatedAt", "createdAt", "updatedAt"
)
SELECT
  'bf_item_name_' || md5(i."id" || ':' || tr.key),
  c."restaurantId", 'ITEM', i."id", 'NAME', tr.key,
  COALESCE(r."dashboardLanguage", 'bg'),
  md5(lower(btrim(i."name"))),
  'CURRENT', 'backfill', i."updatedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "menu_item" i
JOIN "menu_category" c ON c."id" = i."categoryId"
JOIN "restaurant" r ON r."id" = c."restaurantId"
CROSS JOIN LATERAL jsonb_each(COALESCE(i."translations", '{}'::jsonb)) AS tr(key, value)
WHERE jsonb_typeof(tr.value) = 'object'
  AND COALESCE(tr.value ->> 'name', '') <> ''
ON CONFLICT ("entityType", "entityId", "field", "locale") DO NOTHING;

-- Items: description
INSERT INTO "menu_translation_state" (
  "id", "restaurantId", "entityType", "entityId", "field", "locale",
  "sourceLang", "sourceHash", "status", "provider", "translatedAt", "createdAt", "updatedAt"
)
SELECT
  'bf_item_desc_' || md5(i."id" || ':' || tr.key),
  c."restaurantId", 'ITEM', i."id", 'DESCRIPTION', tr.key,
  COALESCE(r."dashboardLanguage", 'bg'),
  md5(lower(btrim(i."description"))),
  'CURRENT', 'backfill', i."updatedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "menu_item" i
JOIN "menu_category" c ON c."id" = i."categoryId"
JOIN "restaurant" r ON r."id" = c."restaurantId"
CROSS JOIN LATERAL jsonb_each(COALESCE(i."translations", '{}'::jsonb)) AS tr(key, value)
WHERE jsonb_typeof(tr.value) = 'object'
  AND COALESCE(i."description", '') <> ''
  AND COALESCE(tr.value ->> 'description', '') <> ''
ON CONFLICT ("entityType", "entityId", "field", "locale") DO NOTHING;

-- Options: name
INSERT INTO "menu_translation_state" (
  "id", "restaurantId", "entityType", "entityId", "field", "locale",
  "sourceLang", "sourceHash", "status", "provider", "translatedAt", "createdAt", "updatedAt"
)
SELECT
  'bf_opt_name_' || md5(o."id" || ':' || tr.key),
  c."restaurantId", 'OPTION', o."id", 'NAME', tr.key,
  COALESCE(r."dashboardLanguage", 'bg'),
  md5(lower(btrim(o."name"))),
  'CURRENT', 'backfill', o."updatedAt", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "menu_option" o
JOIN "menu_item" i ON i."id" = o."menuItemId"
JOIN "menu_category" c ON c."id" = i."categoryId"
JOIN "restaurant" r ON r."id" = c."restaurantId"
CROSS JOIN LATERAL jsonb_each(COALESCE(o."translations", '{}'::jsonb)) AS tr(key, value)
WHERE jsonb_typeof(tr.value) = 'object'
  AND COALESCE(tr.value ->> 'name', '') <> ''
ON CONFLICT ("entityType", "entityId", "field", "locale") DO NOTHING;

-- ── Flag suspected translation-gate poisoning ────────────────────────────────
-- The pre-fix "glossary-only mode" gate returned source text without
-- throwing, so poisoned pairs have a huge fraction of item names identical
-- (after normalization) to the source. A legitimately well-translated pair
-- has only a handful of identical names (brands, "Pizza", "Espresso" ...).
-- The gap between "genuinely translated" (2-5%) and "poisoned" (60-95%) is
-- large, so a 30% threshold with a minimum sample size is a safe classifier.
-- This step only FLAGS rows for human/repair-script review — it never
-- deletes or modifies any translation content.
WITH pair_stats AS (
  SELECT
    c."restaurantId",
    tr.key AS locale,
    count(*) AS populated,
    count(*) FILTER (
      WHERE lower(btrim(tr.value ->> 'name')) = lower(btrim(i."name"))
    ) AS suspect
  FROM "menu_item" i
  JOIN "menu_category" c ON c."id" = i."categoryId"
  JOIN "restaurant" r ON r."id" = c."restaurantId"
  CROSS JOIN LATERAL jsonb_each(COALESCE(i."translations", '{}'::jsonb)) AS tr(key, value)
  WHERE jsonb_typeof(tr.value) = 'object'
    AND COALESCE(tr.value ->> 'name', '') <> ''
    AND tr.key <> COALESCE(r."dashboardLanguage", 'bg')
  GROUP BY c."restaurantId", tr.key
),
poisoned_pairs AS (
  SELECT "restaurantId", locale
  FROM pair_stats
  WHERE populated >= 10 AND suspect::float / populated >= 0.30
)
UPDATE "menu_translation_state" s
SET "status" = 'NEEDS_REVIEW', "updatedAt" = CURRENT_TIMESTAMP
FROM poisoned_pairs p
WHERE s."restaurantId" = p."restaurantId"
  AND s."locale" = p."locale"
  AND s."field" IN ('NAME', 'DESCRIPTION')
  AND s."status" = 'CURRENT';
