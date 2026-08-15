import { PrismaClient } from '@prisma/client';
import {
  generateSlugBase,
  withSuffix,
} from '../src/restaurants/slug/slug-generator';

const MAX_ATTEMPTS = 20;

/**
 * Idempotent, additive, re-runnable. Deliberately separate from the migration:
 * migrations stay mechanical, data movement stays repeatable. Only restaurants
 * that are not soft-deleted (deletedAt IS NULL) and still lack a slug are
 * touched — a second run finds nothing pending and is a no-op.
 */
export async function backfillSlugs(
  prisma: PrismaClient,
): Promise<{ created: number; skipped: number }> {
  const pending = await prisma.restaurant.findMany({
    where: { slug: null, deletedAt: null },
    select: { id: true, name: true },
  });

  let created = 0;
  for (const restaurant of pending) {
    const base = generateSlugBase(restaurant.name, restaurant.id);
    let slug = base;
    for (let attempt = 2; attempt <= MAX_ATTEMPTS; attempt++) {
      const clash = await prisma.restaurantSlug.findUnique({
        where: { slug },
        select: { slug: true },
      });
      if (!clash) break;
      slug = withSuffix(base, attempt);
    }

    await prisma.$transaction(async (tx) => {
      await tx.restaurantSlug.create({
        data: { slug, restaurantId: restaurant.id, isPrimary: true },
      });
      await tx.restaurant.update({
        where: { id: restaurant.id },
        data: { slug },
      });
    });
    created++;
  }

  return { created, skipped: 0 };
}

/**
 * The application half of the guarantee. The partial unique index
 * (restaurant_slug_one_primary) enforces AT MOST one primary slug per
 * restaurant; it cannot enforce AT LEAST one. Step 4 of the staged migration
 * (making Restaurant.slug non-null) is gated on this returning empty against
 * production data. Every check is scoped to deletedAt IS NULL — a
 * soft-deleted restaurant having no slug is not a violation.
 */
export async function verifySlugInvariants(
  prisma: PrismaClient,
): Promise<string[]> {
  const violations: string[] = [];

  const missing = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT r."id", r."name" FROM "restaurant" r
    WHERE r."deletedAt" IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM "restaurant_slug" s
        WHERE s."restaurantId" = r."id" AND s."isPrimary"
      )
  `;
  for (const row of missing) {
    violations.push(`Restaurant ${row.id} ("${row.name}") has no primary slug`);
  }

  const desynced = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT r."id" FROM "restaurant" r
    JOIN "restaurant_slug" s
      ON s."restaurantId" = r."id" AND s."isPrimary"
    WHERE r."deletedAt" IS NULL AND r."slug" IS DISTINCT FROM s."slug"
  `;
  for (const row of desynced) {
    violations.push(`Restaurant ${row.id} denormalized slug is out of sync`);
  }

  const badCase = await prisma.$queryRaw<Array<{ slug: string }>>`
    SELECT "slug" FROM "restaurant_slug" WHERE "slug" <> lower("slug")
  `;
  for (const row of badCase) {
    violations.push(`Slug "${row.slug}" is not lowercase`);
  }

  return violations;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await backfillSlugs(prisma);
    console.log(`Backfill complete: ${result.created} slugs created`);
    const violations = await verifySlugInvariants(prisma);
    if (violations.length > 0) {
      console.error('INVARIANT VIOLATIONS:');
      violations.forEach((v) => console.error(`  - ${v}`));
      process.exitCode = 1;
      return;
    }
    console.log('All slug invariants hold.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Slug backfill failed',
    );
    process.exitCode = 1;
  });
}
