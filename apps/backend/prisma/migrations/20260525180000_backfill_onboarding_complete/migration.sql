-- Backfill onboardingComplete for all users who already own a restaurant.
-- These users existed before the onboarding wizard was introduced and have
-- onboardingComplete = false by default, causing them to be redirected to
-- the onboarding flow even though they already have a restaurant.
UPDATE "app_user"
SET "onboardingComplete" = true
WHERE id IN (SELECT "ownerId" FROM "restaurant");
