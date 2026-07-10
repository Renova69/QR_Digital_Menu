import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const item = await prisma.menuItem.findFirst({
    where: {
      name: {
        contains: 'Truffle Burrata',
        mode: 'insensitive',
      },
    },
  });

  if (!item) {
    console.log('Item not found');
    return;
  }

  console.log('Main Item:', JSON.stringify(item, null, 2));

  if (item.relatedItemIds && item.relatedItemIds.length > 0) {
    const pairings = await prisma.menuItem.findMany({
      where: {
        id: { in: item.relatedItemIds },
      },
    });
    console.log('Pairings found in DB:', JSON.stringify(pairings, null, 2));
  } else {
    console.log('No relatedItemIds found for this item.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
