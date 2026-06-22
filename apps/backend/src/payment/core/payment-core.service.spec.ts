import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentCoreService } from './payment-core.service';

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
      prisma as any,
      {} as any, // EventsGateway — unused by access checks
      {} as any, // FeatureService — unused by access checks
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
