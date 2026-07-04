const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, reservationSettings: true }
  });
  
  for (const r of restaurants) {
    if (r.reservationSettings && r.reservationSettings.customPreferences) {
      console.log(`Restaurant ${r.id} prefs:`, r.reservationSettings.customPreferences);
      
      const newPrefs = r.reservationSettings.customPreferences.map(p => {
        // Remove common emojis and trim
        return p.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').trim();
      });
      
      console.log(`Restaurant ${r.id} new prefs:`, newPrefs);
      
      // Update DB
      await prisma.restaurant.update({
        where: { id: r.id },
        data: {
          reservationSettings: {
            ...r.reservationSettings,
            customPreferences: newPrefs
          }
        }
      });
    }
  }
  
  // Let's also check reservations to see if they have emoji preferences saved on them
  const reservations = await prisma.reservation.findMany({
    select: { id: true, customerPreferences: true }
  });
  
  for (const res of reservations) {
    if (res.customerPreferences && res.customerPreferences.length > 0) {
      const newPrefs = res.customerPreferences.map(p => {
        return p.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').trim();
      });
      
      await prisma.reservation.update({
        where: { id: res.id },
        data: {
          customerPreferences: newPrefs
        }
      });
    }
  }
  
  await prisma.$disconnect();
}

run().catch(console.error);
