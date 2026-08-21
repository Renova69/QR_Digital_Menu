-- Step 4 of the staged tenant vanity-URL rollout. The backfill and production
-- invariant verifier must pass before this migration is deployed.
-- Fail fast rather than waiting indefinitely for PostgreSQL's ACCESS EXCLUSIVE
-- lock. The deploy can be retried after the blocking transaction completes.
SET lock_timeout = '5s';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "restaurant" WHERE "slug" IS NULL) THEN
    RAISE EXCEPTION
      'Cannot require restaurant.slug: NULL values remain in active or archived rows; inspect verifier output and repair every row before retrying';
  END IF;
END $$;

ALTER TABLE "restaurant" ALTER COLUMN "slug" SET NOT NULL;

RESET lock_timeout;
