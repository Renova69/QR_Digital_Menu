-- Make reward eligibility explicit while preserving every existing positive
-- manually configured points price as a custom reward.
CREATE TYPE "RewardPointsMode" AS ENUM ('OFF', 'AUTO', 'CUSTOM');

ALTER TABLE "menu_item"
ADD COLUMN "rewardPointsMode" "RewardPointsMode" NOT NULL DEFAULT 'OFF';

UPDATE "menu_item"
SET "rewardPointsMode" = 'CUSTOM'
WHERE "rewardPointsPrice" IS NOT NULL
  AND "rewardPointsPrice" > 0;
