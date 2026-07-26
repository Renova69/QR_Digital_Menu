import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';

const mockTx = {
  loyaltyAccount: {
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
  },
  loyaltyPointLedger: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
  $executeRaw: jest.fn().mockResolvedValue(0),
};

const mockTransaction = jest.fn(
  async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
);

const mockPrisma = {
  $transaction: mockTransaction,
  restaurant: { findFirst: jest.fn(), findUnique: jest.fn() },
  loyaltyAccount: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  loyaltyPointLedger: { findMany: jest.fn() },
  order: { findMany: jest.fn(), groupBy: jest.fn(), aggregate: jest.fn() },
};

const mockFeatureService = {
  canAccess: jest.fn().mockResolvedValue(true),
  getEffectiveTier: jest.fn().mockReturnValue('PROFESSIONAL'),
  hasFeature: jest.fn().mockReturnValue(true),
};

describe('LoyaltyService', () => {
  let service: LoyaltyService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FeatureService, useValue: mockFeatureService },
      ],
    }).compile();
    service = module.get(LoyaltyService);
  });

  // ─── Issue 12: getAnalytics must be read-only ───────────────────────────────

  describe('getAnalytics (Issue 12)', () => {
    const restaurant = {
      id: 'r1',
      tier: 'STARTER',
      forceTier: null,
      isActive: true,
      loyaltyExpiryDays: 365,
      loyaltyExchangeRate: 10,
      loyaltyRedeemRate: 150,
      isLoyaltyEnabled: true,
    };

    it('reads accounts without opening a write transaction', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(restaurant);
      mockPrisma.loyaltyAccount.aggregate.mockResolvedValue({
        _count: { _all: 2 },
        _sum: { points: 300 },
      });
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { pointsRedeemed: 0 },
      });
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.loyaltyAccount.findFirst.mockResolvedValue(null);

      const result = await service.getAnalytics('r1', 'owner1');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      // #M10: aggregates in the DB, never loading all accounts into memory.
      expect(mockPrisma.loyaltyAccount.aggregate).toHaveBeenCalledWith({
        where: { restaurantId: 'r1' },
        _count: { _all: true },
        _sum: { points: true },
      });
      expect(mockPrisma.order.aggregate).toHaveBeenCalledWith({
        where: {
          restaurantId: 'r1',
          pointsRedeemed: { gt: 0 },
          status: { not: 'CANCELED' },
        },
        _sum: { pointsRedeemed: true },
      });
      expect(result.totalMembers).toBe(2);
      expect(result.totalPointsOutstanding).toBe(300);
    });

    it('throws ForbiddenException when restaurant not found', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(null);
      await expect(service.getAnalytics('r1', 'other')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // ─── Issue 13: per-account short transactions ─────────────────────────────

  describe('getHistory pagination', () => {
    it('returns a bounded page with a stable next cursor', async () => {
      mockPrisma.order.findMany.mockResolvedValue([
        { id: 'order-3' },
        { id: 'order-2' },
        { id: 'order-1' },
      ]);

      const result = await service.getHistory('user-1', { limit: 2 });

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'user-1' },
          take: 3,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        }),
      );
      expect(result).toEqual({
        data: [{ id: 'order-3' }, { id: 'order-2' }],
        nextCursor: 'order-2',
      });
    });

    it('continues after the supplied order cursor', async () => {
      mockPrisma.order.findMany.mockResolvedValue([{ id: 'order-1' }]);

      await service.getHistory('user-1', {
        cursor: 'order-2',
        limit: 25,
      });

      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'order-2' },
          skip: 1,
          take: 26,
        }),
      );
    });
  });

  describe('getExpiryReminderCandidates (Issue 13)', () => {
    it('opens one $transaction per account, not one wrapping all accounts', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue({
        id: 'r1',
        loyaltyRedeemRate: 150,
        loyaltyExpiryReminderDays: 15,
      });
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([
        {
          id: 'a1',
          points: 100,
          user: { id: 'u1', email: 'a@b.com', name: 'A' },
        },
        {
          id: 'a2',
          points: 50,
          user: { id: 'u2', email: 'c@d.com', name: 'B' },
        },
      ]);
      // Both accounts have no expiring batches
      mockTx.loyaltyPointLedger.findMany.mockResolvedValue([]);
      mockTx.loyaltyAccount.update.mockResolvedValue({ points: 0 });

      await service.getExpiryReminderCandidates('r1', 'owner1');

      expect(mockPrisma.loyaltyAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
          orderBy: { id: 'asc' },
          where: expect.objectContaining({
            restaurantId: 'r1',
            pointLedger: {
              some: expect.objectContaining({
                type: 'EARN',
                remainingPoints: { gt: 0 },
                reminderSentAt: null,
              }),
            },
          }),
        }),
      );
      // Exactly 2 per-account transactions (one per account)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('returns candidates with unnotified expiring batches', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue({
        id: 'r1',
        loyaltyRedeemRate: 150,
        loyaltyExpiryReminderDays: 15,
      });
      const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([
        {
          id: 'a1',
          points: 100,
          user: { id: 'u1', email: 'a@b.com', name: 'A' },
        },
      ]);
      mockTx.loyaltyPointLedger.findMany
        .mockResolvedValueOnce([]) // expireAccountPoints: no stale entries
        .mockResolvedValueOnce([
          // getExpiringPointBatches: one batch
          {
            id: 'b1',
            remainingPoints: 100,
            expiresAt,
            reminderSentAt: null,
            type: 'EARN',
          },
        ]);

      const result = await service.getExpiryReminderCandidates('r1', 'owner1');

      expect(result).toHaveLength(1);
      expect(result[0].points).toBe(100);
      // Preview only — must NOT call markRemindersSent
      expect(mockTx.loyaltyPointLedger.updateMany).not.toHaveBeenCalled();
    });

    it('skips accounts without an email in preview mode', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue({
        id: 'r1',
        loyaltyRedeemRate: 150,
        loyaltyExpiryReminderDays: 15,
      });
      const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([
        {
          id: 'a1',
          points: 100,
          user: { id: 'u1', email: null, name: 'No Email' },
        },
        {
          id: 'a2',
          points: 100,
          user: { id: 'u2', email: 'has@email.test', name: 'Has Email' },
        },
      ]);
      mockTx.loyaltyPointLedger.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: 'b1',
            remainingPoints: 100,
            expiresAt,
            reminderSentAt: null,
            type: 'EARN',
          },
        ]);

      const result = await service.getExpiryReminderCandidates('r1', 'owner1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].user.email).toBe('has@email.test');
    });
  });

  // ─── Issue 14: send-then-mark ─────────────────────────────────────────────

  describe('notifyExpiryReminders (Issue 14)', () => {
    const restaurant = {
      id: 'r1',
      name: 'TestRest',
      loyaltyRedeemRate: 150,
      loyaltyExpiryReminderDays: 15,
    };
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    beforeEach(() => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(restaurant);
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([
        {
          id: 'a1',
          points: 100,
          user: { id: 'u1', email: 'user@example.com', name: 'User' },
        },
      ]);
      mockTx.loyaltyPointLedger.findMany
        .mockResolvedValueOnce([]) // expireAccountPoints: no stale entries
        .mockResolvedValueOnce([
          // getExpiringPointBatches
          {
            id: 'b1',
            remainingPoints: 100,
            expiresAt,
            reminderSentAt: null,
            type: 'EARN',
          },
        ]);
      mockTx.loyaltyPointLedger.updateMany.mockResolvedValue({ count: 1 });
    });

    it('does NOT mark batches when email returns non-ok status', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

      const result = await service.notifyExpiryReminders('r1', 'owner1');

      // Only the expire+read transaction — no markRemindersSent transaction
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(0);

      delete process.env.RESEND_API_KEY;
    });

    it('does NOT mark batches when fetch throws a network error', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      global.fetch = jest.fn().mockRejectedValue(new Error('network'));

      const result = await service.notifyExpiryReminders('r1', 'owner1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(0);

      delete process.env.RESEND_API_KEY;
    });

    it('marks batches only after successful email send', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const result = await service.notifyExpiryReminders('r1', 'owner1');

      // expire+read txn + markRemindersSent txn
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
      expect(result[0].points).toBe(100);

      delete process.env.RESEND_API_KEY;
    });

    // M-ORDER-4: customer/restaurant names are user-controlled and must not
    // be interpolated raw into the HTML email body.
    it('escapes HTML in customer and restaurant names before sending', async () => {
      process.env.RESEND_API_KEY = 'test-key';
      const fetchMock = jest.fn().mockResolvedValue({ ok: true });
      global.fetch = fetchMock;
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([
        {
          id: 'a1',
          points: 100,
          user: {
            id: 'u1',
            email: 'user@example.com',
            name: '<script>alert(1)</script>',
          },
        },
      ]);

      await service.notifyExpiryReminders('r1', 'owner1');

      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.html).not.toContain('<script>');
      expect(body.html).toContain('&lt;script&gt;');

      delete process.env.RESEND_API_KEY;
    });

    it('marks batches in dev mode (no RESEND_API_KEY)', async () => {
      delete process.env.RESEND_API_KEY;

      const result = await service.notifyExpiryReminders('r1', 'owner1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
    });
  });

  describe('Edge Cases (Additional)', () => {
    it('getAnalytics handles completely empty loyalty accounts array', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue({
        id: 'r1',
        isLoyaltyEnabled: true,
      });
      mockPrisma.loyaltyAccount.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { points: null },
      });
      mockPrisma.order.aggregate.mockResolvedValue({
        _sum: { pointsRedeemed: null },
      });
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.loyaltyAccount.findFirst.mockResolvedValue(null);

      const result = await service.getAnalytics('r1', 'owner1');
      expect(result).toBeDefined();
      // Null _sum (no rows) must coalesce to 0, not leak null.
      expect(result.totalMembers).toBe(0);
      expect(result.totalPointsOutstanding).toBe(0);
      expect(result.totalPointsRedeemed).toBe(0);
    });

    it('notifyExpiryReminders returns early when no candidates are found', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue({
        id: 'r1',
        loyaltyRedeemRate: 150,
        loyaltyExpiryReminderDays: 15,
      });
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([]);

      const result = await service.notifyExpiryReminders('r1', 'owner1');
      expect(result).toEqual([]);
    });
  });

  // ─── Core flows previously untested ─────────────────────────────────────────

  describe('getPublicConfig', () => {
    it('returns config when loyalty is available', async () => {
      const mockRestaurant = {
        id: 'r1',
        tier: 'PROFESSIONAL',
        forceTier: null,
        isActive: true,
        isLoyaltyEnabled: true,
        loyaltyExchangeRate: 10,
        loyaltyRedeemRate: 150,
        loyaltyMaxRedemptionPercent: 50,
        loyaltyPointExpiryDays: 90,
        loyaltyExpiryReminderDays: 15,
        loyaltySignupBonus: 0,
        timezone: 'Europe/Sofia',
        happyHourEnable: false,
        happyHourDays: '',
        happyHourStartTime: '17:00',
        happyHourEndTime: '19:00',
        happyHourMultiplier: 1.5,
        loyaltySilverThreshold: 500,
        loyaltyGoldThreshold: 2000,
        loyaltySilverMultiplier: 1.2,
        loyaltyGoldMultiplier: 1.5,
      };
      // Simulate prisma returning the restaurant
      // We need to mock the actual findUnique call. The service uses
      // `this.prisma.restaurant.findUnique` but our mock only has `findFirst`.
      // Actually we need to also mock findUnique. Let's add it.
      (mockPrisma.restaurant as any).findUnique = jest
        .fn()
        .mockResolvedValue(mockRestaurant);

      const result = await service.getPublicConfig('r1');

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('tier');
      expect(result).not.toHaveProperty('forceTier');
      expect(result!.isLoyaltyEnabled).toBe(true);
    });

    it('returns null when loyalty is unavailable', async () => {
      (mockPrisma.restaurant as any).findUnique = jest.fn().mockResolvedValue({
        id: 'r1',
        tier: 'FREE',
        forceTier: null,
        isActive: true,
        isLoyaltyEnabled: true,
      });
      mockFeatureService.hasFeature.mockReturnValueOnce(false);

      const result = await service.getPublicConfig('r1');

      expect(result).toBeNull();
    });
  });

  describe('enroll', () => {
    it('returns existing points when already enrolled', async () => {
      const existingAccount = {
        id: 'acc-1',
        userId: 'user-1',
        restaurantId: 'r1',
        points: 100,
        lifetimePoints: 150,
      };
      (mockPrisma.loyaltyAccount as any).findUnique = jest
        .fn()
        .mockResolvedValue(existingAccount);

      // getPoints will also call findUnique again, then restaurant
      (mockPrisma.restaurant as any).findUnique = jest.fn().mockResolvedValue({
        id: 'r1',
        tier: 'PROFESSIONAL',
        forceTier: null,
        isActive: true,
        isLoyaltyEnabled: true,
        loyaltyExchangeRate: 10,
        loyaltyRedeemRate: 150,
        loyaltyMaxRedemptionPercent: 50,
        loyaltyPointExpiryDays: 90,
        loyaltyExpiryReminderDays: 15,
        loyaltySignupBonus: 50,
        timezone: 'UTC',
        happyHourEnable: false,
        happyHourDays: '',
        happyHourStartTime: '17:00',
        happyHourEndTime: '19:00',
        happyHourMultiplier: 1.5,
        loyaltySilverThreshold: 500,
        loyaltyGoldThreshold: 2000,
        loyaltySilverMultiplier: 1.2,
        loyaltyGoldMultiplier: 1.5,
      });

      // getPoints flow: transaction with lock + expire + find + batches
      mockTx.loyaltyAccount.findUniqueOrThrow = jest
        .fn()
        .mockResolvedValue(existingAccount);
      mockTx.loyaltyPointLedger.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.enroll('user-1', 'r1');

      expect(result.points).toBe(100);
    });

    it('returns zero points when loyalty is unavailable', async () => {
      (mockPrisma.loyaltyAccount as any).findUnique = jest
        .fn()
        .mockResolvedValue(null);
      (mockPrisma.restaurant as any).findUnique = jest.fn().mockResolvedValue({
        id: 'r1',
        tier: 'FREE',
        forceTier: null,
        isActive: true,
        isLoyaltyEnabled: true,
      });
      mockFeatureService.hasFeature.mockReturnValueOnce(false);

      const result = await service.enroll('user-1', 'r1');

      expect(result.points).toBe(0);
      expect(result.lifetimePoints).toBe(0);
    });
  });

  describe('getPoints', () => {
    it('returns zero points when loyalty is unavailable', async () => {
      (mockPrisma.loyaltyAccount as any).findUnique = jest
        .fn()
        .mockResolvedValue(null);
      (mockPrisma.restaurant as any).findUnique = jest.fn().mockResolvedValue({
        id: 'r1',
        tier: 'FREE',
        forceTier: null,
        isActive: true,
        isLoyaltyEnabled: true,
      });
      mockFeatureService.hasFeature.mockReturnValueOnce(false);

      const result = await service.getPoints('user-1', 'r1');

      expect(result.points).toBe(0);
      expect(result.lifetimePoints).toBe(0);
      expect(result.restaurantConfig).toBeNull();
    });

    it('returns points with reward summary when account exists', async () => {
      const account = { id: 'acc-1', points: 500, lifetimePoints: 800 };
      (mockPrisma.loyaltyAccount as any).findUnique = jest
        .fn()
        .mockResolvedValue(account);
      (mockPrisma.restaurant as any).findUnique = jest.fn().mockResolvedValue({
        id: 'r1',
        tier: 'PROFESSIONAL',
        forceTier: null,
        isActive: true,
        isLoyaltyEnabled: true,
        loyaltyExchangeRate: 10,
        loyaltyRedeemRate: 150,
        loyaltyMaxRedemptionPercent: 50,
        loyaltyPointExpiryDays: 90,
        loyaltyExpiryReminderDays: 15,
        loyaltySignupBonus: 0,
        timezone: 'UTC',
        happyHourEnable: false,
        happyHourDays: '',
        happyHourStartTime: '17:00',
        happyHourEndTime: '19:00',
        happyHourMultiplier: 1.5,
        loyaltySilverThreshold: 500,
        loyaltyGoldThreshold: 2000,
        loyaltySilverMultiplier: 1.2,
        loyaltyGoldMultiplier: 1.5,
      });

      mockTx.loyaltyAccount.findUniqueOrThrow = jest
        .fn()
        .mockResolvedValue(account);
      mockTx.loyaltyPointLedger.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.getPoints('user-1', 'r1');

      expect(result.points).toBe(500);
      expect(result.lifetimePoints).toBe(800);
      expect((result as any).rewardValue).toBeDefined();
      expect((result as any).tier).toBeDefined();
      expect(result.restaurantConfig).toBeDefined();
    });

    it('handles no account gracefully', async () => {
      (mockPrisma.loyaltyAccount as any).findUnique = jest
        .fn()
        .mockResolvedValue(null);
      (mockPrisma.restaurant as any).findUnique = jest.fn().mockResolvedValue({
        id: 'r1',
        tier: 'PROFESSIONAL',
        forceTier: null,
        isActive: true,
        isLoyaltyEnabled: true,
        loyaltyExchangeRate: 10,
        loyaltyRedeemRate: 150,
        loyaltyPointExpiryDays: 90,
      });

      const result = await service.getPoints('user-1', 'r1');

      expect(result.points).toBe(0);
      expect((result as any).rewardValue).toBeDefined();
    });
  });

  describe('getLoyaltyAccounts', () => {
    it('returns enriched accounts for user', async () => {
      const accounts = [
        {
          id: 'acc-1',
          userId: 'user-1',
          restaurantId: 'r1',
          points: 300,
          lifetimePoints: 500,
          restaurant: {
            name: 'Test Bistro',
            isLoyaltyEnabled: true,
            loyaltyExchangeRate: 10,
            loyaltyRedeemRate: 150,
            loyaltyMaxRedemptionPercent: 50,
            loyaltyPointExpiryDays: 90,
            loyaltyExpiryReminderDays: 15,
            loyaltySignupBonus: 0,
            timezone: 'UTC',
            happyHourEnable: false,
            happyHourDays: '',
            happyHourStartTime: '17:00',
            happyHourEndTime: '19:00',
            happyHourMultiplier: 1.5,
            loyaltySilverThreshold: 500,
            loyaltyGoldThreshold: 2000,
            loyaltySilverMultiplier: 1.2,
            loyaltyGoldMultiplier: 1.5,
          },
        },
      ];
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue(accounts);

      mockTx.loyaltyAccount.findUniqueOrThrow = jest
        .fn()
        .mockResolvedValue(accounts[0]);
      mockTx.loyaltyPointLedger.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.getLoyaltyAccounts('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].points).toBe(300);
      expect(result[0].restaurant.name).toBe('Test Bistro');
    });

    it('returns empty array when no accounts', async () => {
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([]);

      const result = await service.getLoyaltyAccounts('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('getHistory extended', () => {
    it('returns empty data when no orders exist', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);

      const result = await service.getHistory('user-1', { limit: 10 });

      expect(result.data).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    it('handles default limit when not specified', async () => {
      mockPrisma.order.findMany.mockResolvedValue([]);

      await service.getHistory('user-1', {} as any);

      // Default limit is 25, so take should be 26 (limit + 1 for hasMore check)
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 26 }),
      );
    });
  });
});
