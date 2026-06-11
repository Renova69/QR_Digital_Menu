-- Issue 22: Order.customer and Order.staff FK → ON DELETE SET NULL
-- Prevents user deletion from cascading to order history loss.
-- (Columns are already nullable; only the FK constraint behaviour changes.)

ALTER TABLE "customer_order" DROP CONSTRAINT IF EXISTS "customer_order_customerId_fkey";
ALTER TABLE "customer_order" DROP CONSTRAINT IF EXISTS "customer_order_staffUserId_fkey";

ALTER TABLE "customer_order"
  ADD CONSTRAINT "customer_order_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "app_user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_order"
  ADD CONSTRAINT "customer_order_staffUserId_fkey"
  FOREIGN KEY ("staffUserId") REFERENCES "app_user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Issue 32: PrintJob.printStationId optional + ON DELETE SET NULL
-- Allows print-station deletion without destroying print-job history.

ALTER TABLE "print_job" DROP CONSTRAINT IF EXISTS "print_job_printStationId_fkey";
ALTER TABLE "print_job" ALTER COLUMN "printStationId" DROP NOT NULL;

ALTER TABLE "print_job"
  ADD CONSTRAINT "print_job_printStationId_fkey"
  FOREIGN KEY ("printStationId") REFERENCES "print_station"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Issue 55: Unique (restaurantId, name) on RestaurantTable
-- De-dup existing rows before adding constraint.
-- Keeps the earliest-created row; duplicate rows get their own id suffix.
-- The loop handles collisions with already-existing suffixed names.
DO $$
DECLARE
  changed_rows integer;
BEGIN
  LOOP
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY "restaurantId", name
          ORDER BY "createdAt", id
        ) AS rn
      FROM "restaurant_table"
    )
    UPDATE "restaurant_table" t
    SET name =
      LEFT(
        regexp_replace(t.name, ' \[[^]]+\]$', ''),
        GREATEST(1, 190 - LENGTH(t.id))
      ) || ' [' || t.id || ']'
    FROM ranked
    WHERE ranked.id = t.id
      AND ranked.rn > 1;

    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    EXIT WHEN changed_rows = 0;
  END LOOP;
END $$;

ALTER TABLE "restaurant_table"
  ADD CONSTRAINT "restaurant_table_restaurantId_name_key"
  UNIQUE ("restaurantId", name);
