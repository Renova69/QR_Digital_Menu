const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const orders = await prisma.order.findMany({
    where: {
      id: { endsWith: '57u97o' }
    },
    include: {
      staff: true
    }
  });

  if (orders.length === 0) {
    // try case insensitive or uppercase
    const allOrders = await prisma.order.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: { staff: true }
    });
    const found = allOrders.find(o => o.id.toUpperCase().endsWith('57U97O'));
    console.log(JSON.stringify(found || { message: "Order not found in last 100" }, null, 2));
  } else {
    console.log(JSON.stringify(orders, null, 2));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
