import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateSlugBase, withSuffix } from './slug-generator';

export interface ResolvedSlug {
  restaurantId: string;
  canonicalSlug: string;
  releasedAt: Date | null;
}

export const MAX_CLAIM_ATTEMPTS = 5;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class RestaurantSlugService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Slug -> restaurant. Deliberately cheap: a single primary-key lookup that
   * returns an id, after which the established restaurant-ID menu flow runs
   * unchanged. Do not grow this into a second menu endpoint — the frontend
   * loads meta first and then batches category items, and a full-menu-by-slug
   * route would fight that.
   */
  async resolve(rawSlug: string): Promise<ResolvedSlug | null> {
    // URLs arrive from browsers, QR scanners, and hand-typing. The column
    // stores lowercase only (CHECK constraint), so normalize before lookup.
    const slug = rawSlug.trim().toLowerCase();
    if (!slug) return null;

    const row = await this.prisma.restaurantSlug.findUnique({
      where: { slug },
      include: { restaurant: { select: { slug: true } } },
    });
    if (!row) return null;

    return {
      restaurantId: row.restaurantId,
      canonicalSlug: row.restaurant.slug ?? row.slug,
      releasedAt: row.releasedAt,
    };
  }

  /**
   * Allocate the restaurant's first slug, uncommitted.
   *
   * Availability checks elsewhere are advisory only — the unique index is the
   * authority. Without bounded retry, two simultaneous signups deriving the
   * same base slug would leave one legitimate request failing unpredictably:
   * the index prevents corruption but does not by itself produce a correct
   * outcome.
   */
  async claimInitialSlug(restaurantId: string, name: string): Promise<string> {
    const base = generateSlugBase(name, restaurantId);

    for (let attempt = 1; attempt <= MAX_CLAIM_ATTEMPTS; attempt++) {
      const candidate = attempt === 1 ? base : withSuffix(base, attempt);
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.restaurantSlug.create({
            data: { slug: candidate, restaurantId, isPrimary: true },
          });
          await tx.restaurant.update({
            where: { id: restaurantId },
            data: { slug: candidate },
          });
        });
        return candidate;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }

    throw new ConflictException(
      `Could not allocate a unique slug for "${name}" after ${MAX_CLAIM_ATTEMPTS} attempts`,
    );
  }
}
