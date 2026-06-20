import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedHelpContent } from './seed-help-content';

const prisma = new PrismaClient();

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

  console.log('🌱 Starting safe Help Content seed...');
  console.log('ℹ️  This script will ONLY seed the Help Center content and will NOT touch your existing users, restaurants, or orders.');

  await seedHelpContent(prisma);

  console.log('✅ Help Content seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
