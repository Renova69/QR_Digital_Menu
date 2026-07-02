import {
  Currency,
  LoyaltyPointTransactionType,
  OptionType,
  OrderStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { MenuCrudService } from '../src/menu/menu-crud.service';
import { OrdersService } from '../src/orders/orders.service';
import { MenuTranslationService } from '../src/menu/menu-translation.service';
import { ensureLoyaltyAccount } from '../src/loyalty/loyalty-ledger.utils';

const concurrencyDatabaseUrl = process.env.CONCURRENCY_DATABASE_URL;
const describeWithDatabase = concurrencyDatabaseUrl ? describe : describe.skip;

jest.setTimeout(30_000);

function assertIsolatedTestDatabase(url: string): void {
  const parsed = new URL(url);
  const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  const databaseName = parsed.pathname.slice(1);
  if (!isLocal || !databaseName.endsWith('_test')) {
    throw new Error(
      'CONCURRENCY_DATABASE_URL must point to a local database whose name ends in "_test".',
    );
  }
}

describeWithDatabase('Pre-production PostgreSQL concurrency invariants', () => {
  let prisma: PrismaClient;
  const runPrefix = `codex-concurrency-${Date.now()}`;

  beforeAll(async () => {
    assertIsolatedTestDatabase(concurrencyDatabaseUrl!);
    prisma = new PrismaClient({
      datasources: { db: { url: concurrencyDatabaseUrl } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { startsWith: runPrefix } },
    });
    await prisma.$disconnect();
  });

  async function createRestaurantFixture(suffix: string) {
    const owner = await prisma.user.create({
      data: {
        email: `${runPrefix}-${suffix}-owner@example.test`,
        password: 'not-used',
        role: UserRole.OWNER,
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `${runPrefix}-${suffix}-customer@example.test`,
        password: 'not-used',
        role: UserRole.CUSTOMER,
      },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        name: `Concurrency ${suffix}`,
        ownerId: owner.id,
        targetLanguages: ['de', 'fr'],
      },
    });
    return { owner, customer, restaurant };
  }

  async function waitFor(
    assertion: () => Promise<void>,
    timeoutMs = 5_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown;
    while (Date.now() < deadline) {
      try {
        await assertion();
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    throw lastError;
  }

  it('creates one loyalty account when first-order upserts race', async () => {
    const { customer, restaurant } =
      await createRestaurantFixture('loyalty-upsert');

    await Promise.all(
      Array.from({ length: 24 }, () =>
        prisma.$transaction((tx) =>
          ensureLoyaltyAccount(tx, customer.id, restaurant.id),
        ),
      ),
    );

    await expect(
      prisma.loyaltyAccount.count({
        where: {
          userId: customer.id,
          restaurantId: restaurant.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('allows only one cancellation to reverse loyalty under concurrent requests', async () => {
    const { owner, customer, restaurant } =
      await createRestaurantFixture('cancel');
    const account = await prisma.loyaltyAccount.create({
      data: {
        userId: customer.id,
        restaurantId: restaurant.id,
        points: 20,
        lifetimePoints: 100,
      },
    });
    const order = await prisma.order.create({
      data: {
        customerName: 'Concurrency Customer',
        customerId: customer.id,
        restaurantId: restaurant.id,
        totalPrice: 25,
        status: OrderStatus.NEW,
        pointsEarned: 20,
        pointsRedeemed: 15,
        pointsRedeemedForDiscount: 10,
        pointsRedeemedForItems: 5,
      },
    });
    const earned = await prisma.loyaltyPointLedger.create({
      data: {
        loyaltyAccountId: account.id,
        orderId: order.id,
        type: LoyaltyPointTransactionType.EARN,
        points: 20,
        remainingPoints: 20,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    const events = {
      emitToOrder: jest.fn(),
      emitOrderEventToRestaurant: jest.fn(),
      emitTableStatusChanged: jest.fn(),
    };
    const service = new OrdersService(
      prisma as never,
      events as never,
      {} as never,
      {} as never,
    );

    const results = await Promise.allSettled(
      Array.from({ length: 16 }, () =>
        service.updateStatus(
          order.id,
          { status: OrderStatus.CANCELED },
          owner.id,
        ),
      ),
    );

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).resolves.toMatchObject({ status: OrderStatus.CANCELED });
    await expect(
      prisma.loyaltyAccount.findUniqueOrThrow({ where: { id: account.id } }),
    ).resolves.toMatchObject({ points: 15, lifetimePoints: 80 });
    await expect(
      prisma.loyaltyPointLedger.findUniqueOrThrow({
        where: { id: earned.id },
      }),
    ).resolves.toMatchObject({ remainingPoints: 0 });

    const adjustments = await prisma.loyaltyPointLedger.findMany({
      where: {
        loyaltyAccountId: account.id,
        orderId: order.id,
        type: LoyaltyPointTransactionType.ADJUSTMENT,
      },
      orderBy: { points: 'asc' },
    });
    expect(
      adjustments.map(({ points, remainingPoints }) => ({
        points,
        remainingPoints,
      })),
    ).toEqual([
      { points: -20, remainingPoints: 0 },
      { points: 15, remainingPoints: 15 },
    ]);
  });

  it('preserves every lazy-translation JSONB fragment when languages race', async () => {
    const { restaurant } = await createRestaurantFixture('translations');
    const category = await prisma.menuCategory.create({
      data: {
        name: 'Starters',
        restaurantId: restaurant.id,
        order: 1,
        daysOfWeek: [],
      },
    });
    const item = await prisma.menuItem.create({
      data: {
        name: 'Soup',
        description: 'Hot soup',
        price: 5,
        currency: Currency.EUR,
        allergens: ['milk'],
        dietaryTags: ['vegetarian'],
        categoryId: category.id,
        order: 1,
      },
    });
    const option = await prisma.menuOption.create({
      data: {
        name: 'Size',
        type: OptionType.ADDON,
        choices: [{ name: 'Large', price: 2 }],
        menuItemId: item.id,
      },
    });

    let arrivals = 0;
    let release!: () => void;
    const bothTranslationsReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    const translator = {
      translateTexts: jest.fn(async (texts: string[], lang: string) => {
        arrivals += 1;
        if (arrivals === 2) release();
        await bothTranslationsReady;
        return texts.map((text) => `${text}-${lang}`);
      }),
    };
    const germanService = new MenuTranslationService(
      prisma as never,
      translator as never,
    );
    const frenchService = new MenuTranslationService(
      prisma as never,
      translator as never,
    );
    const menuSnapshot = () => [
      {
        ...category,
        translations: null,
        items: [
          {
            ...item,
            translations: null,
            options: [{ ...option, translations: null }],
          },
        ],
      },
    ];

    await Promise.all([
      germanService.applyLazyTranslations(menuSnapshot(), 'de'),
      frenchService.applyLazyTranslations(menuSnapshot(), 'fr'),
    ]);

    const [storedCategory, storedItem, storedOption] = await Promise.all([
      prisma.menuCategory.findUniqueOrThrow({ where: { id: category.id } }),
      prisma.menuItem.findUniqueOrThrow({ where: { id: item.id } }),
      prisma.menuOption.findUniqueOrThrow({ where: { id: option.id } }),
    ]);
    expect(storedCategory.translations).toMatchObject({
      de: { name: 'Starters-de' },
      fr: { name: 'Starters-fr' },
    });
    expect(storedItem.translations).toMatchObject({
      de: {
        name: 'Soup-de',
        description: 'Hot soup-de',
        allergens: { milk: 'milk-de' },
        dietaryTags: { vegetarian: 'vegetarian-de' },
      },
      fr: {
        name: 'Soup-fr',
        description: 'Hot soup-fr',
        allergens: { milk: 'milk-fr' },
        dietaryTags: { vegetarian: 'vegetarian-fr' },
      },
    });
    expect(storedOption.translations).toMatchObject({
      de: { name: 'Size-de', choices: { Large: 'Large-de' } },
      fr: { name: 'Size-fr', choices: { Large: 'Large-fr' } },
    });
  });

  it('preserves concurrent lazy writes across every category/item/option pre-warm path', async () => {
    const previousDeepLKey = process.env.DEEPL_API_KEY;
    process.env.DEEPL_API_KEY = 'concurrency-test';

    try {
      const { owner, restaurant } = await createRestaurantFixture(
        'translation-prewarm',
      );
      const category = await prisma.menuCategory.create({
        data: {
          name: 'Starters',
          restaurantId: restaurant.id,
          order: 1,
          daysOfWeek: [],
        },
      });
      const item = await prisma.menuItem.create({
        data: {
          name: 'Soup',
          description: 'Hot soup',
          price: 5,
          currency: Currency.EUR,
          allergens: ['milk'],
          dietaryTags: ['vegetarian'],
          categoryId: category.id,
          order: 1,
        },
      });
      const option = await prisma.menuOption.create({
        data: {
          name: 'Size',
          type: OptionType.ADDON,
          choices: [{ name: 'Large', price: 2 }],
          menuItemId: item.id,
        },
      });

      const lazyTranslator = {
        translateTexts: jest.fn(async (texts: string[], lang: string) =>
          texts.map((text) => `${text}-${lang}`),
        ),
      };
      const lazyService = new MenuTranslationService(
        prisma as never,
        lazyTranslator as never,
      );
      const prewarmTranslator = {
        translateObject: jest.fn(),
      };
      const crud = new MenuCrudService(
        prisma as never,
        prewarmTranslator as never,
        lazyService,
        {
          getEffectiveTier: () => 'FREE',
          hasFeature: () => false,
          restaurantHasFeature: () => true,
        } as never,
        { delete: jest.fn() } as never,
        { emitPublicMenuItemAvailability: jest.fn() } as never,
      );

      const loadMenuSnapshot = () =>
        prisma.menuCategory.findMany({
          where: { id: category.id },
          include: { items: { include: { options: true } } },
        });

      const racePrewarmWithLazy = async (
        startPrewarm: () => Promise<unknown>,
        prewarmResult: Record<string, unknown>,
        lazyLanguage: string,
        readTranslations: () => Promise<unknown>,
      ) => {
        let releasePrewarm!: (value: Record<string, unknown>) => void;
        const prewarmBlocked = new Promise<Record<string, unknown>>(
          (resolve) => {
            releasePrewarm = resolve;
          },
        );
        prewarmTranslator.translateObject.mockReturnValueOnce(prewarmBlocked);

        await startPrewarm();
        expect(prewarmTranslator.translateObject).toHaveBeenCalled();
        await lazyService.applyLazyTranslations(
          await loadMenuSnapshot(),
          lazyLanguage,
        );
        releasePrewarm(prewarmResult);

        await waitFor(async () => {
          expect(await readTranslations()).toMatchObject({
            de: expect.any(Object),
            [lazyLanguage]: expect.any(Object),
          });
        });
      };

      await racePrewarmWithLazy(
        () =>
          crud.updateCategory(
            category.id,
            { name: 'Updated starters' },
            owner.id,
          ),
        { de: { name: 'Vorspeisen' } },
        'fr',
        async () =>
          (
            await prisma.menuCategory.findUniqueOrThrow({
              where: { id: category.id },
            })
          ).translations,
      );

      await racePrewarmWithLazy(
        () => crud.updateItem(item.id, { name: 'Updated soup' }, owner.id),
        { de: { name: 'Suppe' } },
        'es',
        async () =>
          (
            await prisma.menuItem.findUniqueOrThrow({
              where: { id: item.id },
            })
          ).translations,
      );

      await racePrewarmWithLazy(
        () =>
          crud.updateMenuOption(option.id, { name: 'Updated size' }, owner.id),
        { de: { name: 'Größe' } },
        'it',
        async () =>
          (
            await prisma.menuOption.findUniqueOrThrow({
              where: { id: option.id },
            })
          ).translations,
      );
    } finally {
      if (previousDeepLKey === undefined) {
        delete process.env.DEEPL_API_KEY;
      } else {
        process.env.DEEPL_API_KEY = previousDeepLKey;
      }
    }
  });
});
