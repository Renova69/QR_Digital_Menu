import { PaymentNotificationFeedService } from './payment-notification-feed.service';

describe('PaymentNotificationFeedService', () => {
  it('returns recent payment activity with durable per-user read state', async () => {
    const readThrough = new Date('2026-07-28T10:00:00.000Z');
    const prisma = {
      payment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'payment-new',
            tableSessionId: 'session-1',
            amount: 42,
            tipAmount: 4,
            currency: 'EUR',
            provider: 'STRIPE',
            status: 'SUCCEEDED',
            createdAt: new Date('2026-07-28T10:30:00.000Z'),
            updatedAt: new Date('2026-07-28T10:30:00.000Z'),
            tableSession: {
              table: { name: 'Table 7' },
              orders: [{ customerName: 'Alex' }],
            },
            reconciliationIssue: null,
          },
          {
            id: 'payment-old',
            tableSessionId: 'session-2',
            amount: 18,
            tipAmount: 0,
            currency: 'EUR',
            provider: 'CASH',
            status: 'REFUNDED',
            createdAt: new Date('2026-07-28T09:00:00.000Z'),
            updatedAt: new Date('2026-07-28T09:30:00.000Z'),
            tableSession: {
              table: { name: 'Table 2' },
              orders: [],
            },
            reconciliationIssue: null,
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
      paymentNotificationCursor: {
        findUnique: jest.fn().mockResolvedValue({ readThrough }),
        upsert: jest.fn(),
      },
    };
    const core = {
      verifyRestaurantStaffAccess: jest.fn().mockResolvedValue({
        restaurant: {
          id: 'restaurant-1',
          ownerId: 'owner-1',
          notifyAllStaffOnPayment: true,
        },
        user: {
          id: 'owner-1',
          role: 'OWNER',
          restaurantId: null,
        },
      }),
    };
    const service = new PaymentNotificationFeedService(
      prisma as never,
      core as never,
    );

    const result = await service.getFeed('restaurant-1', 'owner-1', 20);

    expect(result.unreadCount).toBe(1);
    expect(result.data).toEqual([
      expect.objectContaining({
        id: 'payment:payment-new',
        paymentId: 'payment-new',
        kind: 'PAYMENT_SUCCEEDED',
        tableNumber: 'Table 7',
        customerName: 'Alex',
        read: false,
      }),
      expect.objectContaining({
        id: 'payment:payment-old',
        paymentId: 'payment-old',
        kind: 'PAYMENT_REFUNDED',
        tableNumber: 'Table 2',
        customerName: null,
        read: true,
      }),
    ]);
  });

  it('persists mark-all-read for the current user and restaurant', async () => {
    const prisma = {
      payment: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      paymentNotificationCursor: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const core = {
      verifyRestaurantStaffAccess: jest.fn().mockResolvedValue({
        restaurant: {
          id: 'restaurant-1',
          ownerId: 'owner-1',
          notifyAllStaffOnPayment: true,
        },
        user: {
          id: 'manager-1',
          role: 'MANAGER',
          restaurantId: 'restaurant-1',
        },
      }),
    };
    const service = new PaymentNotificationFeedService(
      prisma as never,
      core as never,
    );

    const result = await service.markAllRead('restaurant-1', 'manager-1');

    expect(result.readThrough).toBeInstanceOf(Date);
    expect(prisma.paymentNotificationCursor.upsert).toHaveBeenCalledWith({
      where: {
        userId_restaurantId: {
          userId: 'manager-1',
          restaurantId: 'restaurant-1',
        },
      },
      create: {
        userId: 'manager-1',
        restaurantId: 'restaurant-1',
        readThrough: result.readThrough,
      },
      update: { readThrough: result.readThrough },
    });
  });

  it('does not expose payment notifications to staff when owner-only notifications are configured', async () => {
    const prisma = {
      payment: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      paymentNotificationCursor: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const core = {
      verifyRestaurantStaffAccess: jest.fn().mockResolvedValue({
        restaurant: {
          id: 'restaurant-1',
          ownerId: 'owner-1',
          notifyAllStaffOnPayment: false,
        },
        user: {
          id: 'waiter-1',
          role: 'WAITER',
          restaurantId: 'restaurant-1',
        },
      }),
    };
    const service = new PaymentNotificationFeedService(
      prisma as never,
      core as never,
    );

    await expect(service.getFeed('restaurant-1', 'waiter-1')).resolves.toEqual({
      data: [],
      unreadCount: 0,
      readThrough: null,
    });
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.paymentNotificationCursor.findUnique).not.toHaveBeenCalled();
  });
});
