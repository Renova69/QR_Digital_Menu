-- AlterTable
ALTER TABLE "loyalty_account" ADD COLUMN     "lifetimePoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "menu_item" ADD COLUMN     "rewardPointsPrice" INTEGER;

-- AlterTable
ALTER TABLE "restaurant" ADD COLUMN     "happyHourEnable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "happyHourEndTime" TEXT,
ADD COLUMN     "happyHourMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
ADD COLUMN     "happyHourStartTime" TEXT,
ADD COLUMN     "isLoyaltyEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "loyaltyExchangeRate" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "loyaltyRedeemRate" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "loyaltySignupBonus" INTEGER NOT NULL DEFAULT 50;
