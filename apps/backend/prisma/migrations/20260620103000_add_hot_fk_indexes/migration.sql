CREATE INDEX IF NOT EXISTS "menu_category_restaurantId_idx"
  ON "menu_category"("restaurantId");

CREATE INDEX IF NOT EXISTS "menu_option_menuItemId_idx"
  ON "menu_option"("menuItemId");

CREATE INDEX IF NOT EXISTS "customer_order_customerId_idx"
  ON "customer_order"("customerId");

CREATE INDEX IF NOT EXISTS "customer_order_staffUserId_idx"
  ON "customer_order"("staffUserId");

CREATE INDEX IF NOT EXISTS "order_item_orderId_idx"
  ON "order_item"("orderId");

CREATE INDEX IF NOT EXISTS "payment_restaurantId_idx"
  ON "payment"("restaurantId");
