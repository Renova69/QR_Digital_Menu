-- AlterTable: add costPrice column to menu_item
-- NOTE: Prisma field `costPrice` has no @map, so the column MUST be camelCase
-- "costPrice" (matching imageUrl/thumbnailUrl/rewardPointsPrice on this model).
-- A snake_case "cost_price" column would never be read by the generated client.
ALTER TABLE "menu_item" ADD COLUMN IF NOT EXISTS "costPrice" DOUBLE PRECISION DEFAULT 0;

-- CreateTable: daily_target
CREATE TABLE IF NOT EXISTS "daily_target" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "dailyRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_target_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "daily_target_restaurantId_targetDate_key" UNIQUE ("restaurantId", "targetDate"),
    CONSTRAINT "daily_target_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
