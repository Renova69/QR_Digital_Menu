-- Detection signals raised from staff PIN-login failures.
--
-- Persisted rather than fired-and-forgotten for two reasons: it is what the
-- dashboard reads, and it is how alerts are deduplicated across instances. An
-- in-memory guard would let each of the three Cloud Run instances alert
-- separately for the same incident.
--
-- Purely additive: a new table only. Nothing existing is touched.

CREATE TABLE IF NOT EXISTS "security_alert" (
  "id"            TEXT NOT NULL,
  "restaurantId"  TEXT NOT NULL,
  -- MULTI_DEVICE_LOCKOUT | PIN_SPIKE | DEVICE_SLOW_BURN | RESTAURANT_AGGREGATE
  "kind"          TEXT NOT NULL,
  -- Set for device-scoped signals so the dedupe window is per device.
  "deviceTokenId" TEXT,
  -- Counts and window that triggered it, so the dashboard can explain itself.
  "detail"        JSONB,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "security_alert_pkey" PRIMARY KEY ("id")
);

-- Serves both the dedupe lookup and the dashboard read, which filter on the
-- same three columns in the same order.
CREATE INDEX IF NOT EXISTS "security_alert_restaurantId_kind_createdAt_idx"
  ON "security_alert" ("restaurantId", "kind", "createdAt");

ALTER TABLE "security_alert"
  ADD CONSTRAINT "security_alert_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
