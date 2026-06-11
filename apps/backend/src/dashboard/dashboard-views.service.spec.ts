import { DashboardViewsService } from './dashboard-views.service';

describe('DashboardViewsService', () => {
  let service: DashboardViewsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
      $transaction: jest.fn((cb: any) => cb(mockPrisma)),
    };
    service = new DashboardViewsService(mockPrisma);
  });

  describe('isReady', () => {
    it('returns false before onModuleInit', () => {
      expect(service.isReady()).toBe(false);
    });
  });

  describe('onModuleInit', () => {
    it('runs 6 SQL statements and sets ready to true', async () => {
      await service.onModuleInit();

      expect(service.isReady()).toBe(true);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(6);
    });

    it('leaves ready false and swallows error when view creation fails', async () => {
      mockPrisma.$executeRawUnsafe.mockRejectedValueOnce(new Error('DB error'));

      await service.onModuleInit();

      expect(service.isReady()).toBe(false);
    });
  });

  describe('refreshViews', () => {
    it('does nothing when not ready', async () => {
      await service.refreshViews();

      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('refreshes all 3 views when ready', async () => {
      await service.onModuleInit();
      mockPrisma.$executeRawUnsafe.mockClear();
      mockPrisma.$queryRaw.mockClear();

      await service.refreshViews();

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('REFRESH MATERIALIZED VIEW'),
      );
    });

    it('skips refresh when another pod holds the advisory lock', async () => {
      await service.onModuleInit();
      mockPrisma.$executeRawUnsafe.mockClear();
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ locked: false }]);

      await service.refreshViews();

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('swallows errors gracefully when a view refresh fails', async () => {
      await service.onModuleInit();
      mockPrisma.$executeRawUnsafe.mockRejectedValue(new Error('View error'));

      await expect(service.refreshViews()).resolves.toBeUndefined();
    });
  });
});
