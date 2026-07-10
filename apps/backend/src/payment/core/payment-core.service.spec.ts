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
