import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentCoreService } from './payment-core.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../../events/events.gateway';
import { FeatureService } from '../../subscription/feature.service';

type DeepPartial<T> = T extends Function
  ? T
  : T extends object
    ? { [P in keyof T]?: DeepPartial<T[P]> }
    : T;

// Direct unit coverage for the payment access perimeter. Before the split these
// checks lived in PaymentService and were exercised only transitively; this spec
// pins each role/owner/super-admin branch so a future caller can't quietly drop
// or "align" them. The STAFF/KITCHEN divergence between POS and cash access is
// the security-critical invariant under test.
describe('PaymentCoreService access checks', () => {
  const RID = 'rest-1';
  const OWNER = 'owner-1';
  let prisma: {
    restaurant: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
  };
  let service: PaymentCoreService;

  beforeEach(() => {
    prisma = {
      restaurant: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    service = new PaymentCoreService(
      prisma as unknown as PrismaService,
      {} as Partial<EventsGateway> as EventsGateway, // EventsGateway — unused by access checks
      {} as Partial<FeatureService> as FeatureService, // FeatureService — unused by access checks
    );
  });

  const restaurant = (over: Record<string, unknown> = {}) => ({
    id: RID,
    ownerId: OWNER,
    ...over,
  });
  const user = (over: Record<string, unknown> = {}) => ({
    restaurantId: RID,
    role: 'MANAGER',
    ...over,
  });

  describe('verifyRestaurantAccess (dashboard payments — OWNER/MANAGER only)', () => {
    it('throws NotFound when the restaurant does not exist', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(null);
      await expect(
        service.verifyRestaurantAccess(RID, 'someone'),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the owner without a user lookup', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      await expect(
        service.verifyRestaurantAccess(RID, OWNER),
      ).resolves.toMatchObject({ id: RID });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('allows SUPER_ADMIN', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      prisma.user.findUnique.mockResolvedValue(
        user({ restaurantId: 'other', role: 'SUPER_ADMIN' }),
      );
      await expect(
        service.verifyRestaurantAccess(RID, 'admin'),
      ).resolves.toBeDefined();
    });

    it('allows an assigned MANAGER and OWNER-role user', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      for (const role of ['MANAGER', 'OWNER']) {
        prisma.user.findUnique.mockResolvedValue(user({ role }));
        await expect(
          service.verifyRestaurantAccess(RID, 'u-' + role),
        ).resolves.toBeDefined();
      }
    });

    it('denies WAITER and STAFF even when assigned', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      for (const role of ['WAITER', 'STAFF', 'KITCHEN']) {
        prisma.user.findUnique.mockResolvedValue(user({ role }));
        await expect(
          service.verifyRestaurantAccess(RID, 'u-' + role),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('denies a MANAGER assigned to a different restaurant', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      prisma.user.findUnique.mockResolvedValue(
        user({ restaurantId: 'other', role: 'MANAGER' }),
      );
      await expect(
        service.verifyRestaurantAccess(RID, 'intruder'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies the owner when the restaurant is soft-deleted/suspended', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(
        restaurant({ isActive: false }),
      );
      await expect(service.verifyRestaurantAccess(RID, OWNER)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('denies the owner when deletedAt is set even if isActive was not cleared', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(
        restaurant({ isActive: true, deletedAt: new Date() }),
      );
      await expect(service.verifyRestaurantAccess(RID, OWNER)).rejects.toThrow(
        ForbiddenException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('denies an assigned MANAGER when the restaurant is soft-deleted/suspended', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(
        restaurant({ isActive: false }),
      );
      prisma.user.findUnique.mockResolvedValue(user({ role: 'MANAGER' }));
      await expect(
        service.verifyRestaurantAccess(RID, 'u-MANAGER'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still allows SUPER_ADMIN when the restaurant is soft-deleted/suspended', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(
        restaurant({ isActive: false }),
      );
      prisma.user.findUnique.mockResolvedValue(
        user({ restaurantId: 'other', role: 'SUPER_ADMIN' }),
      );
      await expect(
        service.verifyRestaurantAccess(RID, 'admin'),
      ).resolves.toBeDefined();
    });
  });

  describe('verifyPosOperatorAccess (session force/close/settle — excludes STAFF/KITCHEN)', () => {
    it('throws NotFound when the restaurant does not exist', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue(user());
      await expect(
        service.verifyPosOperatorAccess(RID, 'someone'),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows SUPER_ADMIN, owner, assigned MANAGER and WAITER', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({ ownerId: OWNER });
      // owner
      prisma.user.findUnique.mockResolvedValue(user({ role: 'WAITER' }));
      await expect(
        service.verifyPosOperatorAccess(RID, OWNER),
      ).resolves.toBeUndefined();
      // super admin (unassigned)
      prisma.user.findUnique.mockResolvedValue(
        user({ restaurantId: 'other', role: 'SUPER_ADMIN' }),
      );
      await expect(
        service.verifyPosOperatorAccess(RID, 'admin'),
      ).resolves.toBeUndefined();
      // assigned MANAGER / WAITER
      for (const role of ['MANAGER', 'WAITER']) {
        prisma.user.findUnique.mockResolvedValue(user({ role }));
        await expect(
          service.verifyPosOperatorAccess(RID, 'u-' + role),
        ).resolves.toBeUndefined();
      }
    });

    it('denies STAFF and KITCHEN even when assigned', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({ ownerId: OWNER });
      for (const role of ['STAFF', 'KITCHEN']) {
        prisma.user.findUnique.mockResolvedValue(user({ role }));
        await expect(
          service.verifyPosOperatorAccess(RID, 'u-' + role),
        ).rejects.toThrow(ForbiddenException);
      }
    });

    it('denies a WAITER assigned to a different restaurant', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({ ownerId: OWNER });
      prisma.user.findUnique.mockResolvedValue(
        user({ restaurantId: 'other', role: 'WAITER' }),
      );
      await expect(
        service.verifyPosOperatorAccess(RID, 'intruder'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies the owner when the restaurant is soft-deleted/suspended', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({
        ownerId: OWNER,
        isActive: false,
      });
      prisma.user.findUnique.mockResolvedValue(user({ role: 'WAITER' }));
      await expect(service.verifyPosOperatorAccess(RID, OWNER)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('still allows SUPER_ADMIN when the restaurant is soft-deleted/suspended', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({
        ownerId: OWNER,
        isActive: false,
      });
      prisma.user.findUnique.mockResolvedValue(
        user({ restaurantId: 'other', role: 'SUPER_ADMIN' }),
      );
      await expect(
        service.verifyPosOperatorAccess(RID, 'admin'),
      ).resolves.toBeUndefined();
    });
  });

  describe('verifyRestaurantStaffAccess (any assigned user)', () => {
    it('allows any role assigned to the restaurant, including KITCHEN', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      prisma.user.findUnique.mockResolvedValue(user({ role: 'KITCHEN' }));
      await expect(
        service.verifyRestaurantStaffAccess(RID, 'kitchen-user'),
      ).resolves.toMatchObject({ restaurant: { id: RID } });
    });

    it('denies a user assigned to a different restaurant', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      prisma.user.findUnique.mockResolvedValue(
        user({ restaurantId: 'other', role: 'MANAGER' }),
      );
      await expect(
        service.verifyRestaurantStaffAccess(RID, 'intruder'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies an assigned user when the restaurant is soft-deleted/suspended', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(
        restaurant({ isActive: false }),
      );
      prisma.user.findUnique.mockResolvedValue(user({ role: 'KITCHEN' }));
      await expect(
        service.verifyRestaurantStaffAccess(RID, 'kitchen-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still allows SUPER_ADMIN when the restaurant is soft-deleted/suspended', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(
        restaurant({ isActive: false }),
      );
      prisma.user.findUnique.mockResolvedValue(
        user({ restaurantId: 'other', role: 'SUPER_ADMIN' }),
      );
      await expect(
        service.verifyRestaurantStaffAccess(RID, 'admin'),
      ).resolves.toBeDefined();
    });
  });

  describe('verifyCashPaymentOperatorAccess (cash confirm/cancel — allows STAFF, excludes KITCHEN)', () => {
    it('allows OWNER/MANAGER/WAITER/STAFF assigned to the restaurant', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      for (const role of ['OWNER', 'MANAGER', 'WAITER', 'STAFF']) {
        prisma.user.findUnique.mockResolvedValue(user({ role }));
        await expect(
          service.verifyCashPaymentOperatorAccess(RID, 'u-' + role),
        ).resolves.toBeDefined();
      }
    });

    it('denies KITCHEN even when assigned', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      prisma.user.findUnique.mockResolvedValue(user({ role: 'KITCHEN' }));
      await expect(
        service.verifyCashPaymentOperatorAccess(RID, 'kitchen-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies a user assigned to a different restaurant', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      prisma.user.findUnique.mockResolvedValue(
        user({ restaurantId: 'other', role: 'STAFF' }),
      );
      await expect(
        service.verifyCashPaymentOperatorAccess(RID, 'intruder'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('STAFF/KITCHEN divergence invariant', () => {
    it('STAFF can confirm cash but cannot operate POS sessions', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      prisma.user.findUnique.mockResolvedValue(user({ role: 'STAFF' }));
      await expect(
        service.verifyCashPaymentOperatorAccess(RID, 'staff-user'),
      ).resolves.toBeDefined();
      await expect(
        service.verifyPosOperatorAccess(RID, 'staff-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('KITCHEN is excluded from both cash and POS', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(restaurant());
      prisma.user.findUnique.mockResolvedValue(user({ role: 'KITCHEN' }));
      await expect(
        service.verifyCashPaymentOperatorAccess(RID, 'kitchen-user'),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.verifyPosOperatorAccess(RID, 'kitchen-user'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

describe('PaymentCoreService.computeSessionAmountBalances (M-PAY-5)', () => {
  let prisma: {
    order: { findMany: jest.Mock };
    payment: { findMany: jest.Mock };
  };
  let service: PaymentCoreService;

  beforeEach(() => {
    prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
    };
    service = new PaymentCoreService(
      prisma as unknown as PrismaService,
      {} as Partial<EventsGateway> as EventsGateway,
      {} as Partial<FeatureService> as FeatureService,
    );
  });

  it('short-circuits with no queries for an empty id list', async () => {
    const result = await service.computeSessionAmountBalances(prisma, []);
    expect(result.size).toBe(0);
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
  });

  it('fetches all sessions in exactly two batched queries', async () => {
    await service.computeSessionAmountBalances(prisma, ['s1', 's2', 's3']);
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tableSessionId: { in: ['s1', 's2', 's3'] } },
      }),
    );
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tableSessionId: { in: ['s1', 's2', 's3'] },
          status: 'SUCCEEDED',
        },
      }),
    );
  });

  it('computes bill/paid/remaining per session (paid = amount − tip)', async () => {
    prisma.order.findMany.mockResolvedValue([
      { tableSessionId: 's1', totalPrice: 10 },
      { tableSessionId: 's1', totalPrice: 5 },
      { tableSessionId: 's2', totalPrice: 20 },
    ]);
    prisma.payment.findMany.mockResolvedValue([
      { tableSessionId: 's1', amount: 15, tipAmount: 2, status: 'SUCCEEDED' },
      { tableSessionId: 's2', amount: 8, tipAmount: 0, status: 'SUCCEEDED' },
    ]);

    const result = await service.computeSessionAmountBalances(prisma, [
      's1',
      's2',
      's3',
    ]);

    // s1: bill 15, paid 15−2=13, remaining 2
    expect(result.get('s1')).toEqual({
      billSubtotal: 15,
      paidSubtotal: 13,
      remaining: 2,
    });
    // s2: bill 20, paid 8, remaining 12
    expect(result.get('s2')).toEqual({
      billSubtotal: 20,
      paidSubtotal: 8,
      remaining: 12,
    });
    // s3: no orders/payments → all zero (still present in the map)
    expect(result.get('s3')).toEqual({
      billSubtotal: 0,
      paidSubtotal: 0,
      remaining: 0,
    });
  });

  it('ignores non-succeeded payments even if a mock returns them (defensive re-filter)', async () => {
    prisma.order.findMany.mockResolvedValue([
      { tableSessionId: 's1', totalPrice: 30 },
    ]);
    prisma.payment.findMany.mockResolvedValue([
      { tableSessionId: 's1', amount: 30, tipAmount: 0, status: 'PENDING' },
    ]);

    const result = await service.computeSessionAmountBalances(prisma, ['s1']);
    expect(result.get('s1')).toEqual({
      billSubtotal: 30,
      paidSubtotal: 0,
      remaining: 30,
    });
  });
});

describe('PaymentCoreService payment-gated order release', () => {
  let prisma: any;
  let events: any;
  let service: PaymentCoreService;

  beforeEach(() => {
    prisma = {
      tableSession: { findFirst: jest.fn() },
    };
    events = {
      dispatchPaidOrder: jest.fn().mockResolvedValue(undefined),
    };
    service = new PaymentCoreService(
      prisma as PrismaService,
      events as EventsGateway,
      {} as FeatureService,
    );
  });

  it('atomically releases pending orders when a full payment succeeds', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'session-1', status: 'OPEN' }]),
      tableSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jest.spyOn(service, 'computeSessionBalance').mockResolvedValue({
      billSubtotal: 25,
      paidSubtotal: 0,
      remaining: 25,
      hasLoyaltyDiscount: false,
      items: [],
    });

    const claim = await service.claimSuccessfulPaymentForOpenSession(
      tx,
      {
        id: 'payment-1',
        tableSessionId: 'session-1',
        amount: 25,
        tipAmount: 0,
        status: 'PENDING',
        provider: 'STRIPE',
      },
      { status: 'SUCCEEDED' },
    );

    expect(tx.order.findMany).toHaveBeenCalledWith({
      where: {
        tableSessionId: 'session-1',
        status: 'PENDING_PAYMENT',
      },
      select: { id: true },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['order-1'] },
        status: 'PENDING_PAYMENT',
      },
      data: { status: 'NEW' },
    });
    expect(claim).toEqual({
      claimed: true,
      sessionPaid: true,
      releasedOrderIds: ['order-1'],
    });
  });

  it('does not release orders when a captured payment only partially pays the bill', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'session-1', status: 'OPEN' }]),
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jest
      .spyOn(service, 'computeSessionBalance')
      .mockResolvedValueOnce({
        billSubtotal: 25,
        paidSubtotal: 0,
        remaining: 25,
        hasLoyaltyDiscount: false,
        items: [],
      })
      .mockResolvedValueOnce({
        billSubtotal: 25,
        paidSubtotal: 10,
        remaining: 15,
        hasLoyaltyDiscount: false,
        items: [],
      });

    const claim = await service.claimSuccessfulPaymentForOpenSession(
      tx,
      {
        id: 'payment-1',
        tableSessionId: 'session-1',
        amount: 10,
        tipAmount: 0,
        status: 'PENDING',
        provider: 'STRIPE',
      },
      { status: 'SUCCEEDED' },
    );

    expect(claim).toMatchObject({
      claimed: true,
      sessionPaid: false,
      partial: true,
    });
    expect(tx.order.findMany).not.toHaveBeenCalled();
    expect(tx.order.updateMany).not.toHaveBeenCalled();
  });

  it.each(['PAID', 'CLOSED_PAID', 'CLOSED_NO_PAYMENT'])(
    'records a captured full payment for reconciliation when the session is %s',
    async (sessionStatus) => {
      const tx = {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ id: 'session-1', status: sessionStatus }]),
        payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
        paymentReconciliationIssue: {
          upsert: jest.fn().mockResolvedValue({ id: 'issue-1' }),
        },
        order: {
          findMany: jest.fn(),
          updateMany: jest.fn(),
        },
      };

      const claim = await service.claimSuccessfulPaymentForOpenSession(
        tx,
        {
          id: 'payment-1',
          tableSessionId: 'session-1',
          restaurantId: 'restaurant-1',
          amount: 25,
          tipAmount: 0,
          currency: 'EUR',
          status: 'ABANDONED',
          provider: 'EPAY',
          providerReference: 'invoice-1',
        },
        { status: 'SUCCEEDED', providerStatus: 'PAID' },
      );

      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'payment-1',
          status: { in: ['PENDING', 'ABANDONED'] },
        },
        data: {
          status: 'SUCCEEDED',
          providerStatus: 'SESSION_NOT_OPEN_NEEDS_RECONCILIATION',
        },
      });
      expect(tx.paymentReconciliationIssue.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { paymentId: 'payment-1' },
          create: expect.objectContaining({
            paymentId: 'payment-1',
            restaurantId: 'restaurant-1',
            tableSessionId: 'session-1',
            reason: 'SESSION_NOT_OPEN',
            status: 'OPEN',
          }),
        }),
      );
      expect(claim).toEqual({
        claimed: true,
        sessionPaid: false,
        needsReconciliation: true,
        reconciliationReason: 'SESSION_NOT_OPEN',
      });
      expect(tx.order.findMany).not.toHaveBeenCalled();
    },
  );

  it('records a captured scoped payment for reconciliation when the session is closed', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'session-1', status: 'CLOSED_PAID' }]),
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      paymentReconciliationIssue: {
        upsert: jest.fn().mockResolvedValue({ id: 'issue-1' }),
      },
      orderItem: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    const claim = await service.claimSuccessfulScopedCheckoutPayment(
      tx,
      {
        id: 'payment-1',
        tableSessionId: 'session-1',
        restaurantId: 'restaurant-1',
        amount: 25,
        tipAmount: 0,
        currency: 'EUR',
        status: 'PENDING',
        provider: 'STRIPE',
        stripePaymentIntentId: 'pi_1',
      },
      { status: 'SUCCEEDED' },
      {
        kind: 'ORDER_ITEMS',
        orderIds: ['order-1'],
        chargeSubtotal: 25,
        allocations: [
          {
            orderItemId: 'item-1',
            quantity: 1,
            amount: 25,
            snapshotPaid: 0,
          },
        ],
      },
    );

    expect(claim).toEqual({
      claimed: true,
      sessionPaid: false,
      needsReconciliation: true,
      reconciliationReason: 'SESSION_NOT_OPEN',
    });
    expect(tx.orderItem.findMany).not.toHaveBeenCalled();
    expect(tx.orderItem.updateMany).not.toHaveBeenCalled();
  });

  it('releases pending orders when a scoped checkout pays the final balance', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'session-1', status: 'OPEN' }]),
      tableSession: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      orderItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'item-1', paidQuantity: 0 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      paymentAllocation: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jest.spyOn(service, 'computeSessionBalance').mockResolvedValue({
      billSubtotal: 25,
      paidSubtotal: 25,
      remaining: 0,
      hasLoyaltyDiscount: false,
      items: [],
    });

    const claim = await service.claimSuccessfulScopedCheckoutPayment(
      tx,
      {
        id: 'payment-1',
        tableSessionId: 'session-1',
        amount: 25,
        tipAmount: 0,
        status: 'PENDING',
        provider: 'STRIPE',
      },
      { status: 'SUCCEEDED' },
      {
        kind: 'ORDER_ITEMS',
        orderIds: ['order-1'],
        chargeSubtotal: 25,
        allocations: [
          {
            orderItemId: 'item-1',
            quantity: 1,
            amount: 25,
            snapshotPaid: 0,
          },
        ],
      },
    );

    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['order-1'] },
        status: 'PENDING_PAYMENT',
      },
      data: { status: 'NEW' },
    });
    expect(claim).toMatchObject({
      claimed: true,
      sessionPaid: true,
      releasedOrderIds: ['order-1'],
    });
  });

  it('releases the paid scoped order while unrelated session balance remains', async () => {
    const tx = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'session-1', status: 'OPEN' }]),
      tableSession: { updateMany: jest.fn() },
      orderItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'item-1', paidQuantity: 0 }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      paymentAllocation: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([{ id: 'order-1' }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    jest.spyOn(service, 'computeSessionBalance').mockResolvedValue({
      billSubtotal: 40,
      paidSubtotal: 25,
      remaining: 15,
      hasLoyaltyDiscount: false,
      items: [],
    });

    const claim = await service.claimSuccessfulScopedCheckoutPayment(
      tx,
      {
        id: 'payment-1',
        tableSessionId: 'session-1',
        amount: 25,
        tipAmount: 0,
        status: 'PENDING',
        provider: 'STRIPE',
      },
      { status: 'SUCCEEDED' },
      {
        kind: 'ORDER_ITEMS',
        orderIds: ['order-1'],
        chargeSubtotal: 25,
        allocations: [
          {
            orderItemId: 'item-1',
            quantity: 1,
            amount: 25,
            snapshotPaid: 0,
          },
        ],
      },
    );

    expect(tx.tableSession.updateMany).not.toHaveBeenCalled();
    expect(tx.order.findMany).toHaveBeenCalledWith({
      where: {
        tableSessionId: 'session-1',
        status: 'PENDING_PAYMENT',
        id: { in: ['order-1'] },
      },
      select: { id: true },
    });
    expect(claim).toMatchObject({
      claimed: true,
      sessionPaid: false,
      releasedOrderIds: ['order-1'],
      remaining: 15,
    });
  });

  it('dispatches each released order after the payment transaction commits', async () => {
    jest.spyOn(service, 'emitPaymentConfirmed').mockResolvedValue(undefined);
    const payment = {
      id: 'payment-1',
      restaurantId: 'restaurant-1',
      tableSessionId: 'session-1',
    };

    await service.emitPaymentClaimEvents(payment, {
      claimed: true,
      sessionPaid: true,
      releasedOrderIds: ['order-1', 'order-2'],
    });

    expect(events.dispatchPaidOrder).toHaveBeenCalledTimes(2);
    expect(events.dispatchPaidOrder).toHaveBeenNthCalledWith(
      1,
      'restaurant-1',
      'order-1',
    );
    expect(events.dispatchPaidOrder).toHaveBeenNthCalledWith(
      2,
      'restaurant-1',
      'order-2',
    );
    expect(service.emitPaymentConfirmed).toHaveBeenCalledWith(payment);
  });
});
