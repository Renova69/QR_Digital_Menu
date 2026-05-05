-- Add an expiring point ledger so balances can be redeemed FIFO and expired safely.
CREATE TYPE "LoyaltyPointTransactionType" AS ENUM ('EARN', 'SIGNUP', 'REDEEM', 'EXPIRE', 'ADJUSTMENT');

ALTER TABLE "restaurant"
ADD COLUMN "loyaltyPointExpiryDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN "loyaltyExpiryReminderDays" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "restaurant"
ALTER COLUMN "loyaltyExchangeRate" SET DEFAULT 10;

CREATE TABLE "loyalty_point_ledger" (
  "id" TEXT NOT NULL,
  "loyaltyAccountId" TEXT NOT NULL,
  "orderId" TEXT,
  "type" "LoyaltyPointTransactionType" NOT NULL,
  "points" INTEGER NOT NULL,
  "remainingPoints" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "reminderSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "loyalty_point_ledger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loyalty_point_ledger_loyaltyAccountId_expiresAt_idx"
ON "loyalty_point_ledger"("loyaltyAccountId", "expiresAt");

CREATE INDEX "loyalty_point_ledger_expiresAt_reminderSentAt_idx"
ON "loyalty_point_ledger"("expiresAt", "reminderSentAt");

ALTER TABLE "loyalty_point_ledger"
ADD CONSTRAINT "loyalty_point_ledger_loyaltyAccountId_fkey"
FOREIGN KEY ("loyaltyAccountId") REFERENCES "loyalty_account"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "loyalty_point_ledger"
ADD CONSTRAINT "loyalty_point_ledger_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "customer_order"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing aggregate balances become one expiring legacy batch.
INSERT INTO "loyalty_point_ledger" (
  "id",
  "loyaltyAccountId",
  "type",
  "points",
  "remainingPoints",
  "expiresAt",
  "createdAt"
)
SELECT
  'legacy_' || "id",
  "id",
  'ADJUSTMENT'::"LoyaltyPointTransactionType",
  "points",
  "points",
  "createdAt" + INTERVAL '90 days',
  "createdAt"
FROM "loyalty_account"
WHERE "points" > 0;
