import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { DashboardViewsService } from './dashboard-views.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

const mockPrisma: Record<string, any> = {
  restaurant: { findUnique: jest.fn() },
  order: {
    count: jest.fn(),
    aggregate: jest.fn(),
    findMany: jest.fn(),
    groupBy: jest.fn(),
  },
  assistanceRequest: { count: jest.fn() },
  orderItem: { findMany: jest.fn() },
  payment: { aggregate: jest.fn(), groupBy: jest.fn() },
  $queryRaw: jest.fn().mockResolvedValue([]),
};

const mockViews = { isReady: jest.fn().mockReturnValue(false) };

type AnalyticsResult = Record<string, any>;

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DashboardViewsService, useValue: mockViews },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
    mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockPrisma.payment.groupBy.mockResolvedValue([]);
  });

  describe('getSummary', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'Europe/Sofia',
      });
      mockPrisma.order.count.mockResolvedValue(5);
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 250 },
      });
      mockPrisma.assistanceRequest.count.mockResolvedValue(2);
      mockPrisma.order.findMany.mockResolvedValue([]);
    });

    it('returns summary with ordersToday, totalRevenue, openAssistanceRequests, recentOrders', async () => {
      const result = await service.getSummary('rest-1');

      expect(result).toHaveProperty('ordersToday', 5);
      expect(result).toHaveProperty('totalRevenue', 250);
      expect(result).toHaveProperty('openAssistanceRequests', 2);
      expect(result).toHaveProperty('recentOrders');
    });

    it('returns 0 totalRevenue when no orders', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
      });

      const result = await service.getSummary('rest-1');

      expect(result.totalRevenue).toBe(0);
    });

    it('falls back to UTC when restaurant has no timezone', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(service.getSummary('rest-1')).resolves.toBeDefined();
    });

    it('fetches restaurant by restaurantId for timezone', async () => {
      await service.getSummary('rest-42');

      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledWith({
        where: { id: 'rest-42' },
        select: { timezone: true },
      });
    });
  });

  describe('cache lifecycle', () => {
    it('sweeps expired analytics cache entries on the module interval', () => {
      jest.useFakeTimers();
      const sweepSpy = jest.spyOn(service as any, 'sweepExpiredCache');

      service.onModuleInit();
      jest.advanceTimersByTime(60_000);
      service.onModuleDestroy();

      expect(sweepSpy).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });

  describe('getAnalytics', () => {
    const defaultAggregate = {
      _sum: { totalPrice: 100 },
      _count: 3,
      _avg: { totalPrice: 33.33 },
    };

    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'Europe/Sofia',
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.aggregate.mockResolvedValue(defaultAggregate);
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.orderItem.findMany.mockResolvedValue([]);
    });

    it('returns analytics result with expected shape', async () => {
      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;

      expect(result).toHaveProperty('period', 7);
      expect(result).toHaveProperty('revenueTrend');
      expect(result).toHaveProperty('topItems');
      expect(result).toHaveProperty('peakHours');
      expect(result).toHaveProperty('categoryBreakdown');
      expect(result).toHaveProperty('ordersByStatus');
      expect(result).toHaveProperty('comparison');
    });

    it('returns cached result on second call with same key', async () => {
      await service.getAnalytics('rest-1', 7);
      await service.getAnalytics('rest-1', 7);

      // prisma.restaurant.findUnique called once — second call uses cache
      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledTimes(1);
    });

    it('uses different cache key for different period', async () => {
      await service.getAnalytics('rest-1', 7);
      await service.getAnalytics('rest-1', 30);

      // Each period triggers a fresh DB call
      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledTimes(2);
    });

    it('uses date range when startDate and endDate provided', async () => {
      const result = (await service.getAnalytics(
        'rest-1',
        7,
        '2026-01-01',
        '2026-01-07',
      )) as AnalyticsResult;

      expect(result).toBeDefined();
      expect(result['period']).toBe(7);
      expect(mockPrisma.order.aggregate).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date('2025-12-31T22:00:00.000Z'),
              lte: new Date('2026-01-07T21:59:59.999Z'),
            },
          }),
        }),
      );
    });

    it('calculates 100% revenueChange when previous period had 0 revenue', async () => {
      mockPrisma.order.aggregate
        .mockResolvedValueOnce({
          _sum: { totalPrice: 500 },
          _count: 10,
          _avg: { totalPrice: 50 },
        }) // current
        .mockResolvedValueOnce({
          _sum: { totalPrice: 0 },
          _count: 0,
          _avg: { totalPrice: 0 },
        }); // previous

      const result = (await service.getAnalytics(
        'rest-2',
        7,
      )) as AnalyticsResult;

      expect(result['comparison']['revenueChange']).toBe(100);
    });

    it('calculates 0% change when both periods have 0 revenue', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _count: 0,
        _avg: { totalPrice: 0 },
      });

      const result = (await service.getAnalytics(
        'rest-3',
        7,
      )) as AnalyticsResult;

      expect(result['comparison']['revenueChange']).toBe(0);
    });
  });

  describe('getOrdersByStatus (via getAnalytics)', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'Europe/Sofia',
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _count: 0,
        _avg: { totalPrice: 0 },
      });
      mockPrisma.orderItem.findMany.mockResolvedValue([]);
    });

    it('returns all 5 statuses with 0 count when groupBy returns empty', async () => {
      mockPrisma.order.groupBy.mockResolvedValue([]);

      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;
      const statuses = result['ordersByStatus'].map(
        (s: { status: string }) => s.status,
      );

      expect(statuses).toContain(OrderStatus.NEW);
      expect(statuses).toContain(OrderStatus.IN_PROGRESS);
      expect(statuses).toContain(OrderStatus.SERVED);
      expect(statuses).toContain(OrderStatus.COMPLETED);
      expect(statuses).toContain(OrderStatus.CANCELED);
      expect(result['ordersByStatus']).toHaveLength(5);
      result['ordersByStatus'].forEach((s: { count: number }) =>
        expect(s.count).toBe(0),
      );
    });

    it('maps groupBy counts to correct statuses', async () => {
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.NEW, _count: 3 },
        { status: OrderStatus.SERVED, _count: 7 },
      ]);

      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;
      const newEntry = result['ordersByStatus'].find(
        (s: { status: string }) => s.status === OrderStatus.NEW,
      );
      const servedEntry = result['ordersByStatus'].find(
        (s: { status: string }) => s.status === OrderStatus.SERVED,
      );
      const canceledEntry = result['ordersByStatus'].find(
        (s: { status: string }) => s.status === OrderStatus.CANCELED,
      );

      expect(newEntry?.count).toBe(3);
      expect(servedEntry?.count).toBe(7);
      expect(canceledEntry?.count).toBe(0);
    });
  });

  describe('completionRate calculation', () => {
    it('returns 0 completionRate when no orders', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'Europe/Sofia',
      });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _count: 0,
        _avg: { totalPrice: 0 },
      });
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.orderItem.findMany.mockResolvedValue([]);

      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;

      expect(result['completionRate']).toBe(0);
    });
  });

  describe('getAnalytics with non-empty data (loop body coverage)', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'Europe/Sofia',
      });
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 50 },
        _count: 1,
        _avg: { totalPrice: 50 },
      });
      mockPrisma.order.groupBy.mockResolvedValue([]);
      // Return an order so revenueTrend loop body runs (getRevenueTrend still uses findMany)
      mockPrisma.order.findMany.mockResolvedValue([
        { createdAt: new Date(), totalPrice: 50, tableId: 'table-1' },
      ]);
      // Phase B: spy on new private methods to prevent $queryRaw chaining races
      jest.spyOn(service as any, 'getStaffPerformance').mockResolvedValue([]);
      jest.spyOn(service as any, 'getCustomerMetrics').mockResolvedValue({
        topCustomers: [],
        churnRiskCount: 0,
        churnRiskBreakdown: { '30d': 0, '60d': 0, '90d+': 0 },
        averageClv: 0,
      });
      jest.spyOn(service as any, 'getKitchenEfficiency').mockResolvedValue({
        overallAvgPrepMinutes: 0,
        totalCompletedOrders: 0,
        hourlyAverages: [],
        zoneAverages: [],
      });
      jest.spyOn(service as any, 'getCancelAnalytics').mockResolvedValue({
        totalCanceledOrders: 0,
        revenueLost: 0,
        cancelRateByItem: [],
        cancelRateByHour: [],
      });
      jest.spyOn(service as any, 'getTableTurnover').mockResolvedValue([]);
      jest.spyOn(service as any, 'getMenuProfitability').mockResolvedValue({
        items: [],
        summary: { totalCost: 0, totalProfit: 0, overallMargin: 0 },
      });
      jest.spyOn(service as any, 'getGrossProfit').mockResolvedValue({
        collectedRevenue: 0,
        estimatedCOGS: 0,
        grossProfit: 0,
        grossMargin: 0,
      });
      // getTopItems, getPeakHours, getCategoryBreakdown, getOrdersByTable now use $queryRaw (Issue 44)
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ name: 'Pizza', quantity: 2, revenue: 20.0 }]) // getTopItems
        .mockResolvedValueOnce([]) // getPeakHours
        .mockResolvedValueOnce([{ category: 'Food', revenue: 20.0 }]) // getCategoryBreakdown
        .mockResolvedValueOnce([
          {
            table_id: 'table-1',
            table_name: 'Table 1',
            orders: 1,
            revenue: 50.0,
          },
        ]); // getOrdersByTable
    });

    it('populates topItems when orderItems exist', async () => {
      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;

      expect(result['topItems']).toHaveLength(1);
      expect(result['topItems'][0].name).toBe('Pizza');
      expect(result['topItems'][0].quantity).toBe(2);
    });

    it('populates categoryBreakdown when orderItems with categories exist', async () => {
      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;

      expect(result['categoryBreakdown']).toHaveLength(1);
      expect(result['categoryBreakdown'][0].category).toBe('Food');
    });

    it('populates ordersByTable when orders with tableId exist', async () => {
      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;

      expect(result['ordersByTable']).toHaveLength(1);
      expect(result['ordersByTable'][0].table).toBe('Table 1');
    });

    it('falls back to "Unknown Table" when table_name is null and no restaurant_table match', async () => {
      // Re-mock getOrdersByTable query: null table_name
      mockPrisma.$queryRaw.mockReset();
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ name: 'Pizza', quantity: 2, revenue: 20.0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ category: 'Food', revenue: 20.0 }])
        .mockResolvedValueOnce([
          { table_id: 'orphan-id', table_name: null, orders: 1, revenue: 20.0 },
        ]);

      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;

      expect(result['ordersByTable']).toHaveLength(1);
      expect(result['ordersByTable'][0].table).toBe('Unknown Table');
    });

    it('calls order.findMany and returns non-empty revenueTrend array', async () => {
      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;

      expect(mockPrisma.order.findMany).toHaveBeenCalled();
      expect(Array.isArray(result['revenueTrend'])).toBe(true);
      expect(result['revenueTrend'].length).toBeGreaterThan(0);
    });
  });

  describe('getAnalytics via materialized views (isReady = true)', () => {
    beforeEach(() => {
      mockViews.isReady.mockReturnValue(true);
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'Europe/Sofia',
      });
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _count: 0,
        _avg: { totalPrice: 0 },
      });
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.orderItem.findMany.mockResolvedValue([]);
      mockPrisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 0, tipAmount: 0 },
      });
      mockPrisma.payment.groupBy.mockResolvedValue([]);
      // Spy Phase B methods to avoid $queryRaw chaining races from Promise.all
      jest.spyOn(service as any, 'getStaffPerformance').mockResolvedValue([]);
      jest
        .spyOn(service as any, 'getCustomerMetrics')
        .mockResolvedValue({
          topCustomers: [],
          churnRiskCount: 0,
          churnRiskBreakdown: { '30d': 0, '60d': 0, '90d+': 0 },
          averageClv: 0,
        });
      jest
        .spyOn(service as any, 'getKitchenEfficiency')
        .mockResolvedValue({
          overallAvgPrepMinutes: 0,
          totalCompletedOrders: 0,
          hourlyAverages: [],
          zoneAverages: [],
        });
      jest
        .spyOn(service as any, 'getCancelAnalytics')
        .mockResolvedValue({
          totalCanceledOrders: 0,
          revenueLost: 0,
          cancelRateByItem: [],
          cancelRateByHour: [],
        });
      jest.spyOn(service as any, 'getTableTurnover').mockResolvedValue([]);
      jest
        .spyOn(service as any, 'getMenuProfitability')
        .mockResolvedValue({
          items: [],
          summary: { totalCost: 0, totalProfit: 0, overallMargin: 0 },
        });
      jest
        .spyOn(service as any, 'getGrossProfit')
        .mockResolvedValue({
          collectedRevenue: 0,
          estimatedCOGS: 0,
          grossProfit: 0,
          grossMargin: 0,
        });
    });

    afterEach(() => {
      mockViews.isReady.mockReturnValue(false);
    });

    it('calls $queryRaw five times (3 view + 2 non-view: categoryBreakdown, ordersByTable)', async () => {
      await service.getAnalytics('rest-1', 7);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(5);
    });

    it('maps revenue view rows to revenueTrend entries', async () => {
      const yesterday = new Date(Date.now() - 86_400_000);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([
          { day_utc: yesterday, order_count: 3, revenue: 75.5 },
        ]) // 1: revenueTrend
        .mockResolvedValueOnce([
          // 2: topItems
          {
            menuItemId: 'item-1',
            item_name: 'Burger',
            item_price: 8,
            quantity: 4,
            revenue: 32,
          },
        ])
        .mockResolvedValueOnce([{ hour_utc: 12, total_orders: 5 }]); // 3: peakHours

      const result = (await service.getAnalytics(
        'rest-2',
        7,
      )) as AnalyticsResult;

      expect(result['topItems']).toHaveLength(1);
      expect(result['topItems'][0].name).toBe('Burger');
    });

    it('maps peak hours view rows — shifts UTC hour to local', async () => {
      // Phase B: spy on new methods
      jest.spyOn(service as any, 'getStaffPerformance').mockResolvedValue([]);
      jest.spyOn(service as any, 'getCustomerMetrics').mockResolvedValue({
        topCustomers: [],
        churnRiskCount: 0,
        churnRiskBreakdown: { '30d': 0, '60d': 0, '90d+': 0 },
        averageClv: 0,
      });
      jest.spyOn(service as any, 'getKitchenEfficiency').mockResolvedValue({
        overallAvgPrepMinutes: 0,
        totalCompletedOrders: 0,
        hourlyAverages: [],
        zoneAverages: [],
      });
      jest.spyOn(service as any, 'getCancelAnalytics').mockResolvedValue({
        totalCanceledOrders: 0,
        revenueLost: 0,
        cancelRateByItem: [],
        cancelRateByHour: [],
      });
      jest.spyOn(service as any, 'getTableTurnover').mockResolvedValue([]);
      jest.spyOn(service as any, 'getMenuProfitability').mockResolvedValue({
        items: [],
        summary: { totalCost: 0, totalProfit: 0, overallMargin: 0 },
      });
      jest.spyOn(service as any, 'getGrossProfit').mockResolvedValue({
        collectedRevenue: 0,
        estimatedCOGS: 0,
        grossProfit: 0,
        grossMargin: 0,
      });
      // Views path: $queryRaw called 5 times (3 view + categoryBreakdown + ordersByTable)
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([]) // 1: revenueTrend view
        .mockResolvedValueOnce([]) // 2: topItems view
        .mockResolvedValueOnce([{ local_hour: 10, total_orders: 7 }]); // 3: peakHours view (SQL AT TIME ZONE → local_hour)

      const result = (await service.getAnalytics(
        'rest-3',
        7,
      )) as AnalyticsResult;

      const totalOrders = result['peakHours'].reduce(
        (sum: number, h: { orders: number }) => sum + h.orders,
        0,
      );
      expect(totalOrders).toBe(7);
    });
  });
});
