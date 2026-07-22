import {
  Currency,
  OrderStatus,
  PrismaClient,
  SubscriptionTier,
  UserRole,
} from '@prisma/client';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { DashboardViewsService } from '../src/dashboard/dashboard-views.service';
import { DateTime } from 'luxon';

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

jest.setTimeout(30_000);

interface AnalyticsResult {
  period: number;
  topItems: Array<{ name: string }>;
  peakHours: Array<{ hour: number; orders: number }>;
  cancelAnalytics: {
    cancelRateByItem: Array<{ itemName: string; cancelRate: number }>;
  };
  menuProfitability: { summary: { missingCostItems: number } };
}

function assertIsolatedTestDatabase(url: string): void {
  const parsed = new URL(url);
  const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  const databaseName = parsed.pathname.slice(1);
  if (!isLocal || !databaseName.endsWith('_test')) {
    throw new Error(
      'DATABASE_URL must point to a local database whose name ends in "_test".',
    );
  }
}

describeWithDatabase('Dashboard analytics PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let service: DashboardService;
  let restaurantId: string;
  let localNineDateStr: string;
  const runPrefix = `analytics-postgres-${Date.now()}`;

  beforeAll(async () => {
    assertIsolatedTestDatabase(databaseUrl!);
    prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });
    await prisma.$connect();

    const owner = await prisma.user.create({
      data: {
        email: `${runPrefix}-owner@example.test`,
        password: 'not-used',
        role: UserRole.OWNER,
      },
    });
    const restaurant = await prisma.restaurant.create({
      data: {
        name: 'Analytics PostgreSQL Fixture',
        ownerId: owner.id,
        tier: SubscriptionTier.ENTERPRISE,
        timezone: 'Europe/Sofia',
      },
    });
    restaurantId = restaurant.id;
    const timezoneCategory = await prisma.menuCategory.create({
      data: {
        name: 'Timezone fixture',
        restaurantId,
        order: 1,
        daysOfWeek: [],
      },
    });
    const timezoneMenuItem = await prisma.menuItem.create({
      data: {
        name: 'Timezone item',
        price: 15,
        costPrice: 5,
        currency: Currency.EUR,
        categoryId: timezoneCategory.id,
        order: 1,
      },
    });
    const localNine = DateTime.now()
      .setZone('Europe/Sofia')
      .minus({ days: 1 })
      .set({ hour: 9, minute: 15, second: 0, millisecond: 0 });
    localNineDateStr = localNine.toISODate()!;

    await prisma.order.create({
      data: {
        customerName: 'Completed customer',
        customerPhone: '+359000000001',
        restaurantId,
        status: OrderStatus.COMPLETED,
        totalPrice: 12,
        items: {
          create: {
            itemName: 'Deleted completed item',
            quantity: 1,
            unitPrice: 12,
            unitPriceWithOptions: 12,
            selectedOptions: [],
          },
        },
      },
    });
    await prisma.order.create({
      data: {
        customerName: 'Timezone customer',
        customerPhone: '+359000000003',
        restaurantId,
        status: OrderStatus.COMPLETED,
        totalPrice: 15,
        createdAt: localNine.toUTC().toJSDate(),
        items: {
          create: {
            menuItemId: timezoneMenuItem.id,
            itemName: 'Timezone item',
            quantity: 1,
            unitPrice: 15,
            unitPriceWithOptions: 15,
            selectedOptions: [],
          },
        },
      },
    });
    await prisma.order.create({
      data: {
        customerName: 'Canceled customer',
        customerPhone: '+359000000002',
        restaurantId,
        status: OrderStatus.CANCELED,
        totalPrice: 8,
        items: {
          create: {
            itemName: 'Deleted canceled item',
            quantity: 1,
            unitPrice: 8,
            unitPriceWithOptions: 8,
            selectedOptions: [],
          },
        },
      },
    });

    service = new DashboardService(
      prisma as never,
      new DashboardViewsService(prisma as never),
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({
      where: { email: { startsWith: runPrefix } },
    });
    await prisma.$disconnect();
  });

  it.each([1, 7, 30])(
    'executes full analytics for the %i-day preset',
    async (period) => {
      const result = (await service.getAnalytics(
        restaurantId,
        period,
        undefined,
        undefined,
        true,
        'bg',
      )) as AnalyticsResult;

      expect(result.period).toBe(period);
      expect(result.topItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Deleted completed item' }),
        ]),
      );
      expect(result.cancelAnalytics.cancelRateByItem).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            itemName: 'Deleted canceled item',
            cancelRate: 100,
          }),
        ]),
      );
      expect(result.menuProfitability.summary.missingCostItems).toBe(1);
    },
  );

  it('buckets UTC-stored orders into the restaurant local demand hour', async () => {
    const result = (await service.getAnalytics(
      restaurantId,
      7,
      localNineDateStr,
      localNineDateStr,
      true,
      'bg',
    )) as AnalyticsResult;

    expect(result.peakHours.reduce((sum, hour) => sum + hour.orders, 0)).toBe(
      1,
    );
    expect(result.peakHours.find((hour) => hour.hour === 9)?.orders).toBe(1);
  });
});
