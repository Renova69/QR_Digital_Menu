import { Prisma, PrismaClient } from '@prisma/client';
import {
  generateSlugBase,
  withSuffix,
} from '../src/restaurants/slug/slug-generator';
import {
  type SlugRuleError,
  validateSlug,
} from '../src/restaurants/slug/slug-rules';

const MAX_ATTEMPTS = 20;

// Duplicated (not imported) from restaurant-slug.service.ts deliberately:
// that file's isUniqueViolation is unexported, and fix-round-1 review scoped
// changes to that file to the resolve() soft-delete fix only. Four lines is
// cheaper to duplicate than to justify a shared module for.
function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

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
    let claimed = false;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const slug = attempt === 1 ? base : withSuffix(base, attempt);

      // Advisory pre-check only — skips a doomed insert in the common case
      // where `slug` is visibly taken. It is NOT the authority: another
      // writer (this script run twice, a concurrent rename, a live signup)
      // can claim `slug` in the gap between this read and the create below.
      // Correctness rests entirely on the unique index via the P2002 catch,
      // mirroring RestaurantSlugService.claimInitialSlug.
      const clash = await prisma.restaurantSlug.findUnique({
        where: { slug },
        select: { slug: true },
      });
      if (clash) continue;

      try {
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
        claimed = true;
        break;
      } catch (error) {
        // Someone claimed `slug` between the pre-check and the insert —
        // try the next deterministic suffix. Anything else is a real
        // failure (connection loss, etc.) and must not be swallowed.
        if (!isUniqueViolation(error)) throw error;
      }
    }

    if (!claimed) {
      throw new Error(
        `Could not allocate a unique slug for restaurant ${restaurant.id} ("${restaurant.name}") after ${MAX_ATTEMPTS} attempts`,
      );
    }
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

  const invalidPrimaryCounts = await prisma.$queryRaw<
    Array<{ id: string; name: string; primaryCount?: number }>
  >`
    SELECT
      r."id",
      r."name",
      COUNT(s."slug")::int AS "primaryCount"
    FROM "restaurant" r
    LEFT JOIN "restaurant_slug" s
      ON s."restaurantId" = r."id" AND s."isPrimary"
    WHERE r."deletedAt" IS NULL
    GROUP BY r."id", r."name"
    HAVING COUNT(s."slug") <> 1
  `;
  for (const row of invalidPrimaryCounts) {
    const count = Number(row.primaryCount ?? 0);
    violations.push(
      count === 0
        ? `Restaurant ${row.id} ("${row.name}") has no primary slug`
        : `Restaurant ${row.id} ("${row.name}") has ${count} primary slugs`,
    );
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

  // Deliberately NOT scoped to deletedAt IS NULL, unlike the two checks
  // above: this is a restaurant_slug row-integrity check with no restaurant
  // join at all, guarding against the restaurant_slug_lowercase CHECK
  // constraint being bypassed or removed later. A slug belonging to a
  // soft-deleted restaurant is not a false positive here — it's still a
  // corrupt row in this table — so there is nothing to filter out. Do not
  // add a deletedAt filter "for consistency" with the other two checks.
  const badCase = await prisma.$queryRaw<Array<{ slug: string }>>`
    SELECT "slug" FROM "restaurant_slug" WHERE "slug" <> lower("slug")
  `;
  for (const row of badCase) {
    violations.push(`Slug "${row.slug}" is not lowercase`);
  }

  const allSlugs = await prisma.$queryRaw<Array<{ slug: string }>>`
    SELECT "slug" FROM "restaurant_slug"
  `;
  const ruleLabels: Record<SlugRuleError, string> = {
    LENGTH: 'length',
    FORMAT: 'format',
    PUNYCODE: 'punycode prefix',
    NUMERIC: 'numeric-only',
    RESERVED: 'reserved-name',
  };
  for (const row of allSlugs) {
    const rule = validateSlug(row.slug);
    if (rule) {
      violations.push(
        `Slug "${row.slug}" violates the ${ruleLabels[rule]} rule`,
      );
    }
  }

  return violations;
}

/**
 * Release gate: the second pass proves the backfill is actually idempotent,
 * then the complete application-level invariant check must be empty.
 */
export async function runSlugRollout(prisma: PrismaClient): Promise<{
  firstPass: { created: number; skipped: number };
  secondPass: { created: number; skipped: number };
  violations: string[];
}> {
  const firstPass = await backfillSlugs(prisma);
  const secondPass = await backfillSlugs(prisma);
  const violations = await verifySlugInvariants(prisma);
  if (secondPass.created !== 0) {
    violations.unshift(
      `Backfill was not idempotent: second pass created ${secondPass.created} slug(s)`,
    );
  }
  return { firstPass, secondPass, violations };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const verifyOnly = process.argv.includes('--verify-only');
    const result = verifyOnly
      ? {
          firstPass: null,
          secondPass: null,
          violations: await verifySlugInvariants(prisma),
        }
      : await runSlugRollout(prisma);
    if (!verifyOnly) {
      console.log(
        `Backfill complete: ${result.firstPass?.created ?? 0} slugs created; second pass created ${result.secondPass?.created ?? 0}`,
      );
    }
    const { violations } = result;
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
