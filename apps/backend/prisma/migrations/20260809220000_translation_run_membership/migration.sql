-- Explicitly attach queue units to the Translate All run that created them.
-- Auto-enqueued edits keep runId NULL so they cannot change a frozen run's
-- denominator or keep its dashboard progress bar alive.
ALTER TABLE "menu_translation_state"
  ADD COLUMN IF NOT EXISTS "runId" TEXT;

DO $$ BEGIN
  ALTER TABLE "menu_translation_state"
    ADD CONSTRAINT "menu_translation_state_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "translation_run"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "menu_translation_state_runId_status_idx"
  ON "menu_translation_state"("runId", "status");

-- Older builds did not enforce one active run per restaurant. Close all but
-- the newest before adding the guard so this migration remains deploy-safe
-- even if a previous race left duplicates behind.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "restaurantId"
           ORDER BY "createdAt" DESC, "id" DESC
         ) AS position
  FROM "translation_run"
  WHERE "status" IN ('QUEUED', 'RUNNING')
)
UPDATE "translation_run" AS run
SET "status" = 'CANCELLED',
    "finishedAt" = COALESCE(run."finishedAt", CURRENT_TIMESTAMP),
    "message" = COALESCE(run."message", 'Superseded duplicate active run'),
    "updatedAt" = CURRENT_TIMESTAMP
FROM ranked
WHERE run."id" = ranked."id"
  AND ranked.position > 1;

-- Preserve progress for the newest legacy active run. Before this migration
-- those runs were restaurant/locale scoped, so attach their outstanding
-- units once; all future runs are explicit at enqueue time.
UPDATE "menu_translation_state" AS state
SET "runId" = run."id",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "translation_run" AS run
WHERE run."status" IN ('QUEUED', 'RUNNING')
  AND state."restaurantId" = run."restaurantId"
  AND state."locale" = ANY(run."locales")
  AND state."status" IN ('STALE', 'PENDING', 'FAILED')
  AND state."runId" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "translation_run_one_active_per_restaurant_idx"
  ON "translation_run"("restaurantId")
  WHERE "status" IN ('QUEUED', 'RUNNING');
