import { DashboardViewsService } from './dashboard-views.service';

describe('DashboardViewsService', () => {
  let service: DashboardViewsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
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

      await service.refreshViews();

      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('REFRESH MATERIALIZED VIEW'),
      );
    });

    it('swallows errors gracefully when a view refresh fails', async () => {
      await service.onModuleInit();
      mockPrisma.$executeRawUnsafe.mockRejectedValue(new Error('View error'));

      await expect(service.refreshViews()).resolves.toBeUndefined();
    });
  });
});
