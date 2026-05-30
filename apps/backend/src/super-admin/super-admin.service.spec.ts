import { Test, TestingModule } from '@nestjs/testing';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuImportService } from '../menu-import/menu-import.service';

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
    },
    order: {
      count: jest.fn(),
    },
    payment: {
      aggregate: jest.fn(),
    },
    adminAuditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const mockMenuImport = {
    upsertMenu: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuperAdminService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MenuImportService, useValue: mockMenuImport },
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
      mockPrisma.user.count
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(3);
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
        _sum: { amount: '123.45' as any },
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
          id: 'r1', name: 'Free', tier: 'FREE', forceTier: 'ENTERPRISE',
          owner: { email: 'owner@test.com' },
        },
      ]);
      // paymentsNotOnboarded (take:5)
      mockPrisma.restaurant.findMany.mockResolvedValueOnce([
        {
          id: 'r1', name: 'Free', tier: 'FREE', forceTier: 'ENTERPRISE',
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
      const updated = { id: '1', name: 'Test', tier: 'FREE', forceTier: 'PROFESSIONAL' };
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1', tier: 'FREE', forceTier: null,
      });
      mockPrisma.$transaction.mockResolvedValueOnce([updated, {}]);

      const result = await service.updateTier('1', 'PROFESSIONAL', ACTOR_ID);

      expect(result.forceTier).toBe('PROFESSIONAL');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws NotFoundException for missing restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce(null);

      await expect(service.updateTier('nonexistent', 'FREE', ACTOR_ID)).rejects.toThrow();
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
  });

  describe('updatePaymentsEnabled', () => {
    const PROFESSIONAL_RESTAURANT = { id: '1', paymentsEnabled: false, tier: 'PROFESSIONAL', forceTier: null };
    const FREE_RESTAURANT = { id: '2', paymentsEnabled: false, tier: 'FREE', forceTier: null };

    it('allows enabling on PROFESSIONAL tier', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce(PROFESSIONAL_RESTAURANT);
      mockPrisma.$transaction.mockResolvedValueOnce([{ id: '1', name: 'Test', paymentsEnabled: true }, {}]);

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
      mockPrisma.$transaction.mockResolvedValueOnce([{ id: '2', name: 'Test', paymentsEnabled: false }, {}]);

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
        id: '1', name: 'Test', tier: 'FREE', forceTier: null, isActive: true,
        tierUpdatedAt: null, createdAt: new Date(), timezone: 'UTC',
        targetLanguages: [], paymentsEnabled: false, stripeOnboarded: false,
        owner: { id: 'u1', email: 'o@test.com', name: 'Owner', createdAt: new Date() },
        _count: { menuCategories: 3, orders: 10, tables: 5 },
      });
      mockPrisma.payment.aggregate.mockResolvedValueOnce({
        _sum: { amount: '123.456' as any },
        _count: 4,
      });

      const result = await service.getTenantById('1');

      expect(typeof result.paymentSummary.totalAmount).toBe('number');
      expect(result.paymentSummary.totalAmount).toBeCloseTo(123.456);
    });

    it('handles null payment amount as 0', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: '1', name: 'Test', tier: 'FREE', forceTier: null, isActive: true,
        tierUpdatedAt: null, createdAt: new Date(), timezone: 'UTC',
        targetLanguages: [], paymentsEnabled: false, stripeOnboarded: false,
        owner: { id: 'u1', email: 'o@test.com', name: 'Owner', createdAt: new Date() },
        _count: { menuCategories: 0, orders: 0, tables: 0 },
      });
      mockPrisma.payment.aggregate.mockResolvedValueOnce({
        _sum: { amount: null },
        _count: 0,
      });

      const result = await service.getTenantById('1');

      expect(result.paymentSummary.totalAmount).toBe(0);
    });
  });
});
