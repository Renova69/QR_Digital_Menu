-- Printer agent tokens: store only a lookup hash, not the raw bearer token.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE "print_agent_token"
  ADD COLUMN IF NOT EXISTS "tokenHash" TEXT;

UPDATE "print_agent_token"
SET "tokenHash" = encode(digest("token", 'sha256'), 'hex')
WHERE "tokenHash" IS NULL
  AND "token" IS NOT NULL;

-- Defensive fallback for any malformed legacy row without a token.
UPDATE "print_agent_token"
SET "tokenHash" = encode(digest(id || ':' || "createdAt"::text, 'sha256'), 'hex')
WHERE "tokenHash" IS NULL;

ALTER TABLE "print_agent_token"
  ALTER COLUMN "tokenHash" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "print_agent_token_tokenHash_key"
  ON "print_agent_token"("tokenHash");

ALTER TABLE "print_agent_token"
  ALTER COLUMN "token" DROP DEFAULT,
  ALTER COLUMN "token" DROP NOT NULL;

UPDATE "print_agent_token"
SET "token" = NULL
WHERE "token" IS NOT NULL;

-- Order item price snapshots: new orders write exact order-time pricing.
ALTER TABLE "order_item"
  ADD COLUMN IF NOT EXISTS "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "unitPriceWithOptions" DOUBLE PRECISION NOT NULL DEFAULT 0;

UPDATE "order_item" oi
SET
  "unitPrice" = COALESCE(mi.price, 0),
  "unitPriceWithOptions" = COALESCE(mi.price, 0) + COALESCE((
    SELECT SUM(COALESCE((entry->>'priceModifier')::double precision, 0))
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(oi."selectedOptions") = 'array' THEN oi."selectedOptions"
        ELSE '[]'::jsonb
      END
    ) AS entry
  ), 0)
FROM "menu_item" mi
WHERE oi."menuItemId" = mi.id
  AND (oi."unitPrice" = 0 OR oi."unitPriceWithOptions" = 0);

-- Provider callback dedup/audit log. Monetary idempotency remains enforced on payment rows.
CREATE TABLE IF NOT EXISTS "payment_provider_event" (
  "id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "eventKey" TEXT NOT NULL,
  "paymentId" TEXT,
  "restaurantId" TEXT,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_provider_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "payment_provider_event_provider_eventKey_key"
  ON "payment_provider_event"("provider", "eventKey");

CREATE INDEX IF NOT EXISTS "payment_provider_event_paymentId_idx"
  ON "payment_provider_event"("paymentId");

CREATE INDEX IF NOT EXISTS "payment_provider_event_restaurantId_createdAt_idx"
  ON "payment_provider_event"("restaurantId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_provider_event_paymentId_fkey'
  ) THEN
    ALTER TABLE "payment_provider_event"
      ADD CONSTRAINT "payment_provider_event_paymentId_fkey"
      FOREIGN KEY ("paymentId") REFERENCES "payment"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_provider_event_restaurantId_fkey'
  ) THEN
    ALTER TABLE "payment_provider_event"
      ADD CONSTRAINT "payment_provider_event_restaurantId_fkey"
      FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
