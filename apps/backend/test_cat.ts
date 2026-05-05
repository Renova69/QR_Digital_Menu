import { PrismaClient } from '@prisma/client'; 
const prisma = new PrismaClient(); 
async function main() { 
  const cats = await prisma.menuCategory.findMany({take: 2, select: {name: true, translations: true}}); 
  console.log(JSON.stringify(cats, null, 2)); 
} 
main().finally(() => prisma.$disconnect());
