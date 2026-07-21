import { PaymentSessionService } from './payment-session.service';

describe('PaymentSessionService retention cron isolation', () => {
  function createService(prisma: {
    payment: { deleteMany: jest.Mock };
    tableSession: { findMany: jest.Mock };
  }) {
    return new PaymentSessionService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('continues to stale-session cleanup when abandoned-payment deletion fails', async () => {
    const prisma = {
      payment: {
        deleteMany: jest.fn().mockRejectedValue(new Error('delete failed')),
      },
      tableSession: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = createService(prisma);
    const error = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.cleanupAbandonedPaymentsAndStaleSessions(),
    ).resolves.toBeUndefined();

    expect(prisma.tableSession.findMany).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      'Abandoned-payment retention step failed',
      { error: 'delete failed' },
    );
  });

  it('logs a stale-session page failure without rejecting the scheduler', async () => {
    const prisma = {
      payment: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      tableSession: {
        findMany: jest.fn().mockRejectedValue(new Error('query failed')),
      },
    };
    const service = createService(prisma);
    const error = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.cleanupAbandonedPaymentsAndStaleSessions(),
    ).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('Stale-session retention query failed', {
      page: 0,
      error: 'query failed',
    });
  });
});
