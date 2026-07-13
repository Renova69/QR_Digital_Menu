ALTER TABLE "menu_item"
ADD COLUMN "upsellContexts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Preserve contextual labels written into the legacy generic tags field.
UPDATE "menu_item" AS item
SET "upsellContexts" = ARRAY(
  SELECT DISTINCT context
  FROM unnest(item."tags") AS context
  WHERE context = ANY(
    ARRAY[
      'MORNING',
      'LUNCH',
      'EVENING',
      'LATE_NIGHT',
      'WEEKEND',
      'FRIDAY_NIGHT',
      'COLD',
      'HOT',
      'RAINY'
    ]::TEXT[]
  )
)
WHERE cardinality(item."tags") > 0;
