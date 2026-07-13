-- Persist the client intent identity used by offline POS retries.
ALTER TABLE "customer_order"
ADD COLUMN "clientOrderId" TEXT,
ADD COLUMN "clientPayloadHash" VARCHAR(64),
ADD COLUMN "expectedTableSessionId" TEXT;

-- PostgreSQL permits multiple NULL values, so existing online orders are unaffected.
CREATE UNIQUE INDEX "customer_order_restaurantId_clientOrderId_key"
ON "customer_order"("restaurantId", "clientOrderId");
