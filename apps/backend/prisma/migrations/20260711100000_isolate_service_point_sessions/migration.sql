ALTER TABLE "table_session"
  ADD COLUMN IF NOT EXISTS "isServicePoint" BOOLEAN NOT NULL DEFAULT false;

UPDATE "table_session" AS session
SET "isServicePoint" = true
FROM "restaurant_table" AS location
WHERE session."tableId" = location."id"
  AND location."type" <> 'TABLE'
  AND session."isServicePoint" = false;

DROP INDEX IF EXISTS "table_session_one_open_per_table_restaurant_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "table_session_one_open_per_table_restaurant_idx"
  ON "table_session" ("restaurantId", "tableId")
  WHERE "status" = 'OPEN' AND "isServicePoint" = false;
