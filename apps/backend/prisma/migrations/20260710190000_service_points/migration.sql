-- Service points extend restaurant_table beyond physical dine-in tables.
-- Existing table QR links keep using ?table=<name>; room/pickup QR links use
-- the opaque publicToken so checkout can load context-specific fulfillment and
-- payment options without exposing hotel UI to table guests.
ALTER TABLE "restaurant_table"
  ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'TABLE',
  ADD COLUMN IF NOT EXISTS "publicToken" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "fulfillmentModes" TEXT[] NOT NULL DEFAULT ARRAY['DINE_IN']::TEXT[],
  ADD COLUMN IF NOT EXISTS "paymentMethods" TEXT[] NOT NULL DEFAULT ARRAY['ONLINE', 'CASH']::TEXT[];

CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_table_publicToken_key"
  ON "restaurant_table"("publicToken");

CREATE INDEX IF NOT EXISTS "restaurant_table_restaurantId_type_isActive_idx"
  ON "restaurant_table"("restaurantId", "type", "isActive");

ALTER TABLE "customer_order"
  ADD COLUMN IF NOT EXISTS "servicePointType" TEXT,
  ADD COLUMN IF NOT EXISTS "servicePointLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "fulfillmentType" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentPreference" TEXT;
