const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.restaurant.findFirst().then(console.log).finally(() => prisma.$disconnect());
