const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.restaurantTable.findMany({where: {type: 'ROOM'}}).then(r => console.dir(r, {depth: null})).finally(()=>prisma.$disconnect());
