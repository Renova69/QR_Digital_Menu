import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedHelpContent } from './seed-help-content';

const prisma = new PrismaClient();

async function main() {
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
