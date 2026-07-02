-- F-PAY-1 (v2): move the refund lifecycle into its own table so the payment can
-- stay economically PAID (SUCCEEDED + allocations intact) until the provider
-- confirms `succeeded`. Fully additive.

-- Fail closed if the previous refund implementation left any economically
-- ambiguous rows behind. Their allocation snapshot was not persisted, so this
-- migration cannot safely infer whether Stripe refunded them or reconstruct
-- their allocations. An operator must reconcile those rows against Stripe and
-- return each one to SUCCEEDED or REFUNDED before deploying this lifecycle.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payment"
    WHERE "status" = 'REFUND_PENDING'
  ) THEN
    RAISE EXCEPTION
      'RefundAttempt migration blocked: legacy REFUND_PENDING payment rows require manual Stripe reconciliation'
      USING HINT =
        'Resolve every REFUND_PENDING payment to SUCCEEDED or REFUNDED, then rerun the migration.';
  END IF;
END
$$;

-- RefundStatus enum (guarded — CREATE TYPE has no IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RefundStatus') THEN
    CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');
  END IF;
END
$$;

-- refund_attempt table.
CREATE TABLE IF NOT EXISTS "refund_attempt" (
  "id"                 TEXT NOT NULL,
  "paymentId"          TEXT NOT NULL,
  "restaurantId"       TEXT NOT NULL,
  "provider"           "PaymentProvider" NOT NULL,
  "amount"             DOUBLE PRECISION NOT NULL,
  "idempotencyKey"     TEXT NOT NULL,
  "providerRefundId"   TEXT,
  "status"             "RefundStatus" NOT NULL DEFAULT 'PENDING',
  "reason"             TEXT,
  "allocationSnapshot" JSONB NOT NULL DEFAULT '[]',
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "refund_attempt_pkey" PRIMARY KEY ("id")
);

-- Unique keys: idempotencyKey doubles as the one-attempt-per-payment guard;
-- providerRefundId lets webhooks/reconciliation correlate to the exact refund.
CREATE UNIQUE INDEX IF NOT EXISTS "refund_attempt_idempotencyKey_key"
  ON "refund_attempt" ("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "refund_attempt_providerRefundId_key"
  ON "refund_attempt" ("providerRefundId");

CREATE INDEX IF NOT EXISTS "refund_attempt_paymentId_idx"
  ON "refund_attempt" ("paymentId");
CREATE INDEX IF NOT EXISTS "refund_attempt_status_provider_updatedAt_idx"
  ON "refund_attempt" ("status", "provider", "updatedAt");

-- FK to payment (cascade so a deleted payment cleans up its attempts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refund_attempt_paymentId_fkey'
  ) THEN
    ALTER TABLE "refund_attempt"
      ADD CONSTRAINT "refund_attempt_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "payment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
