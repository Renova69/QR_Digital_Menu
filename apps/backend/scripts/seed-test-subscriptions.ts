/**
 * Creates real Stripe test subscriptions for all non-FREE restaurants
 * that currently have no stripeSubscriptionId.
 *
 * Run: cd apps/backend && npx tsx scripts/seed-test-subscriptions.ts
 */

import 'dotenv/config';
import Stripe from 'stripe';
import { PrismaClient, SubscriptionTier } from '@prisma/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia' as any,
});

const prisma = new PrismaClient();

const PRICE_MAP: Record<string, string> = {
  STARTER: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
  PROFESSIONAL: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY!,
  ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY!,
};

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    where: {
      stripeSubscriptionId: null,
      tier: {
        in: ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as SubscriptionTier[],
      },
      deletedAt: null,
    },
    include: {
      owner: { select: { email: true, name: true } },
    },
  });

  if (restaurants.length === 0) {
    console.log('No paid-tier restaurants without subscriptions found.');
    return;
  }

  console.log(`Found ${restaurants.length} restaurants to subscribe:\n`);

  for (const restaurant of restaurants) {
    const priceId = PRICE_MAP[restaurant.tier];
    if (!priceId) {
      console.warn(
        `  SKIP ${restaurant.name} — no price ID for tier ${restaurant.tier}`,
      );
      continue;
    }

    try {
      // Create Stripe customer if missing
      let customerId = restaurant.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: restaurant.owner.email,
          name: restaurant.name,
          metadata: { restaurantId: restaurant.id },
        });
        customerId = customer.id;
        console.log(`  Created customer ${customerId} for ${restaurant.name}`);
      } else {
        console.log(`  Reusing customer ${customerId} for ${restaurant.name}`);
      }

      // Create test payment method from tok_visa and attach
      const pm = await stripe.paymentMethods.create({
        type: 'card',
        card: { token: 'tok_visa' } as any,
      });
      await stripe.paymentMethods.attach(pm.id, { customer: customerId });
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: pm.id },
      });

      // Create subscription
      const sub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        default_payment_method: pm.id,
      });

      // Persist to DB
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: {
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          tierUpdatedAt: new Date(sub.created * 1000),
        },
      });

      console.log(
        `  ✓ ${restaurant.name} (${restaurant.tier}) → sub ${sub.id} [${sub.status}]\n`,
      );
    } catch (err: any) {
      console.error(`  ✗ ${restaurant.name} — ${err.message}\n`);
    }
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
