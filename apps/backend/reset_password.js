const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);
  
  await prisma.user.upsert({
    where: { email: 'test@test.com' },
    update: { password: hashedPassword },
    create: {
      email: 'test@test.com',
      password: hashedPassword,
      name: 'Test User',
      role: 'OWNER'
    }
  });
  
  console.log('Password for test@test.com has been set to: password123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
