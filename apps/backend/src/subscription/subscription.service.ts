import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2026-04-22.dahlia',
});

const PRICE_MAP: Record<string, Record<'monthly' | 'yearly', string>> = {
  STARTER: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY || '',
  },
  PROFESSIONAL: {
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_PROFESSIONAL_YEARLY || '',
  },
  ENTERPRISE: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || '',
  },
};

function getTierFromPrice(priceId: string): string {
  for (const [tier, periods] of Object.entries(PRICE_MAP)) {
    if (periods.monthly === priceId || periods.yearly === priceId) return tier;
  }
  return 'FREE';
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createCheckoutSession(
    restaurantId: string,
    tier: string,
    billingPeriod: 'monthly' | 'yearly',
    ownerId: string,
  ) {
    const priceId = PRICE_MAP[tier]?.[billingPeriod];
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
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard?subscribed=true`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/pricing`,
      metadata: { restaurantId, tier },
    });

    return { url: session.url };
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
      return {
        currentPeriodStart: new Date(sub.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: sub.cancel_at_period_end as boolean,
        status: sub.status as string,
        interval: (sub.items?.data?.[0]?.price?.recurring?.interval as string) ?? null,
      };
    } catch {
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
      tier = priceId ? getTierFromPrice(priceId) : 'FREE';
      subscriptionId = obj.id as string;
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
