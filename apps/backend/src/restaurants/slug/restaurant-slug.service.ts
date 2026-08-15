import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateSlugBase, withSuffix } from './slug-generator';
import { validateSlug } from './slug-rules';

export interface ResolvedSlug {
  restaurantId: string;
  canonicalSlug: string;
  releasedAt: Date | null;
}

export const MAX_CLAIM_ATTEMPTS = 5;
export const RENAME_COOLDOWN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

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
      include: { restaurant: { select: { slug: true, deletedAt: true } } },
    });
    if (!row) return null;

    // A soft-deleted restaurant's vanity URL must not half-resolve: no new
    // exception type here, `null` is deliberate and already maps to a 404 by
    // the caller — identical to an unknown slug, so nothing is disclosed.
    if (row.restaurant.deletedAt) return null;

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

  private async primaryOrThrow(tx: any, restaurantId: string) {
    const primary = await tx.restaurantSlug.findFirst({
      where: { restaurantId, isPrimary: true },
    });
    if (!primary) {
      throw new BadRequestException('Restaurant has no primary slug');
    }
    return primary;
  }

  /**
   * Idempotent transition from uncommitted to committed.
   *
   * Called as a blocking precondition by the QR flow: a QR must never be
   * rendered against a slug that could still change. Also called automatically
   * on first external activity (MenuView / Order / Reservation) and as a 24h
   * backstop. Export tracking was rejected as the trigger because it is
   * best-effort — a beacon can fail while the download still succeeds.
   */
  async commitSlug(
    restaurantId: string,
  ): Promise<{ slug: string; committedAt: Date }> {
    return this.prisma.$transaction(async (tx) => {
      const primary = await this.primaryOrThrow(tx, restaurantId);
      if (primary.committedAt) {
        return { slug: primary.slug, committedAt: primary.committedAt };
      }
      const committedAt = new Date();
      await tx.restaurantSlug.update({
        where: { slug: primary.slug },
        data: { committedAt },
      });
      return { slug: primary.slug, committedAt };
    });
  }

  private assertRenameAllowed(primary: { committedAt: Date | null }): void {
    if (!primary.committedAt) return;
    const elapsed = Date.now() - primary.committedAt.getTime();
    if (elapsed < RENAME_COOLDOWN_DAYS * DAY_MS) {
      const availableAt = new Date(
        primary.committedAt.getTime() + RENAME_COOLDOWN_DAYS * DAY_MS,
      );
      throw new BadRequestException(
        `Slug can be changed again on ${availableAt.toISOString()}`,
      );
    }
  }

  /**
   * Case 2 — the target is this restaurant's own still-resolvable alias.
   * The row already exists, so promote it in place rather than creating a
   * duplicate. The old primary survives as a permanent alias either way.
   */
  private async repromoteOwnAlias(
    tx: any,
    restaurantId: string,
    oldSlug: string,
    nextSlug: string,
  ): Promise<void> {
    await tx.restaurantSlug.update({
      where: { slug: oldSlug },
      data: { isPrimary: false },
    });
    await tx.restaurantSlug.update({
      where: { slug: nextSlug },
      data: { isPrimary: true },
    });
    await tx.restaurant.update({
      where: { id: restaurantId },
      data: { slug: nextSlug },
    });
  }

  /**
   * The target slug is genuinely unclaimed (by this restaurant or anyone
   * else) as far as the advisory lookup in renameSlug saw. Retire or delete
   * the old row per the committed/uncommitted asymmetry, then create the new
   * one. The create is still guarded by the unique index as the final
   * authority — see the P2002 catch below.
   */
  private async claimFreshSlug(
    tx: any,
    restaurantId: string,
    primary: { slug: string },
    nextSlug: string,
    isCommitted: boolean,
  ): Promise<void> {
    if (isCommitted) {
      // Committed: retire the old slug as a permanent alias so printed QR
      // codes keep resolving. Aliases are never evicted.
      await tx.restaurantSlug.update({
        where: { slug: primary.slug },
        data: { isPrimary: false },
      });
    } else {
      // Uncommitted: this is an edit, not a rename. Nothing external
      // references the old slug, so return it to the pool rather than
      // permanently burning a name from a global namespace.
      await tx.restaurantSlug.delete({ where: { slug: primary.slug } });
    }

    try {
      await tx.restaurantSlug.create({
        data: {
          slug: nextSlug,
          restaurantId,
          isPrimary: true,
          committedAt: isCommitted ? new Date() : null,
        },
      });
    } catch (error) {
      // Backstop for a genuine race that slips between the advisory lookup
      // in renameSlug and this insert: surface the same conflict a caller
      // would see from an already-taken slug, not a raw 500.
      if (isUniqueViolation(error)) {
        throw new ConflictException('This slug is already taken');
      }
      throw error;
    }

    await tx.restaurant.update({
      where: { id: restaurantId },
      data: { slug: nextSlug },
    });
  }

  async renameSlug(restaurantId: string, nextSlug: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const primary = await this.primaryOrThrow(tx, restaurantId);

      // Case 1: target is this restaurant's own current primary slug — a
      // double-submit, not a rename. No write, no cooldown check.
      if (nextSlug === primary.slug) {
        return primary.slug;
      }

      const isCommitted = Boolean(primary.committedAt);
      this.assertRenameAllowed(primary);

      // Availability checks are advisory only — the unique index in
      // claimFreshSlug is the final authority. This lookup decides which of
      // cases 2/3/4 applies, or whether the slug is genuinely free.
      const target = await tx.restaurantSlug.findFirst({
        where: { slug: nextSlug },
      });

      if (target && target.restaurantId !== restaurantId) {
        // Case 4: live, alias, or tombstoned — belongs to someone else.
        // Never leak which restaurant holds it.
        throw new ConflictException('This slug is already taken');
      }

      if (target && target.releasedAt) {
        // Case 3: this restaurant's own tombstone. Resurrection is a
        // super-admin-only action; bypassing it here would defeat that gate.
        throw new BadRequestException(
          'This slug was released and can only be restored by support',
        );
      }

      if (target) {
        // Case 2: this restaurant's own still-resolvable alias.
        await this.repromoteOwnAlias(tx, restaurantId, primary.slug, nextSlug);
        return nextSlug;
      }

      await this.claimFreshSlug(
        tx,
        restaurantId,
        primary,
        nextSlug,
        isCommitted,
      );
      return nextSlug;
    });
  }

  /**
   * Tombstone, never delete. If a released slug returned to the claimable
   * pool, a competitor could take it and every QR already printed for the
   * original restaurant would resolve to their menu, with a live cart and
   * checkout — silent, customer-facing, and undetectable by the victim.
   */
  async releaseSlug(restaurantId: string, slug: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.restaurantSlug.findFirst({
        where: { slug, restaurantId },
      });
      if (!row) throw new BadRequestException('Slug not found');
      if (row.isPrimary) {
        throw new BadRequestException('Cannot release the current slug');
      }
      if (row.releasedAt) return;
      await tx.restaurantSlug.update({
        where: { slug },
        data: { releasedAt: new Date() },
      });
    });
  }

  /**
   * Stricter than findOneForManagement, which grants OWNER *or* MANAGER
   * (restaurants.service.ts). Renaming the public URL and releasing a name
   * are owner-only decisions — do not reuse findOneForManagement here.
   */
  async assertOwner(restaurantId: string, userId: string): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { ownerId: true, deletedAt: true },
    });
    if (!restaurant || restaurant.deletedAt) {
      throw new NotFoundException(`Restaurant "${restaurantId}" not found`);
    }
    if (restaurant.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can change the menu URL');
    }
  }

  /**
   * Advisory only — the unique index on RestaurantSlug.slug is the authority
   * at write time. This exists so the UI can give instant feedback while
   * typing; the real check happens again inside renameSlug's transaction.
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    if (validateSlug(slug) !== null) return false;
    const existing = await this.prisma.restaurantSlug.findUnique({
      where: { slug },
      select: { slug: true },
    });
    return existing === null;
  }
}
