-- OrderItem.itemName snapshot, backfilled from the still-linked menu item.
-- Point-in-time snapshot so historical orders/receipts/reporting survive a
-- MenuItem rename/delete (menuItemId is already SetNull on delete).
ALTER TABLE "order_item" ADD COLUMN IF NOT EXISTS "itemName" TEXT;

UPDATE "order_item" oi
SET "itemName" = mi.name
FROM "menu_item" mi
WHERE oi."menuItemId" = mi.id
  AND oi."itemName" IS NULL;

UPDATE "order_item" SET "itemName" = 'Unknown item' WHERE "itemName" IS NULL;

ALTER TABLE "order_item" ALTER COLUMN "itemName" SET NOT NULL;
ALTER TABLE "order_item" ALTER COLUMN "itemName" SET DEFAULT 'Unknown item';

-- Payment.tableSessionId: Cascade -> SetNull. Deleting a RestaurantTable (only
-- allowed once its session is CLOSED/PAID, see TablesService.remove) used to
-- cascade-delete the Payment rows for that session, silently wiping financial
-- history. Column must be nullable before the FK action can be SetNull.
ALTER TABLE "payment" ALTER COLUMN "tableSessionId" DROP NOT NULL;
ALTER TABLE "payment" DROP CONSTRAINT IF EXISTS "payment_tableSessionId_fkey";
ALTER TABLE "payment"
  ADD CONSTRAINT "payment_tableSessionId_fkey"
  FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- CashPaymentRequest.tableId: Cascade -> SetNull, same rationale as above.
ALTER TABLE "cash_payment_request" ALTER COLUMN "tableId" DROP NOT NULL;
ALTER TABLE "cash_payment_request" DROP CONSTRAINT IF EXISTS "cash_payment_request_tableId_fkey";
ALTER TABLE "cash_payment_request"
  ADD CONSTRAINT "cash_payment_request_tableId_fkey"
  FOREIGN KEY ("tableId") REFERENCES "restaurant_table"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Missing tenant indexes: Restaurant.ownerId and User.restaurantId lookups
-- were full-table scans.
CREATE INDEX IF NOT EXISTS "restaurant_ownerId_idx" ON "restaurant"("ownerId");
CREATE INDEX IF NOT EXISTS "app_user_restaurantId_idx" ON "app_user"("restaurantId");
