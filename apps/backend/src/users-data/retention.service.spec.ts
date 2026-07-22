import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { RetentionService } from './retention.service';

describe('RetentionService', () => {
  const settings = {
    retentionCronEnabled: true,
    orderPiiRetentionYears: 7,
  };

  const createHarness = () => {
    const prisma = {
      verificationToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      restaurant: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: 'restaurant-1' },
            { id: 'restaurant-2' },
          ])
          .mockResolvedValueOnce([
            { id: 'restaurant-1' },
            { id: 'restaurant-2' },
          ]),
      },
      order: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 2 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      menuView: {
        deleteMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 4 }),
      },
    };
    const platformSettings = {
      getSettings: jest.fn().mockResolvedValue(settings),
    };
    const service = new RetentionService(
      prisma as unknown as PrismaService,
      platformSettings as unknown as PlatformSettingsService,
    );
    const logger = (
      service as unknown as {
        logger: { log: jest.Mock; error: jest.Mock };
      }
    ).logger;
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);

    return { logger, platformSettings, prisma, service };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-18T03:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('isolates failed global and tenant duties and returns a structured summary', async () => {
    const { logger, prisma, service } = createHarness();
    prisma.verificationToken.deleteMany.mockRejectedValue(
      new Error('token delete failed'),
    );
    prisma.order.updateMany
      .mockReset()
      .mockResolvedValueOnce({ count: 2 })
      .mockRejectedValueOnce(new Error('tenant order update failed'));
    prisma.menuView.deleteMany
      .mockReset()
      .mockRejectedValueOnce(new Error('tenant menu delete failed'))
      .mockResolvedValueOnce({ count: 4 });

    const summary = await service.runDailyRetention();

    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(2);
    expect(prisma.menuView.deleteMany).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      enabled: true,
      status: 'COMPLETED_WITH_ERRORS',
      totals: {
        scopesAttempted: 5,
        scopesSucceeded: 2,
        scopesFailed: 3,
        affectedRows: 6,
      },
      duties: {
        verificationTokens: {
          scopesAttempted: 1,
          scopesSucceeded: 0,
          scopesFailed: 1,
          affectedRows: 0,
        },
        orderPiiAnonymization: {
          scopesAttempted: 2,
          scopesSucceeded: 1,
          scopesFailed: 1,
          affectedRows: 2,
        },
        menuViewPruning: {
          scopesAttempted: 2,
          scopesSucceeded: 1,
          scopesFailed: 1,
          affectedRows: 4,
        },
      },
      failures: [
        expect.objectContaining({
          duty: 'verificationTokens',
          scope: 'global',
          error: 'token delete failed',
        }),
        expect.objectContaining({
          duty: 'orderPiiAnonymization',
          scope: 'tenant',
          restaurantId: 'restaurant-2',
          error: 'tenant order update failed',
        }),
        expect.objectContaining({
          duty: 'menuViewPruning',
          scope: 'tenant',
          restaurantId: 'restaurant-1',
          error: 'tenant menu delete failed',
        }),
      ],
      failuresTruncated: 0,
    });
    expect(summary.startedAt).toBe('2026-07-18T03:00:00.000Z');
    expect(summary.completedAt).toBe('2026-07-18T03:00:00.000Z');
    expect(logger.error).toHaveBeenCalledTimes(3);
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'retention.run.completed',
        status: 'COMPLETED_WITH_ERRORS',
      }),
    );
  });

  it('uses tenant filters and retains idempotent anonymization guards', async () => {
    const { prisma, service } = createHarness();

    await service.runDailyRetention();

    expect(prisma.order.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        restaurantId: 'restaurant-1',
        createdAt: { lt: new Date('2019-07-18T03:00:00.000Z') },
        OR: [
          { customerName: { not: '[REDACTED]' } },
          { customerPhone: { not: null } },
          { customerId: { not: null } },
          { specialRequests: { not: null } },
        ],
      },
      data: {
        customerName: '[REDACTED]',
        customerPhone: null,
        specialRequests: null,
        customerId: null,
      },
    });
    expect(prisma.menuView.deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        restaurantId: 'restaurant-1',
        createdAt: { lt: new Date('2025-07-18T03:00:00.000Z') },
      },
    });
  });

  it('continues to menu-view pruning when order tenant enumeration fails', async () => {
    const { prisma, service } = createHarness();
    prisma.restaurant.findMany
      .mockReset()
      .mockRejectedValueOnce(new Error('order tenant scan failed'))
      .mockResolvedValueOnce([{ id: 'restaurant-1' }]);

    const summary = await service.runDailyRetention();

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(prisma.menuView.deleteMany).toHaveBeenCalledTimes(1);
    expect(summary.duties.orderPiiAnonymization).toMatchObject({
      scopesAttempted: 1,
      scopesFailed: 1,
    });
    expect(summary.duties.menuViewPruning).toMatchObject({
      scopesAttempted: 1,
      scopesSucceeded: 1,
    });
    expect(summary.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          duty: 'orderPiiAnonymization',
          scope: 'tenant-enumeration',
        }),
      ]),
    );
  });

  it('paginates tenant cleanup with a stable id cursor', async () => {
    const { prisma, service } = createHarness();
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: `restaurant-${String(index + 1).padStart(3, '0')}`,
    }));
    prisma.restaurant.findMany
      .mockReset()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ id: 'restaurant-101' }])
      .mockResolvedValueOnce([]);
    prisma.order.updateMany.mockReset().mockResolvedValue({ count: 0 });

    await service.runDailyRetention();

    expect(prisma.restaurant.findMany).toHaveBeenNthCalledWith(2, {
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 100,
      cursor: { id: 'restaurant-100' },
      skip: 1,
    });
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(101);
    expect(prisma.menuView.deleteMany).not.toHaveBeenCalled();
  });

  it('returns a skipped summary without database cleanup when disabled', async () => {
    const { platformSettings, prisma, service } = createHarness();
    platformSettings.getSettings.mockResolvedValue({
      ...settings,
      retentionCronEnabled: false,
    });

    await expect(service.runDailyRetention()).resolves.toMatchObject({
      enabled: false,
      status: 'SKIPPED',
      totals: {
        scopesAttempted: 0,
        scopesSucceeded: 0,
        scopesFailed: 0,
        affectedRows: 0,
      },
    });
    expect(prisma.verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.restaurant.findMany).not.toHaveBeenCalled();
  });

  it('returns and logs a failed summary when settings cannot be loaded', async () => {
    const { logger, platformSettings, prisma, service } = createHarness();
    platformSettings.getSettings.mockRejectedValue(
      new Error('settings unavailable'),
    );

    const summary = await service.runDailyRetention();

    expect(summary).toMatchObject({
      enabled: null,
      status: 'FAILED',
      totals: { scopesFailed: 1 },
      failures: [
        {
          duty: 'settings',
          scope: 'global',
          error: 'settings unavailable',
        },
      ],
    });
    expect(prisma.verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'retention.run.failed',
        status: 'FAILED',
      }),
    );
  });
});
