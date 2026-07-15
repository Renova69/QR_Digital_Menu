import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { DashboardViewsService } from './dashboard-views.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { DateTime } from 'luxon';

const mockPrisma = {
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

interface AnalyticsResult {
  period: number;
  comparison: { revenueChange: number; ordersChange: number };
  ordersByStatus: Array<{ status: string; count: number }>;
  completionRate: number;
  topItems: Array<{ name: string; quantity: number }>;
  categoryBreakdown: Array<{ category: string }>;
  ordersByTable: Array<{ table: string }>;
  revenueTrend: Array<unknown>;
  peakHours: Array<{ count: number; orders: number }>;
  [key: string]: unknown; // fallback for tests
}

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

  describe('getPaymentsSummary', () => {
    it('applies a preset using the restaurant timezone', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T10:30:00.000Z'));
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'Europe/Sofia',
      });
      mockPrisma.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
      mockPrisma.payment.groupBy.mockResolvedValue([]);

      try {
        await service.getPaymentsSummary(
          'rest-payment-period',
          undefined,
          undefined,
          1,
        );

        expect(mockPrisma.payment.aggregate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              createdAt: {
                gte: new Date('2026-07-14T21:00:00.000Z'),
                lte: new Date('2026-07-15T10:30:00.000Z'),
              },
            }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('getDailyCloseout', () => {
    it('nets tips and successful refund sales without double-subtracting payments', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'Europe/Sofia',
      });
      mockPrisma.payment.groupBy.mockResolvedValueOnce([
        { provider: 'STRIPE', _sum: { amount: 110 } },
      ]);
      mockPrisma.payment.aggregate.mockResolvedValueOnce({
        _sum: { tipAmount: 10 },
      });
      mockPrisma.order.aggregate
        .mockResolvedValueOnce({
          _sum: { totalPrice: 100, pointsRedeemedForDiscount: 50 },
        })
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } });
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { grossAmount: 110, salesAmount: 100 },
      ]);
      mockPrisma.order.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      const result = await service.getDailyCloseout('rest-1', '2026-07-15');

      expect(result.totalCollected).toBe(110);
      expect(result.totalTips).toBe(10);
      expect(result.refundedAmount).toBe(110);
      expect(result.netRevenue).toBe(0);
      expect(result.discountPointsRedeemed).toBe(50);
      expect(mockPrisma.payment.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['SUCCEEDED', 'REFUNDED'] },
          }),
        }),
      );
    });
  });

  describe('cache lifecycle', () => {
    it('sweeps expired analytics cache entries on the module interval', () => {
      jest.useFakeTimers();
      const sweepSpy = jest.fn();
      service['sweepExpiredCache'] = sweepSpy;

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

    it('uses different cache keys for different dashboard languages', async () => {
      await service.getAnalytics(
        'rest-language',
        7,
        undefined,
        undefined,
        true,
        'en',
      );
      await service.getAnalytics(
        'rest-language',
        7,
        undefined,
        undefined,
        true,
        'bg',
      );

      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledTimes(2);
    });

    it('uses the restaurant local day for the Today preset', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T10:30:00.000Z'));
      mockViews.isReady.mockReturnValue(true);

      try {
        const result = (await service.getAnalytics(
          'rest-today',
          1,
        )) as AnalyticsResult;

        expect(result.periodStart).toBe('2026-07-14T21:00:00.000Z');
        expect(result.periodEnd).toBe('2026-07-15T10:30:00.000Z');
        expect(result.prevPeriodStart).toBe('2026-07-13T21:00:00.000Z');
        expect(result.prevPeriodEnd).toBe('2026-07-14T10:30:00.000Z');
        expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      } finally {
        mockViews.isReady.mockReturnValue(false);
        jest.useRealTimers();
      }
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

    it('returns every order status with 0 count when groupBy returns empty', async () => {
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
      expect(statuses).toContain(OrderStatus.PENDING_PAYMENT);
      expect(result['ordersByStatus']).toHaveLength(6);
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
      // Phase B: spy on new private methods to prevent $queryRaw chaining races
      service['getStaffPerformance'] = jest.fn().mockResolvedValue([]);
      service['getCustomerMetrics'] = jest.fn().mockResolvedValue({
        topCustomers: [],
        churnRiskCount: 0,
        churnRiskBreakdown: { '30d': 0, '60d': 0, '90d+': 0 },
        averageClv: 0,
      });
      service['getKitchenEfficiency'] = jest.fn().mockResolvedValue({
        overallAvgPrepMinutes: 0,
        totalCompletedOrders: 0,
        hourlyAverages: [],
        zoneAverages: [],
      });
      service['getCancelAnalytics'] = jest.fn().mockResolvedValue({
        totalCanceledOrders: 0,
        revenueLost: 0,
        cancelRateByItem: [],
        cancelRateByHour: [],
      });
      service['getTableTurnover'] = jest.fn().mockResolvedValue([]);
      service['getMenuProfitability'] = jest.fn().mockResolvedValue({
        items: [],
        summary: {
          totalCost: 0,
          totalProfit: 0,
          overallMargin: 0,
          missingCostItems: 0,
        },
      });
      service['getGrossProfit'] = jest.fn().mockResolvedValue({
        netSales: 0,
        estimatedCOGS: 0,
        grossProfit: 0,
        grossMargin: 0,
        missingCostItems: 0,
      });
      const today = DateTime.now().setZone('Europe/Sofia').toISODate();
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ date: today, orders: 1, revenue: 50 }])
        .mockResolvedValueOnce([{ name: 'Pizza', quantity: 2, revenue: 20.0 }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ category: 'Food', revenue: 20.0 }])
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

    it('passes the dashboard language to localized aggregate queries', async () => {
      await service.getAnalytics(
        'rest-localized',
        7,
        undefined,
        undefined,
        true,
        'en',
      );

      expect(
        mockPrisma.$queryRaw.mock.calls.some((call) => call.includes('en')),
      ).toBe(true);
    });

    it('populates ordersByTable when orders with tableId exist', async () => {
      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;

      expect(result['ordersByTable']).toHaveLength(1);
      expect(result['ordersByTable'][0].table).toBe('Table 1');
    });

    it('returns an empty table label for the localized UI fallback', async () => {
      // Re-mock getOrdersByTable query: null table_name.
      const today = DateTime.now().setZone('Europe/Sofia').toISODate();
      mockPrisma.$queryRaw.mockReset();
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ date: today, orders: 1, revenue: 50 }])
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
      expect(result['ordersByTable'][0].table).toBe('');
    });

    it('returns a complete SQL-aggregated revenue trend', async () => {
      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;

      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
      expect(Array.isArray(result['revenueTrend'])).toBe(true);
      expect(result['revenueTrend'].length).toBeGreaterThan(0);
    });
  });

  describe('analytics card data contracts', () => {
    const start = new Date('2026-07-01T00:00:00.000Z');
    const end = new Date('2026-07-15T00:00:00.000Z');

    it('uses the order-item price snapshot for historical item revenue', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service['getTopItems']('rest-1', start, end, 'en');

      const sql = mockPrisma.$queryRaw.mock.calls[0][0].join(' ');
      expect(sql).toContain('oi."unitPriceWithOptions" * oi.quantity');
      expect(sql).not.toContain('NULLIF(oi."unitPriceWithOptions", 0)');
      expect(sql).toContain('LEFT JOIN menu_item');
      expect(sql).toContain('MIN(oi."itemName")');
      expect(sql).not.toContain('oi."menuItemId" IS NOT NULL');
    });

    it('keeps deleted items in category revenue as uncategorized', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service['getCategoryBreakdown']('rest-1', start, end, 'en');

      const sql = mockPrisma.$queryRaw.mock.calls[0][0].join(' ');
      expect(sql).toContain('LEFT JOIN menu_item');
      expect(sql).not.toContain('oi."menuItemId" IS NOT NULL');
    });

    it('reconciles gross sales, tips, and successful refunds on compatible bases', async () => {
      mockPrisma.payment.aggregate.mockResolvedValueOnce({
        _sum: { amount: 110, tipAmount: 10 },
      });
      mockPrisma.payment.groupBy.mockResolvedValueOnce([
        { provider: 'STRIPE', _sum: { amount: 110, tipAmount: 10 } },
      ]);
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        { grossAmount: 22, salesAmount: 20 },
      ]);

      const result = await service['getPaymentTotals']('rest-1', start, end);

      expect(result).toEqual({
        collectedRevenue: 100,
        refundedAmount: 20,
        paymentsByMethod: [{ method: 'STRIPE', amount: 100 }],
      });
      expect(mockPrisma.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['SUCCEEDED', 'REFUNDED'] },
          }),
        }),
      );
      const refundSql = mockPrisma.$queryRaw.mock.calls[0][0].join(' ');
      expect(refundSql).toContain('FROM refund_attempt');
      expect(refundSql).toContain('ra."updatedAt"');
    });

    it('uses the same order cohort for net sales and estimated COGS', async () => {
      mockPrisma.order.aggregate.mockResolvedValueOnce({
        _sum: { totalPrice: 120 },
      });
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ totalCost: 40 }]);

      const result = await service['getGrossProfit']('rest-1', start, end);

      expect(result).toEqual({
        netSales: 120,
        estimatedCOGS: 40,
        grossProfit: 80,
        grossMargin: 66.7,
        missingCostItems: 0,
      });
      expect(mockPrisma.order.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: OrderStatus.CANCELED },
            createdAt: { gte: start, lte: end },
          }),
        }),
      );
    });

    it('excludes uncosted items from profitability and reports the coverage gap', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          menuItemId: 'costed',
          item_name: 'Costed item',
          quantity: 2,
          revenue: 20,
          totalCost: 8,
          costPrice: 4,
        },
        {
          menuItemId: 'missing',
          item_name: 'Missing cost',
          quantity: 1,
          revenue: 10,
          totalCost: 0,
          costPrice: 0,
        },
      ]);

      const result = await service['getMenuProfitability'](
        'rest-1',
        start,
        end,
        'en',
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('Costed item');
      expect(result.summary).toEqual({
        totalCost: 8,
        totalProfit: 12,
        overallMargin: 60,
        missingCostItems: 1,
      });
    });

    it('groups menu profitability by the same deleted-item key it selects', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service['getMenuProfitability']('rest-1', start, end, 'en');

      const sql = mockPrisma.$queryRaw.mock.calls[0][0]
        .join(' ')
        .replace(/\s+/g, ' ');
      expect(sql).toContain(
        `GROUP BY COALESCE(oi."menuItemId", 'deleted:' || oi."itemName")`,
      );
      expect(sql).not.toContain(
        'GROUP BY COALESCE(oi."menuItemId", oi."itemName")',
      );
    });

    it('groups cancel analytics by the same deleted-item key it selects', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
      });

      await service['getCancelAnalytics'](
        'rest-1',
        start,
        end,
        'Europe/Sofia',
        'en',
      );

      const sql = mockPrisma.$queryRaw.mock.calls[0][0]
        .join(' ')
        .replace(/\s+/g, ' ');
      expect(sql).toContain(
        `GROUP BY COALESCE(oi."menuItemId", 'deleted:' || oi."itemName")`,
      );
      expect(sql).not.toContain(
        'GROUP BY COALESCE(oi."menuItemId", oi."itemName")',
      );
    });

    it('orders table yield by revenue', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([]);

      await service['getOrdersByTable']('rest-1', start, end);

      const sql = mockPrisma.$queryRaw.mock.calls[0][0].join(' ');
      expect(sql).toContain('ORDER BY SUM(co."totalPrice") DESC');
      expect(sql).toContain('co."servicePointType" = \'TABLE\'');
    });

    it('does not multiply staff orders through payment joins', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          staffUserId: 'staff-1',
          staffName: 'Ana',
          totalOrders: 2,
          totalRevenue: 40,
          avgOrderValue: 20,
          posOrders: 1,
          qrOrders: 1,
        },
      ]);

      const rows = await service['getStaffPerformance']('rest-1', start, end);
      const sql = mockPrisma.$queryRaw.mock.calls[0][0].join(' ');

      expect(rows[0].totalOrders).toBe(2);
      expect(sql).not.toContain('JOIN payment');
    });

    it('calculates table revenue per occupied hour from total duration', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          tableId: 'table-1',
          tableName: '1',
          sessionCount: 2,
          avgDurationMinutes: 60,
          totalDurationMinutes: 120,
          totalRevenue: 200,
        },
      ]);

      const rows = await service['getTableTurnover']('rest-1', start, end);
      const sql = mockPrisma.$queryRaw.mock.calls[0][0].join(' ');

      expect(rows[0].sessionCount).toBe(2);
      expect(rows[0].revenuePerOccupiedHour).toBe(100);
      expect(rows[0].estimatedTurnsPer24Hours).toBe(24);
      expect(sql).toContain('SUM(amount - "tipAmount")');
      expect(sql).toContain('ts."isServicePoint" = false');
    });

    it('uses lifetime history for churn and CLV while ranking the selected period', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T00:00:00.000Z'));
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          phone: '+3591',
          name: 'Ana',
          periodSpend: 50,
          periodVisits: 2,
          lifetimeSpend: 100,
          lifetimeVisits: 4,
          lastVisit: new Date('2026-06-01T00:00:00.000Z'),
        },
      ]);

      try {
        const result = await service['getCustomerMetrics'](
          'rest-1',
          start,
          end,
          'Europe/Sofia',
        );

        expect(result.topCustomers[0].totalSpend).toBe(50);
        expect(result.averageClv).toBe(100);
        expect(result.churnRiskCount).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it('measures churn in restaurant calendar days across local midnight', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T21:30:00.000Z'));
      mockPrisma.$queryRaw.mockResolvedValueOnce([
        {
          phone: '+3592',
          name: 'Boris',
          periodSpend: 10,
          periodVisits: 1,
          lifetimeSpend: 10,
          lifetimeVisits: 1,
          lastVisit: new Date('2026-06-16T20:30:00.000Z'),
        },
      ]);

      try {
        const result = await service['getCustomerMetrics'](
          'rest-1',
          start,
          end,
          'Europe/Sofia',
        );

        expect(result.topCustomers[0].daysSinceLastVisit).toBe(30);
        expect(result.churnRiskCount).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('getAnalytics via materialized views (isReady = true)', () => {
    beforeEach(() => {
      mockViews.isReady.mockReturnValue(true);
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'UTC',
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
      service['getStaffPerformance'] = jest.fn().mockResolvedValue([]);
      service['getCustomerMetrics'] = jest.fn().mockResolvedValue({
        topCustomers: [],
        churnRiskCount: 0,
        churnRiskBreakdown: { '30d': 0, '60d': 0, '90d+': 0 },
        averageClv: 0,
      });
      service['getKitchenEfficiency'] = jest.fn().mockResolvedValue({
        overallAvgPrepMinutes: 0,
        totalCompletedOrders: 0,
        hourlyAverages: [],
        zoneAverages: [],
      });
      service['getCancelAnalytics'] = jest.fn().mockResolvedValue({
        totalCanceledOrders: 0,
        revenueLost: 0,
        cancelRateByItem: [],
        cancelRateByHour: [],
      });
      service['getTableTurnover'] = jest.fn().mockResolvedValue([]);
      service['getMenuProfitability'] = jest.fn().mockResolvedValue({
        items: [],
        summary: {
          totalCost: 0,
          totalProfit: 0,
          overallMargin: 0,
          missingCostItems: 0,
        },
      });
      service['getGrossProfit'] = jest.fn().mockResolvedValue({
        netSales: 0,
        estimatedCOGS: 0,
        grossProfit: 0,
        grossMargin: 0,
        missingCostItems: 0,
      });
    });

    afterEach(() => {
      mockViews.isReady.mockReturnValue(false);
    });

    it('bypasses UTC-day views for a restaurant in a non-UTC timezone', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'Europe/Sofia',
      });
      const directTrend = jest
        .spyOn(service as any, 'getRevenueTrend')
        .mockResolvedValue([]);
      const viewTrend = jest.spyOn(service as any, 'getRevenueTrendFromView');

      await service.getAnalytics('rest-local-time', 7);

      expect(directTrend).toHaveBeenCalled();
      expect(viewTrend).not.toHaveBeenCalled();
    });

    it('calls $queryRaw for 3 views plus category, table, and refund aggregates', async () => {
      await service.getAnalytics('rest-1', 7);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(6);
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
      service['getStaffPerformance'] = jest.fn().mockResolvedValue([]);
      service['getCustomerMetrics'] = jest.fn().mockResolvedValue({
        topCustomers: [],
        churnRiskCount: 0,
        churnRiskBreakdown: { '30d': 0, '60d': 0, '90d+': 0 },
        averageClv: 0,
      });
      service['getKitchenEfficiency'] = jest.fn().mockResolvedValue({
        overallAvgPrepMinutes: 0,
        totalCompletedOrders: 0,
        hourlyAverages: [],
        zoneAverages: [],
      });
      service['getCancelAnalytics'] = jest.fn().mockResolvedValue({
        totalCanceledOrders: 0,
        revenueLost: 0,
        cancelRateByItem: [],
        cancelRateByHour: [],
      });
      service['getTableTurnover'] = jest.fn().mockResolvedValue([]);
      service['getMenuProfitability'] = jest.fn().mockResolvedValue({
        items: [],
        summary: {
          totalCost: 0,
          totalProfit: 0,
          overallMargin: 0,
          missingCostItems: 0,
        },
      });
      service['getGrossProfit'] = jest.fn().mockResolvedValue({
        netSales: 0,
        estimatedCOGS: 0,
        grossProfit: 0,
        grossMargin: 0,
        missingCostItems: 0,
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

  describe('getAnalytics premium gating (ANALYTICS_FULL)', () => {
    const PREMIUM_KEYS = [
      'staffPerformance',
      'customerMetrics',
      'kitchenEfficiency',
      'cancelAnalytics',
      'tableTurnover',
      'menuProfitability',
      'grossProfit',
    ];
    const methodFor = (key: string) =>
      'get' + key.charAt(0).toUpperCase() + key.slice(1);

    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'Europe/Sofia',
      });
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _count: 0,
        _avg: { totalPrice: 0 },
      });
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.orderItem.findMany.mockResolvedValue([]);
      // Spy each premium computation with a sentinel so the assertion checks the
      // wiring (key lands in the response) without racing the real $queryRaw mock.
      for (const key of PREMIUM_KEYS) {
        (service as unknown as Record<string, jest.Mock>)[methodFor(key)] = jest
          .fn()
          .mockResolvedValue(`sentinel:${key}`);
      }
    });

    it('includes all 7 premium metrics when includePremium defaults to true', async () => {
      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;

      for (const key of PREMIUM_KEYS) {
        expect(result[key]).toBe(`sentinel:${key}`);
      }
    });

    it('omits premium metrics and skips their computation when includePremium is false', async () => {
      const result = (await service.getAnalytics(
        'rest-1',
        7,
        undefined,
        undefined,
        false,
      )) as AnalyticsResult;

      for (const key of PREMIUM_KEYS) {
        expect(result[key]).toBeUndefined();
        expect(
          (service as unknown as Record<string, jest.Mock>)[methodFor(key)],
        ).not.toHaveBeenCalled();
      }
      // Basic-tier fields still computed and returned.
      expect(result).toHaveProperty('totalRevenue');
      expect(result).toHaveProperty('completionRate');
    });
  });

  describe('Analytics Edge Cases (Expanded Coverage)', () => {
    it('handles null totalRevenue when computing getSummary with empty metrics', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ timezone: 'UTC' });
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
      });
      mockPrisma.assistanceRequest.count.mockResolvedValue(0);
      mockPrisma.order.findMany.mockResolvedValue([]);

      const result = await service.getSummary('rest-empty');
      expect(result.totalRevenue).toBe(0);
      expect(result.ordersToday).toBe(0);
      expect(result.openAssistanceRequests).toBe(0);
    });

    it('returns properly formatted comparison object for getAnalytics when previous period data is identical', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ timezone: 'UTC' });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 100 },
        _count: 5,
        _avg: { totalPrice: 20 },
      });
      mockPrisma.orderItem.findMany.mockResolvedValue([]);
      mockPrisma.order.groupBy.mockResolvedValue([]);

      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;
      expect(result.comparison.revenueChange).toBe(0);
      expect(result.comparison.ordersChange).toBe(0);
    });

    it('returns 0 completionRate when order.aggregate returns zero count', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ timezone: 'UTC' });
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _count: 0,
        _avg: { totalPrice: 0 },
      });
      const result = (await service.getAnalytics(
        'rest-1',
        7,
      )) as AnalyticsResult;
      expect(result.completionRate).toBe(0);
    });
  });
});
