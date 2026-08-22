import { PaymentSessionService } from './payment-session.service';

// P0-3: GET /payments/session/bill is authorised by the table session token
// alone, which every diner on the tab shares. The payload must therefore carry
// only what a co-diner needs to settle up — not other diners' personal data,
// and not staff email addresses.
describe('PaymentSessionService getSessionBill payload', () => {
  const buildService = (orderOverrides: Record<string, unknown> = {}) => {
    const order = {
      id: 'order-1',
      source: 'CUSTOMER',
      customerName: 'Ivan',
      customerPhone: '+359888000111',
      totalPrice: 20,
      pointsRedeemedForItems: 0,
      items: [],
      staff: null,
      ...orderOverrides,
    };

    const prisma = {
      tableSession: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sess-1',
          tableId: 'table-1',
          restaurantId: 'rest-1',
          status: 'OPEN',
          restaurant: {
            targetLanguages: ['bg'],
            tipsEnabled: false,
            tipOptions: [],
          },
          table: { name: '5' },
        }),
      },
      order: { findMany: jest.fn().mockResolvedValue([order]) },
    };

    const core = {
      computeSessionBalance: jest.fn().mockResolvedValue({
        paidSubtotal: 0,
        remaining: 20,
        hasLoyaltyDiscount: false,
      }),
      getPendingBillPayment: jest.fn().mockResolvedValue(null),
      roundMoney: (n: number) => Math.round(n * 100) / 100,
    };

    const config = {
      isStripeConfigured: jest.fn().mockReturnValue(false),
      isEpayConfigured: jest.fn().mockReturnValue(false),
      isBoricaConfigured: jest.fn().mockReturnValue(false),
      isMyposConfigured: jest.fn().mockReturnValue(false),
    };

    const service = new PaymentSessionService(
      prisma as never,
      {} as never,
      {} as never,
      core as never,
      config as never,
      { getFeatures: jest.fn().mockReturnValue([]) } as never,
    );

    return { service, prisma };
  };

  it('does not expose a co-diner’s phone number', async () => {
    const { service } = buildService();

    const bill: any = await service.getSessionBill('tok-1').catch((e) => e);

    // If the provider-resolution tail throws on these thin mocks the payload
    // assertion is still the point — guard so the test fails loudly instead.
    expect(bill).not.toBeInstanceOf(Error);
    expect(bill.orders[0]).not.toHaveProperty('customerPhone');
    // customerName stays: a shared bill has to attribute items to people.
    expect(bill.orders[0].customerName).toBe('Ivan');
  });

  it('never falls back to a staff email address for staffName', async () => {
    const { service } = buildService({
      source: 'POS',
      customerName: null,
      staff: { name: null, role: 'WAITER' },
    });

    const bill: any = await service.getSessionBill('tok-1').catch((e) => e);

    expect(bill).not.toBeInstanceOf(Error);
    expect(bill.orders[0].staffName).toBeNull();
    expect(bill.orders[0].staffRole).toBe('WAITER');
    expect(JSON.stringify(bill)).not.toContain('@');
  });

  it('does not even select the staff email column', async () => {
    const { service, prisma } = buildService();

    await service.getSessionBill('tok-1').catch(() => undefined);

    const staffSelect =
      prisma.order.findMany.mock.calls[0][0].include.staff.select;
    expect(staffSelect).not.toHaveProperty('email');
    expect(staffSelect.name).toBe(true);
    expect(staffSelect.role).toBe(true);
  });
});

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
