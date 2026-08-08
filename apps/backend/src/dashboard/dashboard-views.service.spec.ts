import * as Sentry from '@sentry/nestjs';
import { DashboardViewsService } from './dashboard-views.service';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

describe('DashboardViewsService', () => {
  let service: DashboardViewsService;
  let mockPrisma: any;

  const ddlStatements = (): string[] =>
    mockPrisma.$executeRawUnsafe.mock.calls.map(([sql]: [string]) => sql);

  beforeEach(() => {
    mockPrisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
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
      // pg_advisory_xact_lock returns void, so it must not use $queryRaw.
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
      // one comment read per view
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
      // 3 views × (DROP + CREATE + INDEX + COMMENT)
      expect(ddlStatements()).toHaveLength(12);
      const createStatements = ddlStatements().filter((sql: string) =>
        sql.includes('CREATE MATERIALIZED VIEW'),
      );
      expect(createStatements).toHaveLength(3);
      for (const sql of createStatements) {
        expect(sql).toContain("status NOT IN ('CANCELED', 'PENDING_PAYMENT')");
      }
    });

    it('uses $executeRaw for void-returning advisory locks', async () => {
      await service.onModuleInit();

      const lockSql = mockPrisma.$executeRaw.mock.calls
        .map(([sql]: [TemplateStringsArray | string]) =>
          Array.isArray(sql) ? sql.join('') : String(sql),
        )
        .find((sql: string) => sql.includes('pg_advisory_xact_lock'));

      expect(lockSql).toContain('dashboard_views_create');
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
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
      expect(ddlStatements()).toEqual([]);
    });

    it('leaves ready false and swallows error when view creation fails', async () => {
      mockPrisma.$executeRawUnsafe.mockImplementation((sql: string) =>
        sql.includes('CREATE MATERIALIZED VIEW')
          ? Promise.reject(new Error('DB error'))
          : Promise.resolve(1),
      );

      await service.onModuleInit();

      expect(service.isReady()).toBe(false);
    });

    it('gives the rebuild an explicit transaction budget, not Prisma’s 5s default', async () => {
      await service.onModuleInit();

      expect(mockPrisma.$transaction.mock.calls[0][1]).toEqual({
        timeout: 90_000,
        maxWait: 10_000,
      });
    });

    it('reports creation failure to Sentry rather than only logging it', async () => {
      mockPrisma.$executeRawUnsafe.mockRejectedValue(new Error('DB error'));

      await service.onModuleInit();

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'DB error' }),
        expect.objectContaining({
          tags: { subsystem: 'dashboard-views', phase: 'create' },
        }),
      );
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
      expect(ddlStatements()).toHaveLength(3);
      expect(mockPrisma.$executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('REFRESH MATERIALIZED VIEW'),
      );
    });

    it('gives the refresh an explicit transaction budget, not Prisma’s 5s default', async () => {
      await service.onModuleInit();
      mockPrisma.$transaction.mockClear();

      await service.refreshViews();

      expect(mockPrisma.$transaction.mock.calls[0][1]).toEqual({
        timeout: 60_000,
        maxWait: 10_000,
      });
    });

    it('skips refresh when another pod holds the advisory lock', async () => {
      await service.onModuleInit();
      mockPrisma.$executeRawUnsafe.mockClear();
      mockPrisma.$transaction.mockClear();
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ locked: false }]);

      await service.refreshViews();

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(ddlStatements()).toEqual([]);
    });

    it('swallows errors gracefully when a view refresh fails', async () => {
      await service.onModuleInit();
      mockPrisma.$executeRawUnsafe.mockRejectedValue(new Error('View error'));

      await expect(service.refreshViews()).resolves.toBeUndefined();
    });

    // A cron that catches its own exception reaches no other reporting path,
    // so without this the dashboard serves stale numbers indefinitely with
    // nothing in Sentry to say so.
    it('reports refresh failure to Sentry rather than only logging it', async () => {
      await service.onModuleInit();
      (Sentry.captureException as jest.Mock).mockClear();
      mockPrisma.$executeRawUnsafe.mockRejectedValue(new Error('View error'));

      await service.refreshViews();

      expect(Sentry.captureException).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'View error' }),
        expect.objectContaining({
          tags: { subsystem: 'dashboard-views', phase: 'refresh' },
        }),
      );
    });
  });
});
