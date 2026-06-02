-- Enforce one OPEN table session per restaurant/table.
-- This is intentionally non-destructive: if duplicate OPEN sessions already
-- exist, fail the migration so an operator can resolve them explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "table_session"
    WHERE "status" = 'OPEN'
    GROUP BY "restaurantId", "tableId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot create unique OPEN table-session index: duplicate OPEN sessions exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "table_session_one_open_per_table_restaurant_idx"
  ON "table_session" ("restaurantId", "tableId")
  WHERE "status" = 'OPEN';
