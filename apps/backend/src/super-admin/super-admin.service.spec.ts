import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuImportService } from '../menu-import/menu-import.service';
import { ImportMenuDto } from '../menu-import/dto/import-menu.dto';
import { EventsGateway } from '../events/events.gateway';

const ACTOR_ID = 'actor-user-id';

describe('SuperAdminService', () => {
  let service: SuperAdminService;

  const mockPrisma = {
    restaurant: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      count: jest.fn(),
      groupBy: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    order: {
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    tableSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      aggregate: jest.fn(),
    },
    adminAuditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const mockMenuImport = {
    upsertMenu: jest.fn(),
  };
  const mockEvents = {
    evictUser: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MenuImportService, useValue: mockMenuImport },
        { provide: EventsGateway, useValue: mockEvents },
      ],
    }).compile();

    service = module.get<SuperAdminService>(SuperAdminService);
  });

  describe('getStats', () => {
    it('returns platform stats using aggregate queries', async () => {
      // 7 + 4 count calls: total, active, deleted, suspended, paidPlan, stripeLinked, recent7d, paymentsNotOnboardedCount, emptyMenuCount, noTableCount, inactiveCount
      mockPrisma.restaurant.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(1);
      mockPrisma.user.count.mockResolvedValueOnce(50).mockResolvedValueOnce(3);
      mockPrisma.restaurant.groupBy.mockResolvedValueOnce([
        { tier: 'FREE', _count: { _all: 5 } },
        { tier: 'STARTER', _count: { _all: 3 } },
        { tier: 'PROFESSIONAL', _count: { _all: 1 } },
        { tier: 'ENTERPRISE', _count: { _all: 1 } },
      ]);
      mockPrisma.user.groupBy.mockResolvedValueOnce([
        { role: 'OWNER', _count: { _all: 10 } },
        { role: 'CUSTOMER', _count: { _all: 20 } },
      ]);
      mockPrisma.order.count
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(50);
      mockPrisma.payment.aggregate.mockResolvedValueOnce({
        _sum: { amount: '123.45' as unknown as number },
        _count: 6,
      });
      // allTiers query (lightweight: tier + forceTier only)
      mockPrisma.restaurant.findMany.mockResolvedValueOnce([
        { tier: 'FREE', forceTier: 'ENTERPRISE' },
        { tier: 'STARTER', forceTier: null },
      ]);
      // forcedTierList query
      mockPrisma.restaurant.findMany.mockResolvedValueOnce([
        {
          id: 'r1',
          name: 'Free',
          tier: 'FREE',
          forceTier: 'ENTERPRISE',
          owner: { email: 'owner@test.com' },
        },
      ]);
      // paymentsNotOnboarded (take:5)
      mockPrisma.restaurant.findMany.mockResolvedValueOnce([
        {
          id: 'r1',
          name: 'Free',
          tier: 'FREE',
          forceTier: 'ENTERPRISE',
          owner: { email: 'owner@test.com' },
        },
      ]);
      // emptyMenuList (take:5)
      mockPrisma.restaurant.findMany.mockResolvedValueOnce([
        { id: 'r1', name: 'Free', owner: { email: 'owner@test.com' } },
      ]);
      // noTableList (take:5)
      mockPrisma.restaurant.findMany.mockResolvedValueOnce([
        { id: 'r1', name: 'Free', owner: { email: 'owner@test.com' } },
      ]);
      // inactiveList (take:5)
      mockPrisma.restaurant.findMany.mockResolvedValueOnce([
        { id: 'r2', name: 'Starter', owner: { email: 'starter@test.com' } },
      ]);

      const result = await service.getStats();

      expect(result.totalRestaurants).toBe(10);
      expect(result.activeRestaurants).toBe(9);
      expect(result.deletedRestaurants).toBe(1);
      expect(result.totalUsers).toBe(50);
      expect(result.paidPlanTenants).toBe(4);
      expect(result.stripeLinkedSubscriptions).toBe(3);
      expect(result.suspendedCount).toBe(2);
      expect(result.byBillingTier.FREE).toBe(5);
      expect(result.byBillingTier.STARTER).toBe(3);
      expect(result.byEffectiveTier.FREE).toBe(0);
      expect(result.byEffectiveTier.ENTERPRISE).toBe(1);
      expect(result.forcedOverrideCount).toBe(1);
      expect(result.forcedUpgrades).toBe(1);
      expect(result.attentionNeeded.paymentsNotOnboarded.count).toBe(1);
      expect(result.recent.orders7d).toBe(50);
      expect(result.recent.payments7d.amount).toBeCloseTo(123.45);
    });
  });

  describe('updateTier', () => {
    it('sets forceTier and writes audit log in transaction', async () => {
      const updated = {
        id: '1',
        name: 'Test',
        tier: 'FREE',
        forceTier: 'PROFESSIONAL',
      };
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        tier: 'FREE',
        forceTier: null,
      });
      mockPrisma.$transaction.mockResolvedValueOnce([updated, {}]);

      const result = await service.updateTier('1', 'PROFESSIONAL', ACTOR_ID);

      expect(result.forceTier).toBe('PROFESSIONAL');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws NotFoundException for missing restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.updateTier('nonexistent', 'FREE', ACTOR_ID),
      ).rejects.toThrow();
    });

    it('sets forceTierExpiresAt when expiry days provided (M-2)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        tier: 'FREE',
        forceTier: null,
      });
      mockPrisma.$transaction.mockResolvedValueOnce([{}, {}]);

      const before = Date.now();
      await service.updateTier('1', 'PROFESSIONAL', ACTOR_ID, 30);
      const after = Date.now();

      // First op in the transaction is restaurant.update — assert it carries an
      // expiry ~30 days out.
      const updateArg = mockPrisma.restaurant.update.mock.calls[0][0];
      const expiry: Date = updateArg.data.forceTierExpiresAt;
      expect(expiry).toBeInstanceOf(Date);
      const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
      expect(expiry.getTime()).toBeGreaterThanOrEqual(before + THIRTY_DAYS);
      expect(expiry.getTime()).toBeLessThanOrEqual(after + THIRTY_DAYS);
    });

    it('clears forceTierExpiresAt when override is cleared (M-2)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        tier: 'FREE',
        forceTier: 'PROFESSIONAL',
      });
      mockPrisma.$transaction.mockResolvedValueOnce([{}, {}]);

      // forceTier=null even with days supplied → no expiry (nothing to expire).
      await service.updateTier('1', null, ACTOR_ID, 30);

      const updateArg = mockPrisma.restaurant.update.mock.calls[0][0];
      expect(updateArg.data.forceTier).toBeNull();
      expect(updateArg.data.forceTierExpiresAt).toBeNull();
    });
  });

  describe('getTenants', () => {
    it('ignores invalid tier in query', async () => {
      mockPrisma.restaurant.findMany.mockResolvedValueOnce([]);
      mockPrisma.restaurant.count.mockResolvedValueOnce(0);

      await service.getTenants({ tier: 'INVALID' });

      const call = mockPrisma.restaurant.findMany.mock.calls[0][0];
      expect(call.where.tier).toBeUndefined();
    });

    it('clamps NaN page and limit to safe defaults', async () => {
      mockPrisma.restaurant.findMany.mockResolvedValueOnce([]);
      mockPrisma.restaurant.count.mockResolvedValueOnce(0);

      await service.getTenants({
        page: NaN as unknown as number,
        limit: NaN as unknown as number,
      });

      const call = mockPrisma.restaurant.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0); // page 1 → skip 0
      expect(call.take).toBe(20); // default limit
    });
  });

  describe('updatePaymentsEnabled', () => {
    const PROFESSIONAL_RESTAURANT = {
      id: '1',
      paymentsEnabled: false,
      tier: 'PROFESSIONAL',
      forceTier: null,
    };
    const FREE_RESTAURANT = {
      id: '2',
      paymentsEnabled: false,
      tier: 'FREE',
      forceTier: null,
    };

    it('allows enabling on PROFESSIONAL tier', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce(
        PROFESSIONAL_RESTAURANT,
      );
      mockPrisma.$transaction.mockResolvedValueOnce([
        { id: '1', name: 'Test', paymentsEnabled: true },
        {},
      ]);

      const result = await service.updatePaymentsEnabled('1', true, ACTOR_ID);

      expect(result.paymentsEnabled).toBe(true);
    });

    it('throws TIER_RESTRICTED when enabling on FREE tier', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce(FREE_RESTAURANT);

      await expect(
        service.updatePaymentsEnabled('2', true, ACTOR_ID),
      ).rejects.toThrow('Payments require PROFESSIONAL or ENTERPRISE');
    });

    it('allows disabling on FREE tier', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        ...FREE_RESTAURANT,
        paymentsEnabled: true,
      });
      mockPrisma.$transaction.mockResolvedValueOnce([
        { id: '2', name: 'Test', paymentsEnabled: false },
        {},
      ]);

      const result = await service.updatePaymentsEnabled('2', false, ACTOR_ID);

      expect(result.paymentsEnabled).toBe(false);
    });

    it('skips transaction when paymentsEnabled unchanged', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        ...PROFESSIONAL_RESTAURANT,
        paymentsEnabled: true,
      });

      const result = await service.updatePaymentsEnabled('1', true, ACTOR_ID);

      expect(result.paymentsEnabled).toBe(true);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getTenantById', () => {
    it('coerces Decimal payment amount to Number', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        name: 'Test',
        tier: 'FREE',
        forceTier: null,
        forceTierExpiresAt: null,
        isActive: true,
        tierUpdatedAt: null,
        createdAt: new Date(),
        timezone: 'Europe/Sofia',
        targetLanguages: [],
        paymentsEnabled: false,
        stripeOnboarded: false,
        stripeSubscriptionId: null,
        owner: {
          id: 'u1',
          email: 'o@test.com',
          name: 'Owner',
          createdAt: new Date(),
        },
        _count: { menuCategories: 3, orders: 10, tables: 5 },
      });
      mockPrisma.payment.aggregate.mockResolvedValueOnce({
        _sum: { amount: '123.456' as unknown as number },
        _count: 4,
      });

      const result = await service.getTenantById('1');

      expect(typeof result.paymentSummary.totalAmount).toBe('number');
      expect(result.paymentSummary.totalAmount).toBeCloseTo(123.456);
    });

    it('handles null payment amount as 0', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        name: 'Test',
        tier: 'FREE',
        forceTier: null,
        forceTierExpiresAt: null,
        isActive: true,
        tierUpdatedAt: null,
        createdAt: new Date(),
        timezone: 'Europe/Sofia',
        targetLanguages: [],
        paymentsEnabled: false,
        stripeOnboarded: false,
        stripeSubscriptionId: null,
        owner: {
          id: 'u1',
          email: 'o@test.com',
          name: 'Owner',
          createdAt: new Date(),
        },
        _count: { menuCategories: 0, orders: 0, tables: 0 },
      });
      mockPrisma.payment.aggregate.mockResolvedValueOnce({
        _sum: { amount: null },
        _count: 0,
      });

      const result = await service.getTenantById('1');

      expect(result.paymentSummary.totalAmount).toBe(0);
    });

    it('does not leak the raw _count object and forwards forceTierExpiresAt', async () => {
      const expiresAt = new Date('2026-12-31');
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        name: 'Test',
        tier: 'FREE',
        forceTier: 'PROFESSIONAL',
        forceTierExpiresAt: expiresAt,
        isActive: true,
        tierUpdatedAt: null,
        createdAt: new Date(),
        timezone: 'Europe/Sofia',
        targetLanguages: [],
        paymentsEnabled: false,
        stripeOnboarded: false,
        stripeSubscriptionId: 'sub_test123',
        owner: {
          id: 'u1',
          email: 'o@test.com',
          name: 'Owner',
          createdAt: new Date(),
        },
        _count: { menuCategories: 2, orders: 7, tables: 3 },
      });
      mockPrisma.payment.aggregate.mockResolvedValueOnce({
        _sum: { amount: null },
        _count: 0,
      });

      const result = (await service.getTenantById('1')) as Record<
        string,
        unknown
      >;

      expect(result._count).toBeUndefined();
      expect(result.orderCount).toBe(7);
      expect(result.tableCount).toBe(3);
      expect(result.menuCategoryCount).toBe(2);
      expect(result.forceTierExpiresAt).toBe(expiresAt);
      expect(result.stripeSubscriptionId).toBe('sub_test123');
    });
  });

  describe('updateStatus', () => {
    it('suspends a tenant and writes a SUSPEND audit log', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        isActive: true,
        ownerId: 'owner-1',
      });
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'owner-1' },
        { id: 'staff-1' },
      ]);
      mockPrisma.$transaction.mockResolvedValueOnce([
        { id: '1', name: 'Test', isActive: false },
        {},
      ]);

      const result = await service.updateStatus('1', false, ACTOR_ID);

      expect(result.isActive).toBe(false);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockEvents.evictUser).toHaveBeenCalledWith(
        'owner-1',
        'restaurant_suspended',
      );
      expect(mockEvents.evictUser).toHaveBeenCalledWith(
        'staff-1',
        'restaurant_suspended',
      );
    });

    it('throws NotFoundException for a missing restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updateStatus('missing', false, ACTOR_ID),
      ).rejects.toThrow();
    });
  });

  describe('resetOwnerPassword', () => {
    it('hashes the password, stamps passwordChangedAt, and audits', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        ownerId: 'owner-1',
        name: 'Test',
      });
      mockPrisma.$transaction.mockResolvedValueOnce([{}, {}]);

      const result = await service.resetOwnerPassword(
        '1',
        'NewPass123',
        ACTOR_ID,
      );

      expect(result).toEqual({ success: true });
      const userUpdate = mockPrisma.user.update.mock.calls[0][0];
      expect(userUpdate.data.passwordChangedAt).toBeInstanceOf(Date);
      expect(userUpdate.data.password).not.toBe('NewPass123');
    });

    it('throws NotFoundException for a missing restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.resetOwnerPassword('missing', 'NewPass123', ACTOR_ID),
      ).rejects.toThrow();
    });
  });

  describe('deleteRestaurant', () => {
    it('soft-deletes an active restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        name: 'Test',
        deletedAt: null,
      });
      mockPrisma.$transaction.mockResolvedValueOnce([
        { id: '1', name: 'Test', deletedAt: new Date(), isActive: false },
        {},
      ]);

      const result = await service.deleteRestaurant('1', ACTOR_ID);

      expect(result.deletedAt).toBeInstanceOf(Date);
    });

    it('throws ALREADY_DELETED when the restaurant is already soft-deleted', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        name: 'Test',
        deletedAt: new Date(),
      });
      await expect(service.deleteRestaurant('1', ACTOR_ID)).rejects.toThrow(
        'Restaurant already deleted',
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('importMenu', () => {
    it('runs registered image cleanup only after the admin import transaction commits', async () => {
      const dto: ImportMenuDto = {
        categories: [{ name: 'Mains', items: [] }],
      };
      const cleanup = jest.fn().mockResolvedValue(undefined);
      const tx = {
        restaurant: {
          findUnique: jest.fn().mockResolvedValue({ id: 'rest-1' }),
        },
        adminAuditLog: {
          create: jest.fn().mockResolvedValue({}),
        },
      };
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );
      mockMenuImport.upsertMenu.mockImplementation(
        async (
          _restaurantId: string,
          _dto: ImportMenuDto,
          _tx: typeof tx,
          postCommitCleanup: Array<() => Promise<void>>,
        ) => {
          postCommitCleanup.push(cleanup);
          expect(cleanup).not.toHaveBeenCalled();
          return { success: true, created: 0, updated: 1, categories: 0 };
        },
      );

      const result = await service.importMenu('rest-1', dto, ACTOR_ID);

      expect(result).toEqual({
        success: true,
        created: 0,
        updated: 1,
        categories: 0,
      });
      expect(mockMenuImport.upsertMenu).toHaveBeenCalledWith(
        'rest-1',
        dto,
        tx,
        expect.any(Array),
      );
      expect(tx.adminAuditLog.create).toHaveBeenCalled();
      expect(cleanup).toHaveBeenCalledTimes(1);
    });

    it('does not run registered image cleanup when the admin import transaction rolls back', async () => {
      const dto: ImportMenuDto = {
        categories: [{ name: 'Mains', items: [] }],
      };
      const cleanup = jest.fn().mockResolvedValue(undefined);
      const tx = {
        restaurant: {
          findUnique: jest.fn().mockResolvedValue({ id: 'rest-1' }),
        },
        adminAuditLog: {
          create: jest.fn().mockRejectedValue(new Error('audit failed')),
        },
      };
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );
      mockMenuImport.upsertMenu.mockImplementation(
        async (
          _restaurantId: string,
          _dto: ImportMenuDto,
          _tx: typeof tx,
          postCommitCleanup: Array<() => Promise<void>>,
        ) => {
          postCommitCleanup.push(cleanup);
          return { success: true, created: 0, updated: 1, categories: 0 };
        },
      );

      await expect(service.importMenu('rest-1', dto, ACTOR_ID)).rejects.toThrow(
        'audit failed',
      );

      expect(cleanup).not.toHaveBeenCalled();
    });
  });

  describe('restoreRestaurant', () => {
    it('restores a soft-deleted restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        name: 'Test',
        deletedAt: new Date(),
      });
      mockPrisma.$transaction.mockResolvedValueOnce([
        { id: '1', name: 'Test', deletedAt: null, isActive: true },
        {},
      ]);

      const result = await service.restoreRestaurant('1', ACTOR_ID);

      expect(result.deletedAt).toBeNull();
    });

    it('throws NOT_DELETED when the restaurant is not deleted', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1',
        name: 'Test',
        deletedAt: null,
      });
      await expect(service.restoreRestaurant('1', ACTOR_ID)).rejects.toThrow(
        'Restaurant is not deleted',
      );
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('deleteStaff', () => {
    it('deletes a WAITER scoped to the restaurant and audits', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 's1',
        email: 'w@test.local',
        role: 'WAITER',
        restaurantId: 'r1',
      });
      mockPrisma.$transaction.mockResolvedValueOnce([{}, {}]);

      const result = await service.deleteStaff('r1', 's1', ACTOR_ID);

      expect(result).toEqual({ success: true });
    });

    it('throws USER_NOT_FOUND for a missing user', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.deleteStaff('r1', 'missing', ACTOR_ID),
      ).rejects.toThrow('User not found');
    });

    it('throws NOT_STAFF when the user belongs to another restaurant', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 's1',
        email: 'w@test.local',
        role: 'WAITER',
        restaurantId: 'other',
      });
      await expect(service.deleteStaff('r1', 's1', ACTOR_ID)).rejects.toThrow(
        'User is not staff of this restaurant',
      );
    });

    it('refuses to delete an OWNER even when scoped to the restaurant', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'owner',
        email: 'o@test.com',
        role: 'OWNER',
        restaurantId: 'r1',
      });
      await expect(
        service.deleteStaff('r1', 'owner', ACTOR_ID),
      ).rejects.toThrow('Cannot delete an OWNER or SUPER_ADMIN');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('nulls staffUserId and customerId on orders before deletion (Issue 22+D-1)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 's1',
        email: 'w@test.local',
        role: 'WAITER',
        restaurantId: 'r1',
      });
      mockPrisma.$transaction.mockResolvedValueOnce([{}, {}, {}]);

      await service.deleteStaff('r1', 's1', ACTOR_ID);

      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith({
        where: { staffUserId: 's1' },
        data: { staffUserId: null },
      });
      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith({
        where: { customerId: 's1' },
        data: { customerId: null },
      });
      // Verify updateMany is inside the $transaction array, not called standalone
      const txArgs = mockPrisma.$transaction.mock.calls[
        mockPrisma.$transaction.mock.calls.length - 1
      ][0] as unknown[];
      expect(Array.isArray(txArgs)).toBe(true);
      expect(txArgs).toHaveLength(4);
    });
  });

  describe('forceCloseSession', () => {
    const runForceCloseTransaction = () => {
      mockPrisma.$transaction.mockImplementationOnce(
        async (fn: (tx: typeof mockPrisma) => Promise<unknown>) =>
          fn(mockPrisma),
      );
    };

    const mockLockedSession = (
      session: {
        id: string;
        token: string;
        restaurantId: string;
        status: string;
      } | null,
    ) => {
      runForceCloseTransaction();
      mockPrisma.order.count.mockResolvedValue(0);
      mockPrisma.$queryRaw.mockResolvedValueOnce(session ? [session] : []);
    };

    it('closes an OPEN session as CLOSED_NO_PAYMENT', async () => {
      mockLockedSession({
        id: 's1',
        token: 'tok1',
        restaurantId: 'r1',
        status: 'OPEN',
      });
      mockPrisma.tableSession.update.mockResolvedValueOnce({
        id: 's1',
        status: 'CLOSED_NO_PAYMENT',
      });

      const result = await service.forceCloseSession('r1', 's1', ACTOR_ID);

      expect(result).toEqual({ id: 's1', status: 'CLOSED_NO_PAYMENT' });
      expect(
        (mockPrisma.$queryRaw.mock.calls[0][0] as { sql: string }).sql,
      ).toContain('FOR UPDATE');
      expect(mockPrisma.tableSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1' },
          data: { status: 'CLOSED_NO_PAYMENT' },
        }),
      );
    });

    it('rejects force-close when an order is added before the session lock is acquired', async () => {
      mockLockedSession({
        id: 's1',
        token: 'tok1',
        restaurantId: 'r1',
        status: 'OPEN',
      });
      mockPrisma.order.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

      await expect(
        service.forceCloseSession('r1', 's1', ACTOR_ID),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
      expect(mockPrisma.adminAuditLog.create).not.toHaveBeenCalled();
    });

    it('closes a PAID session as CLOSED_PAID (preserves payment record)', async () => {
      mockLockedSession({
        id: 's1',
        token: 'tok1',
        restaurantId: 'r1',
        status: 'PAID',
      });
      mockPrisma.tableSession.update.mockResolvedValueOnce({
        id: 's1',
        status: 'CLOSED_PAID',
      });

      const result = await service.forceCloseSession('r1', 's1', ACTOR_ID);

      expect(result).toEqual({ id: 's1', status: 'CLOSED_PAID' });
      expect(mockPrisma.tableSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1' },
          data: { status: 'CLOSED_PAID' },
        }),
      );
    });

    it('rejects an already-closed CLOSED_PAID session', async () => {
      mockLockedSession({
        id: 's1',
        token: 'tok1',
        restaurantId: 'r1',
        status: 'CLOSED_PAID',
      });

      await expect(
        service.forceCloseSession('r1', 's1', ACTOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
    });

    it('rejects an already-closed CLOSED_NO_PAYMENT session', async () => {
      mockLockedSession({
        id: 's1',
        token: 'tok1',
        restaurantId: 'r1',
        status: 'CLOSED_NO_PAYMENT',
      });

      await expect(
        service.forceCloseSession('r1', 's1', ACTOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
    });

    it('writes an audit log entry inside the same transaction', async () => {
      mockLockedSession({
        id: 's1',
        token: 'tok1',
        restaurantId: 'r1',
        status: 'OPEN',
      });
      mockPrisma.tableSession.update.mockResolvedValueOnce({
        id: 's1',
        status: 'CLOSED_NO_PAYMENT',
      });

      await service.forceCloseSession('r1', 's1', ACTOR_ID);

      expect(mockPrisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorUserId: ACTOR_ID,
            action: 'FORCE_CLOSE_SESSION',
            targetType: 'TABLE_SESSION',
            targetId: 's1',
          }),
        }),
      );
    });

    it('throws NotFoundException if the session does not exist', async () => {
      mockLockedSession(null);
      await expect(
        service.forceCloseSession('r1', 's1', ACTOR_ID),
      ).rejects.toThrow();
      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException if the session belongs to a different restaurant', async () => {
      mockLockedSession({
        id: 's1',
        token: 'tok1',
        restaurantId: 'other-r1',
        status: 'OPEN',
      });
      await expect(
        service.forceCloseSession('r1', 's1', ACTOR_ID),
      ).rejects.toThrow();
      expect(mockPrisma.tableSession.update).not.toHaveBeenCalled();
    });
  });
});
