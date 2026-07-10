import { PrismaClient } from '@prisma/client';
import { DateTime } from 'luxon';

const prisma = new PrismaClient();

async function main() {
  const restaurantId = 'cmobskej30001r6b0a68393at'; // Assuming this from the IDs
  // Actually let's just find the restaurant of the Truffle Burrata
  const item = await prisma.menuItem.findFirst({
    where: { name: { contains: 'Truffle Burrata' } },
    include: { category: true },
  });

  if (!item) return;
  const restaurantIdFound = item.category.restaurantId;

  const allCategories = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurantIdFound },
    include: {
      items: {
        where: { isOutOfStock: false },
        orderBy: { order: 'asc' },
        include: { options: true },
      },
    },
    orderBy: { order: 'asc' },
  });

  const truffleBurrata = allCategories
    .flatMap((c) => c.items)
    .find((i) => i.name.includes('Truffle Burrata'));
  console.log(
    'Truffle Burrata from findMany:',
    JSON.stringify(truffleBurrata, null, 2),
  );
  console.log('relatedItemIds present?', !!truffleBurrata?.relatedItemIds);
  console.log('relatedItemIds value:', truffleBurrata?.relatedItemIds);
}

main().finally(() => prisma.$disconnect());
