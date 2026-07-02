import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

type PriceMap = Record<string, Record<'monthly' | 'yearly', string>>;

/**
 * Resolve a price id to its tier. Standalone so it stays pure and easily
 * testable; the live map is built per-instance in the service constructor so
 * env vars injected after module load are picked up (M-7).
 */
function getTierFromPrice(priceMap: PriceMap, priceId: string): string {
  for (const [tier, periods] of Object.entries(priceMap)) {
    if (periods.monthly === priceId || periods.yearly === priceId) return tier;
  }
  return 'FREE';
}

// The DB `tier` column is a SubscriptionTier enum. Writing an unrecognized
// value (via `tier as any`) would either violate the enum at the DB or corrupt
// entitlement logic.
const VALID_TIERS: ReadonlySet<string> = new Set([
  'FREE',
  'STARTER',
  'PROFESSIONAL',
  'ENTERPRISE',
]);

/**
 * M-PAY-3: resolve a tier from `metadata.tier` only when the Stripe price could
 * not be mapped. Metadata is written server-side from an allowlisted tier and
 * the webhook is signature-verified, so this is a fallback, not a trust
 * boundary — but we still coerce anything that is not a known tier to FREE
 * (never write a raw/garbage value) and warn so a mismapped price surfaces.
 */
function normalizeTier(
  candidate: unknown,
  logger?: Logger,
  context?: string,
): string {
  if (typeof candidate === 'string' && VALID_TIERS.has(candidate)) {
    return candidate;
  }
  if (candidate != null && candidate !== '' && logger) {
    const candidateLabel =
      typeof candidate === 'string'
        ? candidate
        : `<non-string:${typeof candidate}>`;
    logger.warn(
      `${context ?? 'subscription'}: ignoring unrecognized tier metadata "${candidateLabel}" — defaulting to FREE`,
    );
  }
  return 'FREE';
}

const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7-day grace window for past_due (C-1)
const PROCESSED_SESSIONS_CAP = 10000; // in-memory confirm-session dedup bound
const IMMEDIATE_DOWNGRADE_STATUSES = [
  'unpaid',
  'canceled',
  'paused',
  'incomplete_expired',
];

type GraceExpiryRow = { id: string; previousTier: string };
type ForceTierExpiryRow = { id: string; expiredForceTier: string };

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly priceMap: PriceMap;
  private readonly stripe: InstanceType<typeof Stripe>;
  // Issue 7: Map<sessionId, restaurantId> so the fast-path returns the exact
  // restaurant tied to the session rather than an arbitrary first-match.
  private readonly processedSessions = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const stripeKey =
      this.configService.get<string>('STRIPE_SECRET_KEY') ||
      process.env.STRIPE_SECRET_KEY ||
      'sk_test_placeholder';
    this.stripe = new Stripe(stripeKey, {
      apiVersion: '2026-05-27.dahlia',
    });

    // Built here (not at module load) so env vars injected after import are
    // reflected — critical for tests and runtime config injection (M-7).
    this.priceMap = {
      STARTER: {
        monthly: this.configService.get<string>(
          'STRIPE_PRICE_STARTER_MONTHLY',
          '',
        ),
        yearly: this.configService.get<string>(
          'STRIPE_PRICE_STARTER_YEARLY',
          '',
        ),
      },
      PROFESSIONAL: {
        monthly: this.configService.get<string>(
          'STRIPE_PRICE_PROFESSIONAL_MONTHLY',
          '',
        ),
        yearly: this.configService.get<string>(
          'STRIPE_PRICE_PROFESSIONAL_YEARLY',
          '',
        ),
      },
      ENTERPRISE: {
        monthly: this.configService.get<string>(
          'STRIPE_PRICE_ENTERPRISE_MONTHLY',
          '',
        ),
        yearly: this.configService.get<string>(
          'STRIPE_PRICE_ENTERPRISE_YEARLY',
          '',
        ),
      },
    };

    // Boot-time guard: refuse to operate against Stripe in production without a
    // secret key (M-8). Mirrors the webhook-secret guard in main.ts.
    if (
      process.env.NODE_ENV === 'production' &&
      stripeKey === 'sk_test_placeholder'
    ) {
      throw new Error('[Startup] STRIPE_SECRET_KEY must be set in production');
    }
  }

  async createCheckoutSession(
    restaurantId: string,
    tier: string,
    billingPeriod: 'monthly' | 'yearly',
    ownerId: string,
    onboarding = false,
  ) {
    const priceId = this.priceMap[tier]?.[billingPeriod];
    if (!priceId) {
      throw new BadRequestException(
        `No Stripe price configured for tier ${tier} (${billingPeriod})`,
      );
    }

    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { stripeCustomerId: true, ownerId: true },
    });

    if (restaurant.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this restaurant');
    }

    let stripeCustomerId = restaurant.stripeCustomerId;

    if (!stripeCustomerId) {
      const user = await this.prisma.user.findUniqueOrThrow({
        where: { id: ownerId },
      });
      const customer = await this.stripe.customers.create({
        email: user.email,
        metadata: { restaurantId },
      });
      stripeCustomerId = customer.id;
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { stripeCustomerId },
      });
    }

    const existingSubs = await this.stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 5,
    });
    const blockStatuses = ['active', 'past_due', 'unpaid', 'trialing'];
    const activeSub = existingSubs.data.find((sub: any) =>
      blockStatuses.includes(sub.status),
    );
    if (activeSub) {
      throw new BadRequestException({
        code: 'ALREADY_SUBSCRIBED',
        message:
          'Active/trialing subscription exists. Use the Billing Portal to change plans.',
      });
    }

    const session = await this.stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: onboarding
        ? `${process.env.FRONTEND_URL || 'http://localhost:3001'}/onboarding?stripe=success&session_id={CHECKOUT_SESSION_ID}`
        : `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?subscribed=true`,
      cancel_url: onboarding
        ? `${process.env.FRONTEND_URL || 'http://localhost:3001'}/onboarding?stripe=cancel`
        : `${process.env.FRONTEND_URL || 'http://localhost:3001'}/pricing`,
      metadata: { restaurantId, tier },
    });

    return { url: session.url };
  }

  async confirmCheckoutSession(
    sessionId: string,
    userId: string,
  ): Promise<{ tier: string }> {
    if (this.processedSessions.has(sessionId)) {
      // Issue 7: look up the exact restaurant stored for this session, not an
      // arbitrary first-match by ownerId (wrong for multi-restaurant owners).
      const cachedRestaurantId = this.processedSessions.get(sessionId);
      const restaurant = cachedRestaurantId
        ? await this.prisma.restaurant.findUnique({
            where: { id: cachedRestaurantId },
            select: { tier: true, forceTier: true },
          })
        : null;
      const tier = restaurant?.forceTier ?? restaurant?.tier ?? 'FREE';
      return { tier: String(tier) };
    }

    let session: any;
    try {
      session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items'],
      });
    } catch (err) {
      // F-PAY-2: a Stripe API failure (network/rate-limit) is not proof the
      // customer has no subscription — silently returning FREE would make a
      // paying customer see FREE tier on a transient error. Surface it as
      // retryable instead; only an authoritative Stripe result should ever
      // produce a FREE result here.
      this.logger.error(
        `Stripe checkout session retrieval failed for session=${sessionId} userId=${userId}`,
        err as Error,
      );
      throw new ServiceUnavailableException(
        'Could not confirm your checkout session right now. Please retry shortly.',
      );
    }

    if (session.status !== 'complete') return { tier: 'FREE' };

    const customerId = session.customer as string;

    // Verify the caller owns the restaurant tied to this Stripe customer — a
    // session id alone must not let a user activate another tenant's tier (C-2).
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { stripeCustomerId: customerId },
      select: { id: true, ownerId: true },
    });
    if (!restaurant || restaurant.ownerId !== userId) {
      throw new ForbiddenException(
        'Session does not belong to your restaurant',
      );
    }

    const subscriptionId = session.subscription as string;
    const priceId = session.line_items?.data?.[0]?.price?.id as
      | string
      | undefined;
    const tier = priceId
      ? getTierFromPrice(this.priceMap, priceId)
      : normalizeTier(
          session.metadata?.tier,
          this.logger,
          'confirmCheckoutSession',
        );
    const eventTime = new Date(session.created * 1000);

    await this.prisma.restaurant.updateMany({
      where: {
        stripeCustomerId: customerId,
        OR: [{ tierUpdatedAt: null }, { tierUpdatedAt: { lt: eventTime } }],
      },
      data: {
        tier: tier as any,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId ?? null,
        tierUpdatedAt: eventTime,
        pastDueGraceExpiry: null,
      },
    });

    // Bounded FIFO eviction: drop the oldest id once over the cap instead of
    // wiping the whole Map. A full clear() across an `await` boundary can lose
    // ids added by interleaved calls, re-admitting a just-processed session.
    // (The DB tierUpdatedAt `lte` guard keeps replays idempotent regardless —
    // this Map is only a fast-path to skip redundant Stripe API calls.)
    // Issue 7: store restaurantId so the fast path can do an exact lookup.
    this.processedSessions.set(sessionId, restaurant.id);
    while (this.processedSessions.size > PROCESSED_SESSIONS_CAP) {
      const oldest = this.processedSessions.keys().next().value;
      if (oldest === undefined) break;
      this.processedSessions.delete(oldest);
    }

    this.logger.log(`Session confirmed: customer=${customerId} tier=${tier}`);
    return { tier };
  }

  async createPortalSession(restaurantId: string, ownerId: string) {
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { stripeCustomerId: true, ownerId: true },
    });
    if (restaurant.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this restaurant');
    }
    const stripeCustomerId = restaurant.stripeCustomerId;
    if (!stripeCustomerId)
      throw new BadRequestException(
        'No Stripe customer associated with this restaurant',
      );

    const session = await this.stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?tab=settings`,
    });

    return { url: session.url };
  }

  async getSubscriptionDetails(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { stripeSubscriptionId: true },
    });
    if (!restaurant?.stripeSubscriptionId) return null;

    try {
      const sub = (await this.stripe.subscriptions.retrieve(
        restaurant.stripeSubscriptionId,
      )) as any;
      const item = sub.items?.data?.[0];
      // Stripe API ≥2024-09-30 moved current_period_* from Subscription to SubscriptionItem
      const periodStart: number =
        sub.current_period_start ?? item?.current_period_start;
      const periodEnd: number =
        sub.current_period_end ?? item?.current_period_end;
      return {
        currentPeriodStart: periodStart
          ? new Date(periodStart * 1000).toISOString()
          : null,
        currentPeriodEnd: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end as boolean,
        status: sub.status as string,
        interval: (item?.price?.recurring?.interval as string) ?? null,
      };
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to fetch Stripe subscription ${restaurant.stripeSubscriptionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const secret =
      this.configService.get<string>('STRIPE_SUBSCRIPTION_WEBHOOK_SECRET') ||
      process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET ||
      '';
    if (!secret) {
      this.logger.error('Webhook secret not configured');
      throw new BadRequestException('Webhook secret not configured');
    }
    let event: any;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      this.logger.error('Webhook signature verification failed');
      throw err;
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.paused':
        await this.applySubscriptionFromEvent(event);
        break;
      case 'customer.subscription.deleted':
        await this.applyCancellationFromEvent(event);
        break;
      case 'invoice.payment_failed': {
        // Do NOT downgrade here. Stripe will transition the subscription to
        // `past_due`, which fires `customer.subscription.updated`; the 7-day
        // grace window is enforced there via the status check (C-1).
        const failedCustomer = event.data.object?.customer;
        this.logger.warn(
          `invoice.payment_failed: customer=${failedCustomer} — entering grace period, no immediate downgrade`,
        );
        break;
      }
      default:
        this.logger.log(`Ignoring webhook event: ${event.type}`);
    }

    return { received: true };
  }

  private async applySubscriptionFromEvent(event: any) {
    const obj = event.data.object;
    const customerId = obj.customer as string;
    const eventTime = new Date(event.created * 1000);

    // checkout.session.completed: obj is a Session — no items.data, but metadata.tier is set
    // customer.subscription.updated: obj is a Subscription — items.data has the price
    let tier: string;
    let subscriptionId: string;
    let priceId: string | undefined;
    // Persisted to DB so the hourly cron enforces downgrade even without a
    // follow-up Stripe webhook after grace expires (C-1 fix).
    let pastDueGraceExpiry: Date | null = null;

    if (event.type === 'checkout.session.completed') {
      subscriptionId = obj.subscription as string;
      if (subscriptionId) {
        try {
          const sub = await this.stripe.subscriptions.retrieve(subscriptionId);
          priceId = sub.items?.data?.[0]?.price?.id;
          tier = priceId
            ? getTierFromPrice(this.priceMap, priceId)
            : normalizeTier(
                obj.metadata?.tier,
                this.logger,
                'checkout.session.completed',
              );
        } catch (err) {
          this.logger.error(
            `Failed to retrieve subscription ${subscriptionId} for checkout.session.completed: ${
              err instanceof Error ? err.message : err
            }`,
          );
          tier = normalizeTier(
            obj.metadata?.tier,
            this.logger,
            'checkout.session.completed (retrieve failed)',
          );
        }
      } else {
        tier = normalizeTier(
          obj.metadata?.tier,
          this.logger,
          'checkout.session.completed (no subscription)',
        );
      }
    } else {
      priceId = obj.items?.data?.[0]?.price?.id as string | undefined;
      tier = priceId ? getTierFromPrice(this.priceMap, priceId) : 'FREE';
      subscriptionId = obj.id as string;

      // Subscription status gating (C-1). Only present on Subscription objects
      // (customer.subscription.created/updated), not on checkout Sessions.
      const subStatus = obj.status as string | undefined;

      if (subStatus === 'past_due') {
        const periodEnd = obj.current_period_end as number | undefined;
        const graceExpiry = periodEnd
          ? new Date(periodEnd * 1000 + PAST_DUE_GRACE_MS)
          : null;
        if (graceExpiry && new Date() > graceExpiry) {
          tier = 'FREE';
          this.logger.warn(
            `past_due grace expired for customer=${customerId} (graceEnd=${graceExpiry.toISOString()}) — downgrading to FREE`,
          );
          // Grace already expired — no need to persist the expiry date.
          pastDueGraceExpiry = null;
        } else {
          // Within grace window: persist the expiry so the hourly cron can
          // enforce the downgrade even without a subsequent Stripe webhook.
          pastDueGraceExpiry = graceExpiry;
          this.logger.warn(
            `past_due within grace for customer=${customerId}: keeping ${tier} until ${
              graceExpiry ? graceExpiry.toISOString() : 'unknown'
            }`,
          );
        }
      } else if (
        subStatus &&
        IMMEDIATE_DOWNGRADE_STATUSES.includes(subStatus)
      ) {
        tier = 'FREE';
        pastDueGraceExpiry = null;
        this.logger.warn(
          `Subscription status=${subStatus} for customer=${customerId} — downgrading to FREE`,
        );
      }
      // active/trialing (or absent): keep computed tier, clear any stale grace expiry.
    }

    const result = await this.prisma.restaurant.updateMany({
      where: {
        stripeCustomerId: customerId,
        OR: [{ tierUpdatedAt: null }, { tierUpdatedAt: { lte: eventTime } }],
      },
      data: {
        tier: tier as any,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId ?? null,
        tierUpdatedAt: eventTime,
        pastDueGraceExpiry: pastDueGraceExpiry,
      },
    });

    this.logger.log(
      `Subscription event ${event.type}: customer=${customerId} tier=${tier} applied=${result.count > 0}`,
    );
  }

  private async applyCancellationFromEvent(event: any) {
    const sub = event.data.object;
    const customerId = sub.customer as string;
    const eventTime = new Date(event.created * 1000);

    await this.prisma.restaurant.updateMany({
      where: {
        stripeCustomerId: customerId,
        OR: [{ tierUpdatedAt: null }, { tierUpdatedAt: { lte: eventTime } }],
      },
      data: {
        tier: 'FREE',
        stripeSubscriptionId: null,
        stripePriceId: null,
        tierUpdatedAt: eventTime,
        pastDueGraceExpiry: null,
      },
    });

    this.logger.log(`Subscription cancelled: customer=${customerId}`);
  }

  /**
   * Enforce the 7-day past_due grace period without relying on a follow-up
   * Stripe webhook. Runs every hour; finds restaurants whose grace window has
   * elapsed and downgrades them to FREE.  This is the safety net for the case
   * where Stripe sends no further subscription lifecycle event after the initial
   * past_due transition (e.g. if the dunning cycle completes silently).
   */
  @Cron(CronExpression.EVERY_HOUR)
  async enforceGraceExpiry(): Promise<void> {
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<GraceExpiryRow[]>`
        WITH candidates AS (
          SELECT id, tier::text AS "previousTier"
          FROM "restaurant"
          WHERE "pastDueGraceExpiry" IS NOT NULL
            AND "pastDueGraceExpiry" < ${now}
            AND tier <> 'FREE'
          FOR UPDATE SKIP LOCKED
        ),
        updated AS (
          UPDATE "restaurant" r
          SET tier = 'FREE',
              "pastDueGraceExpiry" = NULL,
              "tierUpdatedAt" = ${now}
          FROM candidates c
          WHERE r.id = c.id
          RETURNING r.id, c."previousTier"
        )
        SELECT id, "previousTier" FROM updated
      `;

      // F-PAY-3: createMany instead of Promise.all(...create) — a single
      // batched write instead of N concurrent writes on the same transaction
      // connection (Prisma serializes them anyway under PgBouncer transaction
      // mode, so Promise.all bought nothing but was still a rule violation).
      if (rows.length > 0) {
        await tx.adminAuditLog.createMany({
          data: rows.map((r) => ({
            action: 'TIER_DOWNGRADE',
            targetType: 'RESTAURANT',
            targetId: r.id,
            metadata: {
              actor: 'SYSTEM',
              reason: 'grace_expiry',
              previousTier: r.previousTier,
            },
          })),
        });
      }

      return rows;
    });

    if (updated.length === 0) return;
    const targets = updated;

    this.logger.warn(
      `enforceGraceExpiry: downgraded ${targets.length} restaurant(s) to FREE — past_due grace period expired`,
    );
  }

  /**
   * Auto-expire super-admin tier overrides (M-2). A `forceTier` with a
   * `forceTierExpiresAt` in the past is cleared so the restaurant falls back to
   * its real (Stripe-derived) tier. Prevents a forgotten override from granting
   * — or denying — a tier indefinitely. Runs hourly alongside grace enforcement.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async enforceForceTierExpiry(): Promise<void> {
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ForceTierExpiryRow[]>`
        WITH candidates AS (
          SELECT id, "forceTier"::text AS "expiredForceTier"
          FROM "restaurant"
          WHERE "forceTier" IS NOT NULL
            AND "forceTierExpiresAt" IS NOT NULL
            AND "forceTierExpiresAt" < ${now}
          FOR UPDATE SKIP LOCKED
        ),
        updated AS (
          UPDATE "restaurant" r
          SET "forceTier" = NULL,
              "forceTierExpiresAt" = NULL
          FROM candidates c
          WHERE r.id = c.id
          RETURNING r.id, c."expiredForceTier"
        )
        SELECT id, "expiredForceTier" FROM updated
      `;

      if (rows.length > 0) {
        await tx.adminAuditLog.createMany({
          data: rows.map((r) => ({
            action: 'TIER_CLEAR',
            targetType: 'RESTAURANT',
            targetId: r.id,
            metadata: {
              actor: 'SYSTEM',
              reason: 'force_tier_expiry',
              expiredForceTier: r.expiredForceTier,
            },
          })),
        });
      }

      return rows;
    });

    if (updated.length === 0) return;
    const targets = updated;

    this.logger.warn(
      `enforceForceTierExpiry: cleared ${targets.length} expired tier override(s)`,
    );
  }
}
