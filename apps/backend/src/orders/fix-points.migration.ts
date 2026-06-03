import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixPointsCalculation() {
  console.log('🔧 Fixing points calculation for existing orders...\n');

  // Get all orders with the incorrectly calculated points
  const orders = await prisma.order.findMany({
    where: {
      customerId: { not: null },
      pointsEarned: { gt: 0 },
    },
    include: {
      restaurant: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Found ${orders.length} orders to fix\n`);

  let totalAdjusted = 0;

  for (const order of orders) {
    const restaurant = order.restaurant;
    const exchangeRate = restaurant.loyaltyExchangeRate || 20;

    // Recalculate: (totalPrice * exchangeRate) + signup bonus if first order
    const newPointsEarned = Math.floor(order.totalPrice * exchangeRate);

    console.log(`Order ${order.id}:`);
    console.log(`  Before: ${order.pointsEarned} pts`);
    console.log(
      `  €${order.totalPrice} × ${exchangeRate} = ${newPointsEarned} pts`,
    );

    // Update the order
    await prisma.order.update({
      where: { id: order.id },
      data: { pointsEarned: newPointsEarned },
    });

    // Also update the loyalty account
    // Find the loyalty account
    const loyaltyAcc = await prisma.loyaltyAccount.findUnique({
      where: {
        userId_restaurantId: {
          userId: order.customerId!,
          restaurantId: order.restaurantId,
        },
      },
    });

    if (loyaltyAcc) {
      const diff = newPointsEarned - order.pointsEarned;
      totalAdjusted += diff;

      await prisma.loyaltyAccount.update({
        where: { id: loyaltyAcc.id },
        data: {
          points: loyaltyAcc.points + diff,
          lifetimePoints: loyaltyAcc.lifetimePoints + diff,
        },
      });

      console.log(
        `  Adjusted loyalty account by: ${diff > 0 ? '+' : ''}${diff} pts`,
      );
    }

    console.log('');
  }

  console.log(
    `✅ Total points adjusted: ${totalAdjusted > 0 ? '+' : ''}${totalAdjusted}\n`,
  );
}

fixPointsCalculation()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
