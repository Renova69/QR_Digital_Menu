-- Optional restaurant-local access window for shared-device PIN login.
-- NULL/NULL preserves the existing unrestricted behavior; there is no backfill.
-- Expand-only and compatible with the previous application revision.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE "restaurant"
ADD COLUMN IF NOT EXISTS "pinLoginStartTime" TEXT,
ADD COLUMN IF NOT EXISTS "pinLoginEndTime" TEXT;

COMMIT;
