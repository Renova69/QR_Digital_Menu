import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

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
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnalyticsResult = Record<string, any>;

describe('DashboardService', () => {
  let service: DashboardService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
  });

  describe('getSummary', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ timezone: 'UTC' });
      mockPrisma.order.count.mockResolvedValue(5);
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { totalPrice: 250 } });
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
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { totalPrice: null } });

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

  describe('getAnalytics', () => {
    const defaultAggregate = { _sum: { totalPrice: 100 }, _count: 3, _avg: { totalPrice: 33.33 } };

    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ timezone: 'UTC' });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.aggregate.mockResolvedValue(defaultAggregate);
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.orderItem.findMany.mockResolvedValue([]);
    });

    it('returns analytics result with expected shape', async () => {
      const result = (await service.getAnalytics('rest-1', 7)) as AnalyticsResult;

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
      const result = (await service.getAnalytics('rest-1', 7, '2026-01-01', '2026-01-07')) as AnalyticsResult;

      expect(result).toBeDefined();
      expect(result['period']).toBe(7);
    });

    it('calculates 100% revenueChange when previous period had 0 revenue', async () => {
      mockPrisma.order.aggregate
        .mockResolvedValueOnce({ _sum: { totalPrice: 500 }, _count: 10, _avg: { totalPrice: 50 } }) // current
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 }, _count: 0, _avg: { totalPrice: 0 } });    // previous

      const result = (await service.getAnalytics('rest-2', 7)) as AnalyticsResult;

      expect(result['comparison']['revenueChange']).toBe(100);
    });

    it('calculates 0% change when both periods have 0 revenue', async () => {
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _count: 0,
        _avg: { totalPrice: 0 },
      });

      const result = (await service.getAnalytics('rest-3', 7)) as AnalyticsResult;

      expect(result['comparison']['revenueChange']).toBe(0);
    });
  });

  describe('getOrdersByStatus (via getAnalytics)', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ timezone: 'UTC' });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
        _count: 0,
        _avg: { totalPrice: 0 },
      });
      mockPrisma.orderItem.findMany.mockResolvedValue([]);
    });

    it('returns all 4 statuses with 0 count when groupBy returns empty', async () => {
      mockPrisma.order.groupBy.mockResolvedValue([]);

      const result = (await service.getAnalytics('rest-1', 7)) as AnalyticsResult;
      const statuses = result['ordersByStatus'].map((s: { status: string }) => s.status);

      expect(statuses).toContain(OrderStatus.NEW);
      expect(statuses).toContain(OrderStatus.IN_PROGRESS);
      expect(statuses).toContain(OrderStatus.SERVED);
      expect(statuses).toContain(OrderStatus.CANCELED);
      expect(result['ordersByStatus']).toHaveLength(4);
      result['ordersByStatus'].forEach((s: { count: number }) => expect(s.count).toBe(0));
    });

    it('maps groupBy counts to correct statuses', async () => {
      mockPrisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.NEW, _count: 3 },
        { status: OrderStatus.SERVED, _count: 7 },
      ]);

      const result = (await service.getAnalytics('rest-1', 7)) as AnalyticsResult;
      const newEntry = result['ordersByStatus'].find((s: { status: string }) => s.status === OrderStatus.NEW);
      const servedEntry = result['ordersByStatus'].find((s: { status: string }) => s.status === OrderStatus.SERVED);
      const canceledEntry = result['ordersByStatus'].find((s: { status: string }) => s.status === OrderStatus.CANCELED);

      expect(newEntry?.count).toBe(3);
      expect(servedEntry?.count).toBe(7);
      expect(canceledEntry?.count).toBe(0);
    });
  });

  describe('servedRate calculation', () => {
    it('returns 0 servedRate when no orders', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ timezone: 'UTC' });
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.aggregate.mockResolvedValue({ _sum: { totalPrice: 0 }, _count: 0, _avg: { totalPrice: 0 } });
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.orderItem.findMany.mockResolvedValue([]);

      const result = (await service.getAnalytics('rest-1', 7)) as AnalyticsResult;

      expect(result['servedRate']).toBe(0);
    });
  });
});
