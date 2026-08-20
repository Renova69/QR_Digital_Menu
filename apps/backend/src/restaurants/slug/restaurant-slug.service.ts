import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { generateSlugBase, withSuffix } from './slug-generator';
import {
  SLUG_MAX_LENGTH,
  SLUG_MIN_LENGTH,
  SlugRuleError,
  validateSlug,
} from './slug-rules';

export interface ResolvedSlug {
  restaurantId: string;
  canonicalSlug: string;
  releasedAt: Date | null;
}

export const MAX_CLAIM_ATTEMPTS = 5;
export const RENAME_COOLDOWN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Per-code messages for the renameSlug rejection gate below. Deliberately
// distinct per SlugRuleError so a caller (or a support agent reading logs)
// can tell RESERVED apart from NUMERIC apart from PUNYCODE — but RESERVED's
// message never enumerates RESERVED_SLUGS itself, so rejection can't be used
// to probe the reserved list.
const RENAME_REJECTION_MESSAGES: Record<SlugRuleError, string> = {
  LENGTH: `Slug must be between ${SLUG_MIN_LENGTH} and ${SLUG_MAX_LENGTH} characters`,
  FORMAT: 'Slug must be lowercase letters, digits and inner hyphens only',
  PUNYCODE: 'Slug cannot start with the reserved "xn--" prefix',
  NUMERIC: 'Slug cannot be all numeric — it would be ambiguous with an ID',
  RESERVED: 'This slug is reserved and cannot be used',
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class RestaurantSlugService {
  private readonly logger = new Logger(RestaurantSlugService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an active restaurant together with its required primary slug.
   *
   * This is the creation interface for slug-enabled restaurants. Keeping the
   * restaurant row, namespace claim, and denormalized slug copy inside one
   * transaction prevents a successful signup from ever exposing a restaurant
   * with no primary slug. A namespace race retries the entire transaction, so
   * a failed candidate cannot strand the restaurant row from that attempt.
   */
  async createRestaurantWithInitialSlug(
    data: Prisma.RestaurantUncheckedCreateInput,
    preferredSlug?: string,
  ) {
    if (preferredSlug) {
      const ruleViolation = validateSlug(preferredSlug);
      if (ruleViolation) {
        throw new BadRequestException(RENAME_REJECTION_MESSAGES[ruleViolation]);
      }
    }

    const attemptLimit = preferredSlug ? 1 : MAX_CLAIM_ATTEMPTS;
    for (let attempt = 1; attempt <= attemptLimit; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const restaurant = await tx.restaurant.create({
            data: { ...data, slug: null },
          });
          const base = generateSlugBase(restaurant.name, restaurant.id);
          const candidate = preferredSlug
            ? preferredSlug
            : attempt === 1
              ? base
              : withSuffix(base, attempt);

          await tx.restaurantSlug.create({
            data: {
              slug: candidate,
              restaurantId: restaurant.id,
              isPrimary: true,
            },
          });

          return tx.restaurant.update({
            where: { id: restaurant.id },
            data: { slug: candidate },
          });
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (preferredSlug) {
          throw new ConflictException('This slug is already taken');
        }
      }
    }

    throw new ConflictException(
      `Could not allocate a unique slug for "${data.name}" after ${MAX_CLAIM_ATTEMPTS} attempts`,
    );
  }

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

  private async primaryOrThrow(
    tx: Prisma.TransactionClient,
    restaurantId: string,
  ) {
    const primary = await tx.restaurantSlug.findFirst({
      where: { restaurantId, isPrimary: true },
      include: { restaurant: { select: { createdAt: true } } },
    });
    if (!primary) {
      throw new BadRequestException('Restaurant has no primary slug');
    }
    return primary;
  }

  /**
   * Idempotent transition from uncommitted to committed.
   *
   * Called as a blocking precondition by the QR flow (SlugController#commit):
   * a QR must never be rendered against a slug that could still change — and
   * that must work the same day a restaurant signs up, so the write below is
   * unconditional once a primary is uncommitted, never gated on age. Also
   * called automatically on first external activity via commitOnActivity
   * (MenuView / Order / Reservation), for the same reason: genuine activity
   * should lock the slug immediately, not after a delay.
   *
   * The automatic 24h backstop is handled by
   * commitExpiredUncommittedSlugs(). commitSlug only fires from a caller that
   * already has a concrete reason to lock the slug immediately (a QR request
   * or real activity).
   *
   * Export tracking was rejected as the trigger because it is best-effort —
   * a beacon can fail while the download still succeeds.
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

  /**
   * Immediate commit attempt triggered by the first real external reference to
   * a restaurant: a public menu view, an order (including POS, which
   * involves no menu view), or a reservation (which never touches the slug
   * at all otherwise). Callers are customer-facing write paths — placing an
   * order, recording a menu view, creating a reservation — so a
   * slug-bookkeeping failure must never fail that write. Callers await this
   * attempt, while failures are logged and reconciled from the durable
   * activity rows by commitExpiredUncommittedSlugs.
   */
  async commitOnActivity(restaurantId: string): Promise<void> {
    try {
      await this.commitSlug(restaurantId);
    } catch (error) {
      this.logger.warn(
        `Immediate activity commit failed for restaurant ${restaurantId}; scheduled reconciliation will retry: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Durable clock backstop for restaurants with no observed external
   * activity. Cloud Run may run this on more than one instance, so the sweep
   * is one idempotent updateMany restricted to rows that are still
   * uncommitted. The clock is restaurant.createdAt, as specified; editing an
   * uncommitted slug must not restart the restaurant's 24-hour grace period.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async commitExpiredUncommittedSlugs(): Promise<number> {
    const committedAt = new Date();
    const cutoff = new Date(committedAt.getTime() - DAY_MS);
    const result = await this.prisma.restaurantSlug.updateMany({
      where: {
        isPrimary: true,
        committedAt: null,
        restaurant: {
          deletedAt: null,
          OR: [
            { createdAt: { lte: cutoff } },
            { menuViews: { some: {} } },
            { orders: { some: {} } },
            { reservations: { some: {} } },
          ],
        },
      },
      data: { committedAt },
    });
    return result.count;
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
    tx: Prisma.TransactionClient,
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
      // Re-promotion is a real committed rename. Reset the cooldown clock on
      // the row becoming primary; retaining this alias row's historical
      // committedAt would let the owner rename again immediately.
      data: { isPrimary: true, committedAt: new Date() },
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
    tx: Prisma.TransactionClient,
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
    // Authoritative gate — UpdateSlugDto only enforces LENGTH and FORMAT, so
    // an internal caller that bypasses the DTO (or a future one that does)
    // could otherwise write a reserved, punycode, or all-numeric slug
    // straight past validateSlug's other three rules. isSlugAvailable calls
    // validateSlug too, but that path is advisory only and this method never
    // consulted it — this is the fix.
    //
    // Deliberately the first statement in the method, before
    // this.prisma.$transaction even opens: a rejected slug must cost
    // nothing, not a transaction, not the cooldown check, not the target
    // lookup, not a write. Every existing collision case (own primary, own
    // alias, own tombstone, someone else's slug, the 24h backstop) only
    // starts being evaluated once a slug has already cleared this gate, so
    // none of that logic moves or changes.
    const ruleViolation = validateSlug(nextSlug);
    if (ruleViolation) {
      throw new BadRequestException(RENAME_REJECTION_MESSAGES[ruleViolation]);
    }

    return this.prisma.$transaction(async (tx) => {
      const primary = await this.primaryOrThrow(tx, restaurantId);

      // Case 1: target is this restaurant's own current primary slug — a
      // double-submit, not a rename. No write, no cooldown check.
      if (nextSlug === primary.slug) {
        return primary.slug;
      }

      // Defensive 24h check. The hourly scheduler is the automatic backstop,
      // but a delayed or temporarily failed scheduler run must not let an
      // owner rename a slug whose restaurant-level grace window has already
      // elapsed. Short-circuit: when primary.committedAt is already truthy,
      // the creation clock is never read, so a genuinely committed row needs
      // no createdAt fixture.
      // The authoritative clock belongs to the restaurant, not the current
      // slug row: an edit during the grace period creates a new row and must
      // not restart the restaurant's original 24-hour deadline.
      const backstopStartedAt =
        primary.restaurant?.createdAt ?? primary.createdAt;
      const isCommitted =
        Boolean(primary.committedAt) ||
        Date.now() - backstopStartedAt.getTime() >= DAY_MS;

      // The cooldown itself is keyed on primary.committedAt directly (never
      // on the isCommitted flag above) — a backstop-forced isCommitted with
      // committedAt still null must NOT reach the `.getTime()` call inside
      // assertRenameAllowed, which would throw on a null dereference. No
      // deliberate commit ever happened in that case, so there is no commit
      // time to measure the 14-day cooldown from; the rename below is
      // allowed to proceed, and the NEW primary row created by
      // claimFreshSlug gets a real committedAt so every subsequent rename
      // is cooldowned normally.
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
   * Previous public URLs for the owner settings screen. Released rows remain
   * visible so the UI can distinguish a working alias from an irreversible
   * tombstone instead of making a disappeared URL look reusable.
   */
  async listAliases(restaurantId: string) {
    return this.prisma.restaurantSlug.findMany({
      where: { restaurantId, isPrimary: false },
      select: {
        slug: true,
        committedAt: true,
        releasedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPrimaryState(restaurantId: string) {
    return this.prisma.restaurantSlug.findFirst({
      where: { restaurantId, isPrimary: true },
      select: { slug: true, committedAt: true, createdAt: true },
    });
  }

  /**
   * Support-only business-sale recovery. A tombstone is transferred as a
   * committed alias of the buyer's existing primary URL; making it primary
   * would violate the one-primary invariant and unnecessarily replace the
   * buyer's current public address. The compare-and-update predicate prevents
   * two concurrent support actions from transferring the same name twice.
   * Namespace mutation and its audit record deliberately share one database
   * transaction.
   */
  async reassignReleasedSlug(
    rawSlug: string,
    targetRestaurantId: string,
    actorUserId: string,
  ): Promise<{
    slug: string;
    restaurantId: string;
    previousRestaurantId: string;
  }> {
    const slug = rawSlug.trim().toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.restaurantSlug.findUnique({ where: { slug } });
      if (!row) {
        throw new NotFoundException(`Slug "${slug}" not found`);
      }
      if (row.isPrimary || !row.releasedAt) {
        throw new BadRequestException(
          'Only a released alias can be reassigned',
        );
      }

      const target = await tx.restaurant.findUnique({
        where: { id: targetRestaurantId },
        select: { id: true, slug: true, deletedAt: true },
      });
      if (!target || target.deletedAt) {
        throw new NotFoundException(
          `Restaurant "${targetRestaurantId}" not found`,
        );
      }
      if (!target.slug) {
        throw new BadRequestException(
          'Target restaurant has no canonical slug',
        );
      }

      const reassigned = await tx.restaurantSlug.updateMany({
        where: {
          slug,
          restaurantId: row.restaurantId,
          isPrimary: false,
          releasedAt: row.releasedAt,
        },
        data: {
          restaurantId: targetRestaurantId,
          isPrimary: false,
          releasedAt: null,
          committedAt: row.committedAt ?? new Date(),
        },
      });
      if (reassigned.count !== 1) {
        throw new ConflictException(
          'The released slug changed during reassignment; retry the operation',
        );
      }

      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'SLUG_REASSIGNED',
          targetType: 'RestaurantSlug',
          targetId: slug,
          metadata: {
            fromRestaurantId: row.restaurantId,
            toRestaurantId: targetRestaurantId,
            canonicalSlug: target.slug,
          },
        },
      });

      return {
        slug,
        restaurantId: targetRestaurantId,
        previousRestaurantId: row.restaurantId,
      };
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
