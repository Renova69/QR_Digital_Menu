DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CashPaymentRequestStatus') THEN
    CREATE TYPE "CashPaymentRequestStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CashPaymentRequestScope') THEN
    CREATE TYPE "CashPaymentRequestScope" AS ENUM ('FULL_TABLE', 'ORDER_ITEMS');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "cash_payment_request" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "tableSessionId" TEXT NOT NULL,
  "tableId" TEXT NOT NULL,
  "status" "CashPaymentRequestStatus" NOT NULL DEFAULT 'PENDING',
  "scope" "CashPaymentRequestScope" NOT NULL DEFAULT 'FULL_TABLE',
  "scopeKey" TEXT NOT NULL,
  "orderIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "requestedAmount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "paymentId" TEXT,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cash_payment_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cash_payment_request_restaurantId_status_createdAt_idx"
  ON "cash_payment_request"("restaurantId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "cash_payment_request_tableSessionId_status_idx"
  ON "cash_payment_request"("tableSessionId", "status");

CREATE INDEX IF NOT EXISTS "cash_payment_request_tableId_status_idx"
  ON "cash_payment_request"("tableId", "status");

CREATE INDEX IF NOT EXISTS "cash_payment_request_resolvedById_idx"
  ON "cash_payment_request"("resolvedById");

CREATE UNIQUE INDEX IF NOT EXISTS "cash_payment_request_paymentId_key"
  ON "cash_payment_request"("paymentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_payment_request_restaurantId_fkey'
  ) THEN
    ALTER TABLE "cash_payment_request"
      ADD CONSTRAINT "cash_payment_request_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_payment_request_tableSessionId_fkey'
  ) THEN
    ALTER TABLE "cash_payment_request"
      ADD CONSTRAINT "cash_payment_request_tableSessionId_fkey"
      FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_payment_request_tableId_fkey'
  ) THEN
    ALTER TABLE "cash_payment_request"
      ADD CONSTRAINT "cash_payment_request_tableId_fkey"
      FOREIGN KEY ("tableId") REFERENCES "restaurant_table"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_payment_request_paymentId_fkey'
  ) THEN
    ALTER TABLE "cash_payment_request"
      ADD CONSTRAINT "cash_payment_request_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "payment"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cash_payment_request_resolvedById_fkey'
  ) THEN
    ALTER TABLE "cash_payment_request"
      ADD CONSTRAINT "cash_payment_request_resolvedById_fkey"
      FOREIGN KEY ("resolvedById") REFERENCES "app_user"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
