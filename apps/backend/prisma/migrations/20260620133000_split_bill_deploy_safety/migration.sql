-- Split-bill deploy safety: bring existing databases from db-push state to
-- migrate-deploy state without editing historical migrations.

ALTER TABLE "order_item"
  ADD COLUMN IF NOT EXISTS "paidQuantity" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "payment"
  ADD COLUMN IF NOT EXISTS "splitMode" TEXT;

CREATE TABLE IF NOT EXISTS "payment_allocation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "orderItemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_allocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "customer_order_tableSessionId_idx"
  ON "customer_order"("tableSessionId");

CREATE INDEX IF NOT EXISTS "payment_allocation_paymentId_idx"
  ON "payment_allocation"("paymentId");

CREATE INDEX IF NOT EXISTS "payment_allocation_orderItemId_idx"
  ON "payment_allocation"("orderItemId");

CREATE UNIQUE INDEX IF NOT EXISTS "payment_allocation_paymentId_orderItemId_key"
  ON "payment_allocation"("paymentId", "orderItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocation_paymentId_fkey'
  ) THEN
    ALTER TABLE "payment_allocation"
      ADD CONSTRAINT "payment_allocation_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "payment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocation_orderItemId_fkey'
  ) THEN
    ALTER TABLE "payment_allocation"
      ADD CONSTRAINT "payment_allocation_orderItemId_fkey"
      FOREIGN KEY ("orderItemId") REFERENCES "order_item"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_splitMode_check'
  ) THEN
    ALTER TABLE "payment"
      ADD CONSTRAINT "payment_splitMode_check"
      CHECK ("splitMode" IS NULL OR "splitMode" IN ('ITEM', 'EVEN', 'CUSTOM'));
  END IF;
END $$;
