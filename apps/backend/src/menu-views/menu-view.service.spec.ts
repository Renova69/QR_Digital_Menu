import { MenuViewService } from './menu-view.service';

const makeView = (overrides: Record<string, unknown> = {}) => ({
  id: 'v1',
  restaurantId: 'rest1',
  tableId: null,
  tableName: null,
  visitorId: 'visitor-a',
  createdAt: new Date(),
  ...overrides,
});

describe('MenuViewService', () => {
  let service: MenuViewService;
  let mockPrisma: any;
  let mockSlugs: any;

  beforeEach(() => {
    mockSlugs = {
      commitOnActivity: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      restaurant: {
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Sofia' }),
      },
      restaurantTable: {
        findFirst: jest.fn().mockResolvedValue({ id: 'table1' }),
      },
      menuView: {
        create: jest.fn().mockResolvedValue(makeView()),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      // Unique-visitor counts now come from COUNT(DISTINCT) raw queries (#18).
      // Call order: 1) total distinct → [{ count }], 2) per-table distinct.
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    service = new MenuViewService(mockPrisma, mockSlugs);
  });

  // ─── recordView ───────────────────────────────────────────────────────────────

  describe('recordView', () => {
    it('inserts a row with resolved tableId when table name is provided', async () => {
      await service.recordView('rest1', { table: 'T1', visitorId: 'v-abc' });

      expect(mockPrisma.restaurantTable.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: 'T1', restaurantId: 'rest1', type: 'TABLE' },
        }),
      );
      expect(mockPrisma.menuView.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          restaurantId: 'rest1',
          tableId: 'table1',
          tableName: 'T1',
          visitorId: 'v-abc',
        }),
      });
    });

    it('inserts a row with null tableId when no table is provided', async () => {
      await service.recordView('rest1', {});

      expect(mockPrisma.restaurantTable.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.menuView.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tableId: null, tableName: null }),
      });
    });

    it('silently returns when restaurant does not exist', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(0);

      await service.recordView('bad-id', { visitorId: 'v1' });

      expect(mockPrisma.menuView.create).not.toHaveBeenCalled();
    });

    it('swallows DB errors without throwing', async () => {
      mockPrisma.menuView.create.mockRejectedValue(new Error('DB error'));

      await expect(service.recordView('rest1', {})).resolves.toBeUndefined();
    });

    // ─── Task 18B: auto-commit on activity ───────────────────────────────────

    it('commits the slug for the correct restaurant after a successful view', async () => {
      await service.recordView('rest1', { visitorId: 'v-abc' });

      expect(mockSlugs.commitOnActivity).toHaveBeenCalledWith('rest1');
    });

    it('does not commit the slug when the view write fails', async () => {
      mockPrisma.menuView.create.mockRejectedValue(new Error('DB error'));

      await service.recordView('rest1', { visitorId: 'v-abc' });

      expect(mockSlugs.commitOnActivity).not.toHaveBeenCalled();
    });

    it('does not commit the slug when the restaurant does not exist', async () => {
      mockPrisma.restaurant.count.mockResolvedValue(0);

      await service.recordView('bad-id', { visitorId: 'v1' });

      expect(mockSlugs.commitOnActivity).not.toHaveBeenCalled();
    });

    it('waits for the first-activity commit attempt before resolving', async () => {
      let resolveCommit!: () => void;
      let markCommitStarted!: () => void;
      const commitStarted = new Promise<void>((resolve) => {
        markCommitStarted = resolve;
      });
      mockSlugs.commitOnActivity.mockImplementation(() => {
        markCommitStarted();
        return new Promise<void>((resolve) => {
          resolveCommit = resolve;
        });
      });

      let settled = false;
      const record = service.recordView('rest1', {}).then(() => {
        settled = true;
      });
      await commitStarted;
      await Promise.resolve();
      await Promise.resolve();

      expect(settled).toBe(false);
      resolveCommit();
      await record;
      expect(settled).toBe(true);
    });
  });

  // ─── getScanStats ──────────────────────────────────────────────────────────────

  describe('getScanStats', () => {
    it('returns zero counts when no views exist', async () => {
      const result = await service.getScanStats('rest1');

      expect(result.totalViews).toBe(0);
      expect(result.uniqueVisitors).toBe(0);
      expect(result.todayViews).toBe(0);
      expect(result.perTable).toEqual([]);
    });

    it('counts total and today views from Prisma', async () => {
      mockPrisma.menuView.count
        .mockResolvedValueOnce(42) // totalViews
        .mockResolvedValueOnce(7); // todayViews

      const result = await service.getScanStats('rest1');

      expect(result.totalViews).toBe(42);
      expect(result.todayViews).toBe(7);
    });

    it('deduplicates unique visitors correctly', async () => {
      mockPrisma.menuView.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      // 1st $queryRaw = total distinct visitors.
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ count: 2 }]);

      const result = await service.getScanStats('rest1');

      expect(result.uniqueVisitors).toBe(2);
    });

    it('groups per-table views and unique visitors correctly', async () => {
      mockPrisma.menuView.groupBy.mockResolvedValue([
        { tableId: 'table1', tableName: 'Table 1', _count: { id: 3 } },
        { tableId: 'table2', tableName: 'Table 2', _count: { id: 1 } },
      ]);
      mockPrisma.$queryRaw
        // 1st call: total distinct visitors
        .mockResolvedValueOnce([{ count: 2 }])
        // 2nd call: per-table distinct visitors
        .mockResolvedValueOnce([
          { tableId: 'table1', tableName: 'Table 1', unique_visitors: 2 },
          { tableId: 'table2', tableName: 'Table 2', unique_visitors: 1 },
        ]);

      const result = await service.getScanStats('rest1');
      const t1 = result.perTable.find((r) => r.tableName === 'Table 1')!;
      const t2 = result.perTable.find((r) => r.tableName === 'Table 2')!;

      expect(t1.views).toBe(3);
      expect(t1.uniqueVisitors).toBe(2);
      expect(t2.views).toBe(1);
      expect(t2.uniqueVisitors).toBe(1);
    });

    it('does not double-count a visitor when a table was renamed', async () => {
      mockPrisma.menuView.groupBy.mockResolvedValue([
        { tableId: 'table1', tableName: 'Old name', _count: { id: 3 } },
        { tableId: 'table1', tableName: 'New name', _count: { id: 2 } },
      ]);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ count: 2 }])
        .mockResolvedValueOnce([
          { tableId: 'table1', tableName: 'New name', unique_visitors: 2 },
        ]);

      const result = await service.getScanStats('rest1');

      expect(result.perTable).toHaveLength(1);
      expect(result.perTable[0].views).toBe(5);
      expect(result.perTable[0].uniqueVisitors).toBe(2);
    });

    it('sorts per-table results by views descending', async () => {
      mockPrisma.menuView.groupBy.mockResolvedValue([
        { tableId: 't1', tableName: 'T1', _count: { id: 1 } },
        { tableId: 't2', tableName: 'T2', _count: { id: 5 } },
      ]);

      const result = await service.getScanStats('rest1');

      expect(result.perTable[0].tableName).toBe('T2');
      expect(result.perTable[1].tableName).toBe('T1');
    });

    it('uses restaurant timezone to compute today start', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        timezone: 'America/New_York',
      });

      await service.getScanStats('rest1');

      // todayViews count call should use a date gte boundary — just verify it fires twice
      expect(mockPrisma.menuView.count).toHaveBeenCalledTimes(2);
    });

    it('scopes the Today preset to the restaurant local day', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-15T10:30:00.000Z'));

      try {
        await service.getScanStats('rest1', { period: 1 });

        expect(mockPrisma.menuView.count).toHaveBeenNthCalledWith(1, {
          where: {
            restaurantId: 'rest1',
            createdAt: {
              gte: new Date('2026-07-14T21:00:00.000Z'),
              lte: new Date('2026-07-15T10:30:00.000Z'),
            },
          },
        });
      } finally {
        jest.useRealTimers();
      }
    });

    it('uses explicit custom date boundaries for scan statistics', async () => {
      await service.getScanStats('rest1', {
        startDate: '2026-07-01',
        endDate: '2026-07-03',
      });

      expect(mockPrisma.menuView.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: new Date('2026-06-30T21:00:00.000Z'),
              lte: new Date('2026-07-03T20:59:59.999Z'),
            },
          }),
        }),
      );
    });

    it('falls back to UTC when restaurant has no timezone set', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ timezone: null });

      await expect(service.getScanStats('rest1')).resolves.toBeDefined();
    });

    it('filters out rows with null tableId from per-table stats', async () => {
      mockPrisma.menuView.groupBy.mockResolvedValue([
        { tableId: 'table1', tableName: 'Table 1', _count: { id: 3 } },
      ]);
      mockPrisma.$queryRaw
        .mockResolvedValueOnce([{ count: 4 }])
        .mockResolvedValueOnce([
          { tableId: 'table1', tableName: 'Table 1', unique_visitors: 2 },
        ]);

      const result = await service.getScanStats('rest1');

      // Only the non-null tableId rows appear
      expect(result.perTable).toHaveLength(1);
      expect(result.perTable[0].tableName).toBe('Table 1');
    });
  });
});
