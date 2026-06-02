import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2026-05-27.dahlia',
});

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

const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7-day grace window for past_due (C-1)
const IMMEDIATE_DOWNGRADE_STATUSES = ['unpaid', 'canceled', 'paused', 'incomplete_expired'];

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly priceMap: PriceMap;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Built here (not at module load) so env vars injected after import are
    // reflected — critical for tests and runtime config injection (M-7).
    this.priceMap = {
      STARTER: {
        monthly: this.configService.get<string>('STRIPE_PRICE_STARTER_MONTHLY', ''),
        yearly: this.configService.get<string>('STRIPE_PRICE_STARTER_YEARLY', ''),
      },
      PROFESSIONAL: {
        monthly: this.configService.get<string>('STRIPE_PRICE_PROFESSIONAL_MONTHLY', ''),
        yearly: this.configService.get<string>('STRIPE_PRICE_PROFESSIONAL_YEARLY', ''),
      },
      ENTERPRISE: {
        monthly: this.configService.get<string>('STRIPE_PRICE_ENTERPRISE_MONTHLY', ''),
        yearly: this.configService.get<string>('STRIPE_PRICE_ENTERPRISE_YEARLY', ''),
      },
    };

    // Boot-time guard: refuse to operate against Stripe in production without a
    // secret key (M-8). Mirrors the webhook-secret guard in main.ts.
    if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY) {
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
      throw new BadRequestException(`No Stripe price configured for tier ${tier} (${billingPeriod})`);
    }

    let { stripeCustomerId } = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { stripeCustomerId: true },
    });

    if (!stripeCustomerId) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: ownerId } });
      const customer = await stripe.customers.create({ email: user.email, metadata: { restaurantId } });
      stripeCustomerId = customer.id;
      await this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { stripeCustomerId },
      });
    }

    const existingSubs = await stripe.subscriptions.list({
      customer: stripeCustomerId!,
      status: 'active',
      limit: 5,
    });
    if (existingSubs.data.length > 0) {
      throw new BadRequestException({
        code: 'ALREADY_SUBSCRIBED',
        message: 'Active subscription exists. Use the Billing Portal to change plans.',
      });
    }

    const session = await stripe.checkout.sessions.create({
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

  async confirmCheckoutSession(sessionId: string, userId: string): Promise<{ tier: string }> {
    let session: any;
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch {
      return { tier: 'FREE' };
    }

    if (session.status !== 'complete') return { tier: 'FREE' };

    const customerId = session.customer as string;

    // Verify the caller owns the restaurant tied to this Stripe customer — a
    // session id alone must not let a user activate another tenant's tier (C-2).
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { stripeCustomerId: customerId },
      select: { ownerId: true },
    });
    if (!restaurant || restaurant.ownerId !== userId) {
      throw new ForbiddenException('Session does not belong to your restaurant');
    }

    const tier = (session.metadata?.tier as string) ?? 'FREE';
    const subscriptionId = session.subscription as string;
    const eventTime = new Date(session.created * 1000);

    await this.prisma.restaurant.updateMany({
      where: {
        stripeCustomerId: customerId,
        OR: [{ tierUpdatedAt: null }, { tierUpdatedAt: { lt: eventTime } }],
      },
      data: {
        tier: tier as any,
        stripeSubscriptionId: subscriptionId,
        tierUpdatedAt: eventTime,
      },
    });

    this.logger.log(`Session confirmed: customer=${customerId} tier=${tier}`);
    return { tier };
  }

  async createPortalSession(restaurantId: string) {
    const { stripeCustomerId } = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { stripeCustomerId: true },
    });
    if (!stripeCustomerId) throw new BadRequestException('No Stripe customer associated with this restaurant');

    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard/settings`,
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
      const sub = await stripe.subscriptions.retrieve(restaurant.stripeSubscriptionId) as any;
      const item = sub.items?.data?.[0];
      // Stripe API ≥2024-09-30 moved current_period_* from Subscription to SubscriptionItem
      const periodStart: number = sub.current_period_start ?? item?.current_period_start;
      const periodEnd: number = sub.current_period_end ?? item?.current_period_end;
      return {
        currentPeriodStart: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end as boolean,
        status: sub.status as string,
        interval: (item?.price?.recurring?.interval as string) ?? null,
      };
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to fetch Stripe subscription ${restaurant.stripeSubscriptionId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return null;
    }
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    const secret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || '';
    let event: any;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      this.logger.error('Webhook signature verification failed');
      throw err;
    }

    switch (event.type) {
      case 'checkout.session.completed':
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.applySubscriptionFromEvent(event);
        break;
      case 'customer.subscription.deleted':
        await this.applyCancellationFromEvent(event);
        break;
      case 'invoice.payment_failed': {
        // Do NOT downgrade here. Stripe will transition the subscription to
        // `past_due`, which fires `customer.subscription.updated`; the 7-day
        // grace window is enforced there via the status check (C-1).
        const failedCustomer = (event.data.object as any)?.customer;
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
    const obj = event.data.object as any;
    const customerId = obj.customer as string;
    const eventTime = new Date(event.created * 1000);

    // checkout.session.completed: obj is a Session — no items.data, but metadata.tier is set
    // customer.subscription.updated: obj is a Subscription — items.data has the price
    let tier: string;
    let subscriptionId: string;
    let priceId: string | undefined;

    if (event.type === 'checkout.session.completed') {
      tier = (obj.metadata?.tier as string) ?? 'FREE';
      subscriptionId = obj.subscription as string;
    } else {
      priceId = obj.items?.data?.[0]?.price?.id as string | undefined;
      tier = priceId ? getTierFromPrice(this.priceMap, priceId) : 'FREE';
      subscriptionId = obj.id as string;

      // Subscription status gating (C-1). Only present on Subscription objects
      // (customer.subscription.created/updated), not on checkout Sessions.
      const subStatus = obj.status as string | undefined;
      if (subStatus === 'past_due') {
        // Keep paid tier during a 7-day grace window measured from the period
        // end; downgrade to FREE only once that window has elapsed.
        const periodEnd = obj.current_period_end as number | undefined;
        const graceExpiry = periodEnd
          ? new Date(periodEnd * 1000 + PAST_DUE_GRACE_MS)
          : null;
        if (graceExpiry && new Date() > graceExpiry) {
          tier = 'FREE';
          this.logger.warn(
            `past_due grace expired for customer=${customerId} (graceEnd=${graceExpiry.toISOString()}) — downgrading to FREE`,
          );
        } else {
          // No schema field for grace persistence; log the window for operators.
          this.logger.warn(
            `past_due within grace for customer=${customerId}: keeping ${tier} until ${
              graceExpiry ? graceExpiry.toISOString() : 'unknown'
            }`,
          );
        }
      } else if (subStatus && IMMEDIATE_DOWNGRADE_STATUSES.includes(subStatus)) {
        tier = 'FREE';
        this.logger.warn(
          `Subscription status=${subStatus} for customer=${customerId} — downgrading to FREE`,
        );
      }
      // active/trialing (or absent): keep the computed tier as-is.
    }

    const result = await this.prisma.restaurant.updateMany({
      where: {
        stripeCustomerId: customerId,
        OR: [
          { tierUpdatedAt: null },
          { tierUpdatedAt: { lt: eventTime } },
        ],
      },
      data: {
        tier: tier as any,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId ?? null,
        tierUpdatedAt: eventTime,
      },
    });

    this.logger.log(
      `Subscription event ${event.type}: customer=${customerId} tier=${tier} applied=${result.count > 0}`,
    );
  }

  private async applyCancellationFromEvent(event: any) {
    const sub = event.data.object as any;
    const customerId = sub.customer as string;
    const eventTime = new Date(event.created * 1000);

    await this.prisma.restaurant.updateMany({
      where: {
        stripeCustomerId: customerId,
        OR: [
          { tierUpdatedAt: null },
          { tierUpdatedAt: { lt: eventTime } },
        ],
      },
      data: {
        tier: 'FREE',
        stripeSubscriptionId: null,
        stripePriceId: null,
        tierUpdatedAt: eventTime,
      },
    });

    this.logger.log(`Subscription cancelled: customer=${customerId}`);
  }
}
