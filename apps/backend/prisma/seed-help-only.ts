import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedHelpContent } from './seed-help-content';

const prisma = new PrismaClient();

async function main() {
  // ── Safety guards ─────────────────────────────────────────────────────────
  // Non-destructive: this seeder only does idempotent upserts of Help Center
  // content — it NEVER wipes data. So there is no userCount/FORCE_SEED_WIPE
  // gate (running it against a populated DB is the intended use case). Guards
  // below just prevent accidentally writing to the wrong database.
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Seed aborted: NODE_ENV=production. Never seed against a production database.');
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1') && dbUrl !== '') {
    console.error('❌ Seed aborted: DATABASE_URL points to a remote database.');
    console.error('   Connect to a local/dev database, or set ALLOW_REMOTE_SEED=true to override.');
    if (process.env.ALLOW_REMOTE_SEED !== 'true') process.exit(1);
    console.warn('⚠️  ALLOW_REMOTE_SEED=true — proceeding with remote seed.');
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
