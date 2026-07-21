CREATE TYPE "PaymentReconciliationReason" AS ENUM (
  'SESSION_NOT_OPEN',
  'SCOPE_AMOUNT_MISMATCH',
  'SCOPE_CONFLICT',
  'PROVIDER_CONFIRMATION_MISMATCH',
  'PROVIDER_STATUS_UNKNOWN',
  'HISTORICAL_CAPTURE'
);

CREATE TYPE "PaymentReconciliationStatus" AS ENUM (
  'OPEN',
  'RESOLVED',
  'DISMISSED'
);

CREATE TABLE "payment_reconciliation_issue" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "tableSessionId" TEXT,
  "resolvedById" TEXT,
  "provider" "PaymentProvider" NOT NULL,
  "reason" "PaymentReconciliationReason" NOT NULL,
  "status" "PaymentReconciliationStatus" NOT NULL DEFAULT 'OPEN',
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL,
  "providerReference" TEXT,
  "providerStatus" TEXT,
  "details" JSONB,
  "resolutionNote" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_reconciliation_issue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_reconciliation_issue_paymentId_key"
  ON "payment_reconciliation_issue"("paymentId");
CREATE INDEX "payment_reconciliation_issue_restaurantId_status_createdAt_idx"
  ON "payment_reconciliation_issue"("restaurantId", "status", "createdAt");
CREATE INDEX "payment_reconciliation_issue_tableSessionId_idx"
  ON "payment_reconciliation_issue"("tableSessionId");

ALTER TABLE "payment_reconciliation_issue"
  ADD CONSTRAINT "payment_reconciliation_issue_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payment"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_reconciliation_issue"
  ADD CONSTRAINT "payment_reconciliation_issue_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_reconciliation_issue"
  ADD CONSTRAINT "payment_reconciliation_issue_tableSessionId_fkey"
  FOREIGN KEY ("tableSessionId") REFERENCES "table_session"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_reconciliation_issue"
  ADD CONSTRAINT "payment_reconciliation_issue_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "app_user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Repair provider successes that the previous callback state machine
-- acknowledged but refused to claim after the table session had closed.
-- Every predicate below corresponds to a provider-authenticated success branch;
-- ambiguous/declined events are intentionally excluded.
WITH authenticated_capture AS (
  SELECT DISTINCT ON (p."id")
    p."id" AS "paymentId",
    p."restaurantId",
    p."tableSessionId",
    p."provider",
    p."amount",
    p."currency",
    COALESCE(p."providerReference", p."stripePaymentIntentId") AS "providerReference",
    p."providerStatus",
    e."id" AS "providerEventId",
    e."createdAt" AS "providerEventCreatedAt"
  FROM "payment" p
  JOIN "payment_provider_event" e ON e."paymentId" = p."id"
  WHERE p."status" IN ('PENDING', 'ABANDONED', 'FAILED')
    AND (
      (
        p."provider" = 'STRIPE'
        AND e."payload"->>'type' = 'payment_intent.succeeded'
      )
      OR (
        p."provider" = 'EPAY'
        AND e."payload"->>'status' = 'PAID'
      )
      OR (
        p."provider" = 'BORICA'
        AND e."payload"->>'rc' = '00'
        AND e."payload"->>'action' = '0'
      )
      OR (
        p."provider" = 'MYPOS'
        AND (
          e."payload" ? 'transactionRef'
          OR e."payload" ? 'requestStan'
        )
      )
    )
  ORDER BY p."id", e."createdAt" DESC
)
INSERT INTO "payment_reconciliation_issue" (
  "id",
  "paymentId",
  "restaurantId",
  "tableSessionId",
  "provider",
  "reason",
  "status",
  "amount",
  "currency",
  "providerReference",
  "providerStatus",
  "details",
  "createdAt",
  "updatedAt"
)
SELECT
  'historical_capture_' || md5(c."paymentId"),
  c."paymentId",
  c."restaurantId",
  c."tableSessionId",
  c."provider",
  'HISTORICAL_CAPTURE',
  'OPEN',
  c."amount",
  c."currency",
  c."providerReference",
  'HISTORICAL_CAPTURE_NEEDS_RECONCILIATION',
  jsonb_build_object(
    'previousProviderStatus', c."providerStatus",
    'providerEventId', c."providerEventId",
    'providerEventCreatedAt', c."providerEventCreatedAt"
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM authenticated_capture c
ON CONFLICT ("paymentId") DO NOTHING;

UPDATE "payment" p
SET
  "status" = 'SUCCEEDED',
  "providerStatus" = 'HISTORICAL_CAPTURE_NEEDS_RECONCILIATION',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE p."status" IN ('PENDING', 'ABANDONED', 'FAILED')
  AND EXISTS (
    SELECT 1
    FROM "payment_reconciliation_issue" issue
    WHERE issue."paymentId" = p."id"
      AND issue."reason" = 'HISTORICAL_CAPTURE'
  );

-- Older code already marked scoped double-settlements SUCCEEDED, but only
-- emitted a transient socket alert. Backfill those into the durable queue too.
INSERT INTO "payment_reconciliation_issue" (
  "id",
  "paymentId",
  "restaurantId",
  "tableSessionId",
  "provider",
  "reason",
  "status",
  "amount",
  "currency",
  "providerReference",
  "providerStatus",
  "details",
  "createdAt",
  "updatedAt"
)
SELECT
  'scope_conflict_' || md5(p."id"),
  p."id",
  p."restaurantId",
  p."tableSessionId",
  p."provider",
  'SCOPE_CONFLICT',
  'OPEN',
  p."amount",
  p."currency",
  COALESCE(p."providerReference", p."stripePaymentIntentId"),
  'SCOPE_CONFLICT_NEEDS_RECONCILIATION',
  jsonb_build_object('previousProviderStatus', p."providerStatus"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "payment" p
WHERE p."status" = 'SUCCEEDED'
  AND p."providerStatus" = 'SCOPE_CONFLICT_NEEDS_REFUND'
ON CONFLICT ("paymentId") DO NOTHING;

UPDATE "payment"
SET
  "providerStatus" = 'SCOPE_CONFLICT_NEEDS_RECONCILIATION',
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'SUCCEEDED'
  AND "providerStatus" = 'SCOPE_CONFLICT_NEEDS_REFUND';
