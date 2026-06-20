/**
 * Demo restaurants for SaaS tiering QA.
 * Run: npx ts-node prisma/seed-demo-restaurants.ts
 *
 * Creates 4 owners + 4 restaurants (one per tier) without touching existing data.
 * Owner ↔ Restaurant link is via Restaurant.ownerId — never User.restaurantId.
 */
import 'dotenv/config';
import { PrismaClient, SubscriptionTier } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

const DEMOS: { email: string; name: string; restaurantName: string; tier: SubscriptionTier }[] = [
  { email: 'demo.free@qrmenu.test',         name: 'Demo Free',         restaurantName: 'Free Bistro',         tier: SubscriptionTier.FREE },
  { email: 'demo.starter@qrmenu.test',      name: 'Demo Starter',      restaurantName: 'Starter Kitchen',     tier: SubscriptionTier.STARTER },
  { email: 'demo.pro@qrmenu.test',          name: 'Demo Professional', restaurantName: 'Pro Dining',          tier: SubscriptionTier.PROFESSIONAL },
  { email: 'demo.enterprise@qrmenu.test',   name: 'Demo Enterprise',   restaurantName: 'Enterprise Restaurant', tier: SubscriptionTier.ENTERPRISE },
];

async function main() {
  // ── 3-layer safety guard (mirrors seed.ts) ──────────────────────────────
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Seed aborted: NODE_ENV=production. Never seed against a production database.');
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1') && dbUrl !== '') {
    console.error('❌ Seed aborted: DATABASE_URL points to a remote database.');
    console.error('   Seeds wipe ALL data. Connect to a local/dev database only.');
    console.error('   To override (e.g. intentional dev cloud DB), set ALLOW_REMOTE_SEED=true');
    if (process.env.ALLOW_REMOTE_SEED !== 'true') process.exit(1);
    console.warn('⚠️  ALLOW_REMOTE_SEED=true — proceeding with remote seed.');
  }
  const userCount = await prisma.user.count();
  if (userCount > 5) {
    console.error(`❌ Seed aborted: ${userCount} users exist. Refusing to wipe a populated database.`);
    console.error('   Seeds are for fresh/dev databases only.');
    console.error('   To force (DESTRUCTIVE), set FORCE_SEED_WIPE=true');
    if (process.env.FORCE_SEED_WIPE !== 'true') process.exit(1);
    console.warn('⚠️  FORCE_SEED_WIPE=true — proceeding despite populated database.');
  }
  // ─────────────────────────────────────────────────────────────────────────

  const password = await bcrypt.hash('demo1234', SALT_ROUNDS);

  for (const d of DEMOS) {
    const existing = await prisma.user.findUnique({ where: { email: d.email } });
    const user = existing ?? await prisma.user.create({
      data: { email: d.email, password, name: d.name, role: 'OWNER' },
    });

    const existingRestaurant = await prisma.restaurant.findFirst({ where: { ownerId: user.id } });
    if (existingRestaurant) {
      await prisma.restaurant.update({
        where: { id: existingRestaurant.id },
        data: {
          tier: d.tier,
          forceTier: null,
          paymentsEnabled: d.tier === SubscriptionTier.PROFESSIONAL || d.tier === SubscriptionTier.ENTERPRISE,
        },
      });
      console.log(`Updated ${d.restaurantName} -> ${d.tier}`);
    } else {
      await prisma.restaurant.create({
        data: {
          name: d.restaurantName,
          country: 'BG',
          ownerId: user.id,
          tier: d.tier,
          paymentsEnabled: d.tier === SubscriptionTier.PROFESSIONAL || d.tier === SubscriptionTier.ENTERPRISE,
        },
      });
      console.log(`Created ${d.restaurantName} (${d.tier}) — owner: ${d.email} / demo1234`);
    }
  }

  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
