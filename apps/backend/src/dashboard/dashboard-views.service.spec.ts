import { DashboardViewsService } from './dashboard-views.service';

describe('DashboardViewsService', () => {
  let service: DashboardViewsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      // Comment read defaults to null => every view is treated as stale/missing
      // and gets (re)built.
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ comment: null }]),
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
    it('rebuilds all 3 stale views (DROP+CREATE+INDEX+COMMENT each) and sets ready', async () => {
      await service.onModuleInit();

      expect(service.isReady()).toBe(true);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      // advisory lock acquired once
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      // one comment read per view
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
      // 3 views × (DROP + CREATE + INDEX + COMMENT)
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledTimes(12);
    });

    it('skips rebuild for views whose stamped version still matches', async () => {
      // First boot: comments are null -> everything rebuilds. Capture the
      // version strings the service stamped via COMMENT ON.
      await service.onModuleInit();
      const stampByView = new Map<string, string>();
      for (const [sql] of mockPrisma.$executeRawUnsafe.mock.calls as [
        string,
      ][]) {
        const m = sql.match(
          /COMMENT ON MATERIALIZED VIEW (\w+) IS '(v:[0-9a-f]+)'/,
        );
        if (m) stampByView.set(m[1], m[2]);
      }
      expect(stampByView.size).toBe(3);

      // Second boot: return the matching stamp for each view -> zero DDL.
      mockPrisma.$executeRawUnsafe.mockClear();
      mockPrisma.$queryRawUnsafe.mockImplementation(
        (_sql: string, name: string) =>
          Promise.resolve([{ comment: stampByView.get(name) ?? null }]),
      );

      await service.onModuleInit();

      expect(service.isReady()).toBe(true);
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();
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
      mockPrisma.$transaction.mockClear();

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
      mockPrisma.$transaction.mockClear();
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
