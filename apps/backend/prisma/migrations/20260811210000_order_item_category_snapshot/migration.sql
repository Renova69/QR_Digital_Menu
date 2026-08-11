-- Preserve order-time category attribution independently of the live menu.
-- Menu/category deletion intentionally keeps financial history, but it sets
-- order_item.menuItemId to NULL; without this snapshot analytics can only call
-- those historical sales "uncategorized".
ALTER TABLE "order_item"
  ADD COLUMN "categoryIdSnapshot" TEXT,
  ADD COLUMN "categoryName" TEXT,
  ADD COLUMN "categoryTranslations" JSONB;

-- Backfill every order line whose live menu relationship still exists. Rows
-- already orphaned before this migration cannot be attributed safely and are
-- surfaced explicitly as historical-menu revenue by the analytics response.
UPDATE "order_item" oi
SET "categoryIdSnapshot" = mc.id,
    "categoryName" = mc.name,
    "categoryTranslations" = mc.translations
FROM "menu_item" mi
JOIN "menu_category" mc ON mc.id = mi."categoryId"
WHERE oi."menuItemId" = mi.id;
