import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';

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
  restaurant: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
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

const mockDeliveries = {
  enqueue: jest.fn().mockResolvedValue({ status: 'PENDING' }),
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
        { provide: NotificationDeliveryService, useValue: mockDeliveries },
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

    it('enqueues a durable delivery without marking provider acceptance', async () => {
      const result = await service.notifyExpiryReminders('r1', 'owner1');

      // Only the expire+read transaction — no markRemindersSent transaction
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockDeliveries.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          restaurantId: 'r1',
          sourceType: 'LOYALTY_EXPIRY_REMINDER',
          sourceId: 'a1',
          deduplicationKey: 'loyalty-expiry:a1:b1',
          channel: 'EMAIL',
          payload: expect.objectContaining({ ledgerBatchIds: ['b1'] }),
        }),
      );
      expect(mockTx.loyaltyPointLedger.updateMany).not.toHaveBeenCalled();
      expect(result[0].deliveryStatus).toBe('PENDING');
    });

    it('skips the failing account instead of failing the whole call when durable enqueue fails', async () => {
      // A single account's enqueue failure (e.g. a stale delivery row under
      // the same dedup key with a payload that no longer hashes the same)
      // must not 500 this owner-triggered "notify now" call for every other
      // account being processed in the same request.
      mockDeliveries.enqueue.mockRejectedValueOnce(new Error('database down'));

      const result = await service.notifyExpiryReminders('r1', 'owner1');

      expect(result).toEqual([]);
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.loyaltyPointLedger.updateMany).not.toHaveBeenCalled();
    });

    it('returns the queued reminder summary', async () => {
      const result = await service.notifyExpiryReminders('r1', 'owner1');

      // expire+read txn + markRemindersSent txn
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
      expect(result[0].points).toBe(100);
    });

    // M-ORDER-4: customer/restaurant names are user-controlled and must not
    // be interpolated raw into the HTML email body.
    it('escapes HTML in customer and restaurant names before enqueueing', async () => {
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

      const queuedPayload = mockDeliveries.enqueue.mock.calls[0][0].payload;
      expect(queuedPayload.html).not.toContain('<script>');
      expect(queuedPayload.html).toContain('&lt;script&gt;');
    });

    it('does not report provider acceptance in dev mode', async () => {
      delete process.env.RESEND_API_KEY;

      const result = await service.notifyExpiryReminders('r1', 'owner1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.loyaltyPointLedger.updateMany).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('runDailyExpiryReminders — per-account isolation', () => {
    const restaurant = {
      id: 'r1',
      name: 'TestRest',
      isActive: true,
      isLoyaltyEnabled: true,
      loyaltyRedeemRate: 150,
      loyaltyExpiryReminderDays: 15,
    };
    const expiresAt = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

    it('does not let one account enqueue failure abort the rest of the restaurant sweep', async () => {
      // Regression: enqueueExpiryReminder's ConflictException (stale
      // dedup-key/payload mismatch) used to propagate out of the account
      // loop and abort every remaining account for this tenant.
      mockPrisma.restaurant.findMany.mockResolvedValue([restaurant]);
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([
        {
          id: 'a1',
          points: 100,
          user: { id: 'u1', email: 'a1@example.com', name: 'A1' },
        },
        {
          id: 'a2',
          points: 50,
          user: { id: 'u2', email: 'a2@example.com', name: 'A2' },
        },
      ]);
      mockTx.loyaltyPointLedger.findMany
        .mockResolvedValueOnce([]) // a1 expireAccountPoints
        .mockResolvedValueOnce([
          {
            id: 'b1',
            remainingPoints: 100,
            expiresAt,
            reminderSentAt: null,
            type: 'EARN',
          },
        ]) // a1 getExpiringPointBatches
        .mockResolvedValueOnce([]) // a2 expireAccountPoints
        .mockResolvedValueOnce([
          {
            id: 'b2',
            remainingPoints: 50,
            expiresAt,
            reminderSentAt: null,
            type: 'EARN',
          },
        ]); // a2 getExpiringPointBatches
      mockDeliveries.enqueue
        .mockRejectedValueOnce(new Error('conflict for a1'))
        .mockResolvedValueOnce({ status: 'PENDING' });

      await service.runDailyExpiryReminders();

      // Both accounts must have been attempted — a1's failure did not
      // stop a2 from being processed.
      expect(mockDeliveries.enqueue).toHaveBeenCalledTimes(2);
      expect(mockDeliveries.enqueue).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ sourceId: 'a1' }),
      );
      expect(mockDeliveries.enqueue).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ sourceId: 'a2' }),
      );
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
