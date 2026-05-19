import 'dotenv/config';
import { PrismaClient, Currency, AvailabilityType, OptionType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const SALT_ROUNDS = 10;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Seed aborted: NODE_ENV=production. Never seed against a production database.');
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL ?? '';
  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1') && dbUrl !== '') {
    console.error('❌ Seed aborted: DATABASE_URL points to a remote database.');
    console.error('   Seeds wipe ALL data. Connect to a local/dev database only.');
    console.error('   To override (e.g. intentional dev cloud DB), set ALLOW_REMOTE_SEED=true');
    if (process.env.ALLOW_REMOTE_SEED !== 'true') {
      process.exit(1);
    }
    console.warn('⚠️  ALLOW_REMOTE_SEED=true — proceeding with remote seed.');
  }

  console.log('🌱 Starting comprehensive database seeding...');
  
  // Delete existing data in correct order
  await prisma.feedback.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuOption.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.assistanceRequest.deleteMany();
  await prisma.restaurant.deleteMany();
  await prisma.user.deleteMany();
  
  console.log('🧹 Cleared existing data');
  
  // Create demo user
  const hashedPassword = await bcrypt.hash('codespaces2026', SALT_ROUNDS);
  const demoUser = await prisma.user.create({
    data: {
      email: 'demo@codespaces.com',
      password: hashedPassword,
      name: 'Demo Manager',
      role: 'OWNER',
    },
  });
  
  console.log('✅ Created demo user: demo@codespaces.com / codespaces2026');
  
  // Create a Premium Restaurant
  const restaurant = await prisma.restaurant.create({
    data: {
      name: 'The Azure Orchid',
      country: 'Bulgaria',
      accentColor: '#4F46E5', // Indigo
      timezone: 'Europe/Sofia',
      targetLanguages: ['bg', 'ro'],
      owner: {
        connect: { id: demoUser.id }
      }
    }
  });

  console.log('✅ Created restaurant: The Azure Orchid');
  
  // 1. STARTERS
  const starters = await prisma.menuCategory.create({
    data: {
      name: 'Starters',
      order: 1,
      restaurant: { connect: { id: restaurant.id } },
      availabilityType: AvailabilityType.ALWAYS,
    }
  });

  // 2. SIGNATURE STEAKS
  const steaks = await prisma.menuCategory.create({
    data: {
      name: 'Signature Steaks',
      order: 2,
      restaurant: { connect: { id: restaurant.id } },
      availabilityType: AvailabilityType.ALWAYS,
    }
  });

  // 3. OCEAN\'S BOUNTY (SEAFOOD)
  const seafood = await prisma.menuCategory.create({
    data: {
      name: "Ocean's Bounty",
      order: 3,
      restaurant: { connect: { id: restaurant.id } },
      availabilityType: AvailabilityType.ALWAYS,
    }
  });

  // 4. ARTISANAL PASTAS
  const pastas = await prisma.menuCategory.create({
    data: {
      name: 'Artisanal Pastas',
      order: 4,
      restaurant: { connect: { id: restaurant.id } },
      availabilityType: AvailabilityType.ALWAYS,
    }
  });

  // 5. THE GARDEN (VEGAN/SALADS)
  const garden = await prisma.menuCategory.create({
    data: {
      name: 'The Garden',
      order: 5,
      restaurant: { connect: { id: restaurant.id } },
      availabilityType: AvailabilityType.ALWAYS,
    }
  });

  // 6. DESSERT GALLERY
  const desserts = await prisma.menuCategory.create({
    data: {
      name: 'Dessert Gallery',
      order: 6,
      restaurant: { connect: { id: restaurant.id } },
      availabilityType: AvailabilityType.ALWAYS,
    }
  });

  // 7. SOFT DRINKS & REFRESHMENTS
  const softDrinks = await prisma.menuCategory.create({
    data: {
      name: 'Refreshments',
      order: 7,
      isDrinkCategory: true,
      restaurant: { connect: { id: restaurant.id } },
      availabilityType: AvailabilityType.ALWAYS,
    }
  });

  // 7. CRAFT COCKTAILS
  const cocktails = await prisma.menuCategory.create({
    data: {
      name: 'Craft Cocktails',
      order: 8,
      isDrinkCategory: true,
      restaurant: { connect: { id: restaurant.id } },
      availabilityType: AvailabilityType.SCHEDULED,
      startTime: '16:00',
      endTime: '02:00',
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days
    }
  });

  console.log('✅ Created 8 categories');

  // SEED ITEMS
  
  // Starters
  await prisma.menuItem.create({
    data: {
      name: 'Truffle Burrata',
      description: 'Creamy burrata heart, black truffle shavings, aged balsamic, micro-basil.',
      price: 18.50,
      currency: Currency.EUR,
      order: 1,
      isFeatured: true,
      categoryId: starters.id,
      dietaryTags: ['Vegetarian', 'Gluten-Free'],
      allergens: ['Dairy'],
    }
  });

  const oysters = await prisma.menuItem.create({
    data: {
      name: 'Fine de Claire Oysters',
      description: 'Fresh oysters served with shallot mignonette, lemon, and Tabasco.',
      price: 24.00,
      currency: Currency.EUR,
      order: 2,
      categoryId: starters.id,
      allergens: ['Shellfish'],
    }
  });

  await prisma.menuOption.create({
    data: {
      name: 'Quantity',
      type: OptionType.VARIATION,
      choices: [
        { name: 'Half Dozen (6)', priceModifier: 0 },
        { name: 'Full Dozen (12)', priceModifier: 22.00 }
      ],
      menuItem: { connect: { id: oysters.id } }
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Charred Asparagus Veloute',
      description: 'Silky asparagus soup, lemon creme fraiche, toasted almonds, herb oil.',
      price: 14.50,
      currency: Currency.EUR,
      order: 3,
      categoryId: starters.id,
      dietaryTags: ['Vegetarian'],
      allergens: ['Dairy', 'Nuts'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Crispy Calamari Fritti',
      description: 'Lemon aioli, pickled chili, parsley salt.',
      price: 17.00,
      currency: Currency.EUR,
      order: 4,
      categoryId: starters.id,
      allergens: ['Gluten', 'Molluscs', 'Eggs'],
    }
  });

  // Steaks
  const ribeye = await prisma.menuItem.create({
    data: {
      name: 'Dry-Aged Wagyu Ribeye',
      description: '45-day dry-aged Australian Wagyu, marble score 7+, served with bone marrow butter.',
      price: 85.00,
      currency: Currency.EUR,
      order: 1,
      isFeatured: true,
      categoryId: steaks.id,
      dietaryTags: ['Keto', 'Protein-Rich'],
    }
  });

  await prisma.menuOption.create({
    data: {
      name: 'Doneness',
      type: OptionType.VARIATION,
      choices: [
        { name: 'Rare', priceModifier: 0 },
        { name: 'Medium Rare', priceModifier: 0 },
        { name: 'Medium', priceModifier: 0 },
        { name: 'Medium Well', priceModifier: 0 }
      ],
      menuItem: { connect: { id: ribeye.id } }
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Black Angus Fillet Mignon',
      description: '250g tenderloin, forest mushroom ragu, red wine reduction.',
      price: 42.00,
      currency: Currency.EUR,
      order: 2,
      categoryId: steaks.id,
      dietaryTags: ['High Protein'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Tomahawk Prime Rib',
      description: '900g bone-in steak for sharing, chimichurri, roasted garlic jus.',
      price: 96.00,
      currency: Currency.EUR,
      order: 3,
      categoryId: steaks.id,
      dietaryTags: ['Keto', 'High Protein'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Peppercorn Striploin',
      description: 'Aged striploin, green peppercorn sauce, pomme puree.',
      price: 47.00,
      currency: Currency.EUR,
      order: 4,
      categoryId: steaks.id,
      allergens: ['Dairy'],
    }
  });

  // Seafood
  await prisma.menuItem.create({
    data: {
      name: 'Wild-Caught Grilled Octopus',
      description: 'Smoked paprika oil, fava bean purée, pickled samphire, chorizo dust.',
      price: 28.50,
      currency: Currency.EUR,
      order: 1,
      categoryId: seafood.id,
      allergens: ['Molluscs'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Lobster Thermidor',
      description: 'Baked lobster, mustard cognac cream, gruyere crust.',
      price: 46.00,
      currency: Currency.EUR,
      order: 3,
      categoryId: seafood.id,
      allergens: ['Shellfish', 'Dairy'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Seared Scallops',
      description: 'Cauliflower puree, brown butter, crispy capers.',
      price: 32.00,
      currency: Currency.EUR,
      order: 4,
      categoryId: seafood.id,
      allergens: ['Shellfish', 'Dairy'],
      dietaryTags: ['Gluten-Free'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Miso-Glazed Chilean Sea Bass',
      description: 'Ginger-scented bok choy, crispy dashi rice cake, wasabi emulsion.',
      price: 38.00,
      currency: Currency.EUR,
      order: 2,
      categoryId: seafood.id,
      dietaryTags: ['Gluten-Free'],
      allergens: ['Soy', 'Fish'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Porcini Tagliatelle',
      description: 'Fresh pasta, porcini cream, thyme, pecorino.',
      price: 23.00,
      currency: Currency.EUR,
      order: 3,
      categoryId: pastas.id,
      allergens: ['Gluten', 'Dairy'],
      dietaryTags: ['Vegetarian'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Spicy Prawn Linguine',
      description: 'Garlic prawns, chili butter, cherry tomatoes, parsley.',
      price: 29.00,
      currency: Currency.EUR,
      order: 4,
      categoryId: pastas.id,
      allergens: ['Gluten', 'Shellfish'],
    }
  });

  // Pastas
  await prisma.menuItem.create({
    data: {
      name: 'Handmade Lobster Ravioli',
      description: 'Maine lobster, saffron cream, wilted spinach, bottarga shavings.',
      price: 34.00,
      currency: Currency.EUR,
      order: 1,
      categoryId: pastas.id,
      allergens: ['Gluten', 'Eggs', 'Shellfish'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Grilled Halloumi Bowl',
      description: 'Halloumi, roasted peppers, couscous, mint yogurt.',
      price: 18.00,
      currency: Currency.EUR,
      order: 3,
      categoryId: garden.id,
      dietaryTags: ['Vegetarian'],
      allergens: ['Dairy', 'Gluten'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Avocado Citrus Salad',
      description: 'Avocado, blood orange, fennel, pumpkin seeds, citrus vinaigrette.',
      price: 17.00,
      currency: Currency.EUR,
      order: 4,
      categoryId: garden.id,
      dietaryTags: ['Vegan', 'Gluten-Free'],
      allergens: ['Seeds'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Wild Boar Pappardelle',
      description: 'Slow-cooked boar ragout, 24-month Pecorino, rosemary oil.',
      price: 26.00,
      currency: Currency.EUR,
      order: 2,
      categoryId: pastas.id,
      allergens: ['Gluten', 'Dairy'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Basque Burnt Cheesecake',
      description: 'Caramelized cheesecake center, berry compote, vanilla bean cream.',
      price: 13.00,
      currency: Currency.EUR,
      order: 3,
      categoryId: desserts.id,
      allergens: ['Dairy', 'Eggs', 'Gluten'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Pistachio Creme Brulee',
      description: 'Slow-baked pistachio custard, torched sugar crust.',
      price: 12.50,
      currency: Currency.EUR,
      order: 4,
      categoryId: desserts.id,
      allergens: ['Dairy', 'Eggs', 'Nuts'],
      dietaryTags: ['Gluten-Free'],
    }
  });

  // Garden
  await prisma.menuItem.create({
    data: {
      name: 'Roasted Heritage Beetroot',
      description: 'Whipped goat cheese, candied walnuts, arugula, orange blossom dressing.',
      price: 16.00,
      currency: Currency.EUR,
      order: 1,
      categoryId: garden.id,
      dietaryTags: ['Vegetarian', 'Gluten-Free'],
      allergens: ['Dairy', 'Nuts'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Cold Brew Tonic',
      description: 'Single-origin cold brew, tonic water, orange peel.',
      price: 7.50,
      currency: Currency.EUR,
      order: 3,
      categoryId: softDrinks.id,
      dietaryTags: ['Vegan'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'House Kombucha',
      description: 'Fermented tea with seasonal fruit infusion.',
      price: 8.00,
      currency: Currency.EUR,
      order: 4,
      categoryId: softDrinks.id,
      dietaryTags: ['Vegan', 'Gluten-Free'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Fresh Pressed Orange Juice',
      description: 'Pure squeezed orange juice, no added sugar.',
      price: 6.80,
      currency: Currency.EUR,
      order: 5,
      categoryId: softDrinks.id,
      dietaryTags: ['Vegan', 'Gluten-Free'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Golden Quinoa Poke Bowl',
      description: 'Avocado, edamame, pickled ginger, sea grapes, sesame-ginger dressing.',
      price: 19.50,
      currency: Currency.EUR,
      order: 2,
      categoryId: garden.id,
      dietaryTags: ['Vegan', 'Gluten-Free', 'Healthy'],
      allergens: ['Sesame', 'Soy'],
    }
  });

  // Desserts
  await prisma.menuItem.create({
    data: {
      name: 'Deconstructed Tiramisu',
      description: 'Espresso-soaked sponge, mascarpone clouds, dark chocolate soil.',
      price: 12.00,
      currency: Currency.EUR,
      order: 1,
      categoryId: desserts.id,
      allergens: ['Dairy', 'Gluten', 'Eggs'],
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Matcha Fondant',
      description: 'Molten green tea heart, white chocolate ganache, black sesame ice cream.',
      price: 14.00,
      currency: Currency.EUR,
      order: 2,
      categoryId: desserts.id,
      allergens: ['Dairy', 'Eggs', 'Gluten'],
    }
  });

  // Refreshments
  await prisma.menuItem.create({
    data: {
      name: 'Artisan Lemonade',
      description: 'Freshly squeezed lemons, mint, agave syrup.',
      price: 6.50,
      currency: Currency.EUR,
      order: 1,
      categoryId: softDrinks.id,
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Sparkling Mineral Water',
      description: 'San Pellegrino 750ml.',
      price: 5.00,
      currency: Currency.EUR,
      order: 2,
      categoryId: softDrinks.id,
    }
  });

  // Cocktails
  const azureMartini = await prisma.menuItem.create({
    data: {
      name: 'The Azure Martini',
      description: 'Butterfly pea tea gin, elderflower liqueur, lemon zest, edible orchids.',
      price: 16.00,
      currency: Currency.EUR,
      order: 1,
      isFeatured: true,
      categoryId: cocktails.id,
    }
  });

  const negroni = await prisma.menuItem.create({
    data: {
      name: 'Smoked Negroni',
      description: 'Classic Negroni smoked with hickory wood, served in a crystal decanter.',
      price: 18.00,
      currency: Currency.EUR,
      order: 2,
      categoryId: cocktails.id,
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Cucumber Basil Gimlet',
      description: 'London dry gin, basil syrup, cucumber essence, lime.',
      price: 15.00,
      currency: Currency.EUR,
      order: 3,
      categoryId: cocktails.id,
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Passionfruit Spritz',
      description: 'Aperitivo, prosecco, passionfruit, soda.',
      price: 14.00,
      currency: Currency.EUR,
      order: 4,
      categoryId: cocktails.id,
    }
  });

  await prisma.menuItem.create({
    data: {
      name: 'Midnight Espresso Martini',
      description: 'Vodka, espresso, coffee liqueur, cocoa dust.',
      price: 17.00,
      currency: Currency.EUR,
      order: 5,
      categoryId: cocktails.id,
      isFeatured: true,
    }
  });

  await prisma.menuItem.update({
    where: { id: ribeye.id },
    data: { relatedItemIds: [azureMartini.id, negroni.id] }
  });

  console.log('✅ Created 35+ signature items with options, allergens, and tags');
  console.log('🎉 Premium Demo seeding completed successfully!');
  console.log('👤 Demo Credentials:');
  console.log('Email: demo@codespaces.com');
  console.log('Password: codespaces2026');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });