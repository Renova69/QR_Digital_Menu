-- Tables are snake_case (@@map); columns are camelCase and unmapped.
CREATE TABLE "restaurant_slug" (
    "slug" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "committedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "restaurant_slug_pkey" PRIMARY KEY ("slug")
);

CREATE INDEX "restaurant_slug_restaurantId_idx"
  ON "restaurant_slug"("restaurantId");

ALTER TABLE "restaurant_slug"
  ADD CONSTRAINT "restaurant_slug_restaurantId_fkey"
  FOREIGN KEY ("restaurantId") REFERENCES "restaurant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Guarantees AT MOST one primary slug per restaurant. It cannot guarantee
-- that every restaurant HAS one — that is an application invariant, upheld by
-- RestaurantSlugService and verified by the backfill.
CREATE UNIQUE INDEX "restaurant_slug_one_primary"
  ON "restaurant_slug"("restaurantId") WHERE "isPrimary";

-- Makes the lowercase rule a database fact rather than an app convention.
-- CHECK is preferred over citext (extension dependency) or a case-insensitive
-- collation (interacts badly with primary-key indexes).
ALTER TABLE "restaurant_slug"
  ADD CONSTRAINT "restaurant_slug_lowercase" CHECK ("slug" = lower("slug"));

-- Denormalized read copy. Stays nullable — a later migration tightens it,
-- only after production verification.
ALTER TABLE "restaurant" ADD COLUMN "slug" TEXT;
CREATE UNIQUE INDEX "restaurant_slug_unique" ON "restaurant"("slug");
