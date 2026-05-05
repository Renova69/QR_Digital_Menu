-- Bring the database in line with the Prisma schema and loyalty order logic.
ALTER TABLE "restaurant"
ADD COLUMN IF NOT EXISTS "loyaltyRedeemRate" INTEGER NOT NULL DEFAULT 150;

ALTER TABLE "customer_order"
ADD COLUMN IF NOT EXISTS "pointsRedeemedForDiscount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pointsRedeemedForItems" INTEGER NOT NULL DEFAULT 0;
