import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const items = await prisma.menuItem.findMany({
    take: 2,
    select: { name: true, translations: true },
  });
  console.log(JSON.stringify(items, null, 2));
}
main().finally(() => prisma.$disconnect());
