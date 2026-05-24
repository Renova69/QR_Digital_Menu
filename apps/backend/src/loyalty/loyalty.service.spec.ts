import { Test, TestingModule } from '@nestjs/testing';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../prisma/prisma.service';

// ─── Shared fixtures ─────────────────────────────────────────────────────────

const BASE_RESTAURANT = {
  id: 'rest-1',
  name: 'Test Restaurant',
  isLoyaltyEnabled: true,
  loyaltySignupBonus: 50,
  loyaltyPointExpiryDays: 90,
  loyaltyRedeemRate: 150,
  loyaltyExchangeRate: 10,
  loyaltyExpiryReminderDays: 15,
  loyaltyPointExpiryEnabled: true,
  loyaltySilverThreshold: 500,
  loyaltyGoldThreshold: 2000,
  loyaltySilverMultiplier: 120,
  loyaltyGoldMultiplier: 150,
  happyHourEnable: false,
  happyHourStartTime: null,
  happyHourEndTime: null,
  happyHourMultiplier: 100,
  timezone: 'UTC',
};

// Full tx mock — covers expireAccountPoints + getExpiringPointBatches + markRemindersSent
const makeTx = (overrides: Record<string, any> = {}) => ({
  loyaltyAccount: {
    findMany: jest.fn().mockResolvedValue([]),
    findUniqueOrThrow: jest.fn().mockResolvedValue({
      id: 'acc-1',
      points: 100,
      lifetimePoints: 500,
      restaurant: BASE_RESTAURANT,
    }),
    update: jest.fn().mockResolvedValue({ id: 'acc-1', points: 100 }),
    create: jest.fn().mockResolvedValue({}),
  },
  loyaltyPointLedger: {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  ...overrides,
});

let mockPrisma: any;

const buildMockPrisma = () => ({
  loyaltyAccount: {
    findUnique: jest.fn(),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    findUniqueOrThrow: jest.fn(),
  },
  restaurant: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  },
  order: { findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
  loyaltyPointBatch: {
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn(),
  },
  loyaltyPointLedger: {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  $transaction: jest.fn(),
});

// ─── Test suite ──────────────────────────────────────────────────────────────

describe('LoyaltyService', () => {
  let service: LoyaltyService;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoyaltyService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<LoyaltyService>(LoyaltyService);
    jest.clearAllMocks();
  });

  // ── getPublicConfig ──────────────────────────────────────────────────────

  describe('getPublicConfig', () => {
    it('returns restaurant loyalty config fields', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      const result = await service.getPublicConfig('rest-1');

      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rest-1' } }),
      );
      expect(result).toEqual(BASE_RESTAURANT);
    });

    it('returns null when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      const result = await service.getPublicConfig('missing');
      expect(result).toBeNull();
    });
  });

  // ── enroll ───────────────────────────────────────────────────────────────

  describe('enroll', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(makeTx()),
      );
      mockPrisma.loyaltyAccount.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 'acc-1', points: 50, lifetimePoints: 50 });
    });

    it('returns existing account without creating when already enrolled', async () => {
      mockPrisma.loyaltyAccount.findUnique.mockReset();
      mockPrisma.loyaltyAccount.findUnique
        .mockResolvedValueOnce({ id: 'acc-1', points: 100, lifetimePoints: 100 })
        .mockResolvedValue({ id: 'acc-1', points: 100, lifetimePoints: 100 });

      await service.enroll('user-1', 'rest-1');

      expect(mockPrisma.loyaltyAccount.create).not.toHaveBeenCalled();
    });

    it('does not create account when loyalty disabled', async () => {
      mockPrisma.loyaltyAccount.findUnique.mockReset();
      mockPrisma.loyaltyAccount.findUnique.mockResolvedValue(null);
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        isLoyaltyEnabled: false,
      });

      await service.enroll('user-1', 'rest-1');

      expect(mockPrisma.loyaltyAccount.create).not.toHaveBeenCalled();
    });

    it('caps signup bonus at MAX_SIGNUP_BONUS (75)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        loyaltySignupBonus: 200,
      });

      let capturedSignupBonus = 0;
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => {
        const tx = makeTx();
        tx.loyaltyAccount.create = jest.fn().mockImplementation(({ data }: any) => {
          capturedSignupBonus = data.points;
          return { id: 'acc-new', ...data };
        });
        tx.loyaltyAccount.findUniqueOrThrow = jest.fn().mockResolvedValue({
          id: 'acc-new', points: 75, lifetimePoints: 75, restaurant: BASE_RESTAURANT,
        });
        await fn(tx);
        return { updatedAccount: { id: 'acc-new', points: 75, lifetimePoints: 75 }, batches: [] };
      });

      await service.enroll('user-1', 'rest-1');

      expect(capturedSignupBonus).toBe(75);
    });

    it('swallows P2002 duplicate-enrollment race condition', async () => {
      const p2002: any = new Error('Unique constraint failed');
      p2002.code = 'P2002';
      mockPrisma.$transaction
        .mockRejectedValueOnce(p2002)
        .mockImplementation(async (fn: (tx: any) => any) => fn(makeTx()));

      await expect(service.enroll('user-1', 'rest-1')).resolves.toBeDefined();
    });

    it('rethrows non-P2002 transaction errors', async () => {
      const connErr: any = new Error('Connection timeout');
      connErr.code = 'P1001';
      mockPrisma.$transaction.mockRejectedValue(connErr);

      await expect(service.enroll('user-1', 'rest-1')).rejects.toThrow('Connection timeout');
    });
  });

  // ── getPoints ────────────────────────────────────────────────────────────

  describe('getPoints', () => {
    it('returns 0 points when no loyalty account exists', async () => {
      mockPrisma.loyaltyAccount.findUnique.mockResolvedValue(null);
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      const result = await service.getPoints('user-no-acc', 'rest-1');

      expect(result.points).toBe(0);
      expect(result.lifetimePoints).toBe(0);
    });

    it('includes rewardValue in response', async () => {
      mockPrisma.loyaltyAccount.findUnique.mockResolvedValue(null);
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      const result = await service.getPoints('user-1', 'rest-1');

      expect(result).toHaveProperty('rewardValue');
    });

    it('handles missing restaurant gracefully', async () => {
      mockPrisma.loyaltyAccount.findUnique.mockResolvedValue(null);
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      const result = await service.getPoints('user-1', 'rest-missing');

      expect(result.points).toBe(0);
    });

    it('runs expiry transaction when account exists', async () => {
      const mockAccount = { id: 'acc-1', points: 100, lifetimePoints: 500 };
      mockPrisma.loyaltyAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(makeTx()),
      );

      await service.getPoints('user-1', 'rest-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('populates expiringSoon fields when ledger has expiring batches', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const mockAccount = { id: 'acc-1', points: 100, lifetimePoints: 500 };
      mockPrisma.loyaltyAccount.findUnique.mockResolvedValue(mockAccount);
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      const tx = makeTx();
      tx.loyaltyPointLedger.findMany = jest.fn()
        .mockResolvedValueOnce([]) // expireAccountPoints: no expired entries
        .mockResolvedValue([{ id: 'l-1', remainingPoints: 50, expiresAt }]);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      const result = await service.getPoints('user-1', 'rest-1');

      expect(result.expiringSoonPoints).toBe(50);
      expect(result.expiringSoon).toHaveLength(1);
      expect(result.nextExpirationAt).toEqual(expiresAt);
    });
  });

  // ── getHistory ───────────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns orders for the user sorted by date', async () => {
      const orders = [{ id: 'ord-1' }, { id: 'ord-2' }];
      mockPrisma.order.findMany.mockResolvedValue(orders);

      const result = await service.getHistory('user-1');

      expect(result).toEqual(orders);
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'user-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // ── getLoyaltyAccounts ───────────────────────────────────────────────────

  describe('getLoyaltyAccounts', () => {
    it('returns empty array when user has no accounts', async () => {
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn(makeTx()),
      );

      const result = await service.getLoyaltyAccounts('user-1');

      expect(result).toEqual([]);
    });

    it('returns enriched accounts with summary fields', async () => {
      const account = { id: 'acc-1', points: 100, lifetimePoints: 500, restaurant: BASE_RESTAURANT };
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([account]);

      const tx = makeTx();
      tx.loyaltyAccount.findUniqueOrThrow = jest.fn().mockResolvedValue(account);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      const result = await service.getLoyaltyAccounts('user-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('points', 100);
      expect(result[0]).toHaveProperty('rewardValue');
      expect(result[0]).toHaveProperty('tier');
    });

    it('calls prisma.loyaltyAccount.findMany with userId filter', async () => {
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(makeTx()));

      await service.getLoyaltyAccounts('user-42');

      expect(mockPrisma.loyaltyAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-42' } }),
      );
    });
  });

  // ── notifyExpiryReminders ────────────────────────────────────────────────

  describe('notifyExpiryReminders', () => {
    it('throws Error when restaurant not found', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(null);

      await expect(service.notifyExpiryReminders('rest-1', 'owner-1')).rejects.toThrow('Forbidden');
    });

    it('returns empty array when no expiring batches', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(BASE_RESTAURANT);

      const tx = makeTx();
      tx.loyaltyAccount.findMany = jest.fn().mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      const result = await service.notifyExpiryReminders('rest-1', 'owner-1');

      expect(result).toEqual([]);
    });

    it('logs via logger when RESEND_API_KEY is not set and candidate has email', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(BASE_RESTAURANT);

      const candidate = {
        id: 'acc-1',
        user: { id: 'user-1', email: 'u@test.com', name: 'User' },
      };

      const tx = makeTx();
      tx.loyaltyAccount.findMany = jest.fn().mockResolvedValue([candidate]);
      tx.loyaltyPointLedger.findMany = jest.fn()
        .mockResolvedValueOnce([]) // expireAccountPoints: no expired entries
        .mockResolvedValue([
          { id: 'batch-1', remainingPoints: 50, expiresAt: new Date(Date.now() + 86400000) },
        ]); // getExpiringPointBatches: one batch
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      const prevKey = process.env.RESEND_API_KEY;
      delete process.env.RESEND_API_KEY;

      const result = await service.notifyExpiryReminders('rest-1', 'owner-1');

      expect(result).toHaveLength(1);
      expect(result[0].user.email).toBe('u@test.com');

      if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
    });

    it('calls fetch when RESEND_API_KEY is set', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(BASE_RESTAURANT);

      const candidate = {
        id: 'acc-1',
        user: { id: 'user-1', email: 'u@test.com', name: 'User' },
      };

      const tx = makeTx();
      tx.loyaltyAccount.findMany = jest.fn().mockResolvedValue([candidate]);
      tx.loyaltyPointLedger.findMany = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          { id: 'batch-1', remainingPoints: 50, expiresAt: new Date(Date.now() + 86400000) },
        ]);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      const prevKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-resend-key';

      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      (global as any).fetch = mockFetch;

      await service.notifyExpiryReminders('rest-1', 'owner-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.resend.com/emails',
        expect.objectContaining({ method: 'POST' }),
      );

      process.env.RESEND_API_KEY = prevKey ?? '';
      if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    });
  });

  // ── getExpiryReminderCandidates ──────────────────────────────────────────

  describe('getExpiryReminderCandidates', () => {
    it('throws Error when restaurant not found', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(null);

      await expect(service.getExpiryReminderCandidates('rest-1', 'owner-1')).rejects.toThrow('Forbidden');
    });

    it('returns empty array when no accounts have expiring points', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(BASE_RESTAURANT);

      const tx = makeTx();
      tx.loyaltyAccount.findMany = jest.fn().mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      const result = await service.getExpiryReminderCandidates('rest-1', 'owner-1');

      expect(result).toEqual([]);
    });

    it('returns candidates with points and value for accounts with expiring batches', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(BASE_RESTAURANT);

      const account = { id: 'acc-1', user: { id: 'user-1', email: 'u@test.com', name: 'User' } };

      const tx = makeTx();
      tx.loyaltyAccount.findMany = jest.fn().mockResolvedValue([account]);
      tx.loyaltyPointLedger.findMany = jest.fn()
        .mockResolvedValueOnce([]) // expireAccountPoints
        .mockResolvedValue([
          { id: 'batch-1', remainingPoints: 75, expiresAt: new Date(Date.now() + 86400000) },
        ]); // getExpiringPointBatches
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      const result = await service.getExpiryReminderCandidates('rest-1', 'owner-1');

      expect(result).toHaveLength(1);
      expect(result[0].points).toBe(75);
      expect(result[0].value).toBeCloseTo(75 / 150, 5);
      expect(result[0].user.email).toBe('u@test.com');
    });
  });

  // ── getAnalytics ─────────────────────────────────────────────────────────

  describe('getAnalytics', () => {
    it('throws Error when restaurant not found', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(null);

      await expect(service.getAnalytics('rest-1', 'owner-1')).rejects.toThrow('Forbidden');
    });

    it('returns correct totals', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(BASE_RESTAURANT);

      const accounts = [
        { id: 'acc-1', points: 200 },
        { id: 'acc-2', points: 50 },
      ];

      const tx = makeTx();
      tx.loyaltyAccount.findMany = jest.fn()
        .mockResolvedValueOnce(accounts) // initial findMany
        .mockResolvedValue(accounts);    // second findMany (after expiry)
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      mockPrisma.order.findMany.mockResolvedValue([
        { pointsRedeemed: 100 },
        { pointsRedeemed: 50 },
      ]);

      const result = await service.getAnalytics('rest-1', 'owner-1');

      expect(result.totalMembers).toBe(2);
      expect(result.totalPointsOutstanding).toBe(250);
      expect(result.totalPointsRedeemed).toBe(150);
    });

    it('returns zero totals when no loyalty accounts', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(BASE_RESTAURANT);

      const tx = makeTx();
      tx.loyaltyAccount.findMany = jest.fn().mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));
      mockPrisma.order.findMany.mockResolvedValue([]);

      const result = await service.getAnalytics('rest-1', 'owner-1');

      expect(result.totalMembers).toBe(0);
      expect(result.totalPointsOutstanding).toBe(0);
      expect(result.totalPointsRedeemed).toBe(0);
    });
  });

  // ── runDailyExpiryReminders ──────────────────────────────────────────────

  describe('runDailyExpiryReminders', () => {
    it('does nothing when no restaurants have loyalty enabled', async () => {
      mockPrisma.restaurant.findMany.mockResolvedValue([]);

      await service.runDailyExpiryReminders();

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('runs transaction per restaurant and logs when no candidates', async () => {
      mockPrisma.restaurant.findMany.mockResolvedValue([BASE_RESTAURANT]);

      const tx = makeTx();
      tx.loyaltyAccount.findMany = jest.fn().mockResolvedValue([]);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      await service.runDailyExpiryReminders();

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('calls fetch for candidates when RESEND_API_KEY set', async () => {
      mockPrisma.restaurant.findMany.mockResolvedValue([BASE_RESTAURANT]);

      const candidate = {
        id: 'acc-1',
        user: { id: 'user-1', email: 'u@test.com', name: 'User' },
      };

      const tx = makeTx();
      tx.loyaltyAccount.findMany = jest.fn().mockResolvedValue([candidate]);
      tx.loyaltyPointLedger.findMany = jest.fn()
        .mockResolvedValueOnce([]) // expireAccountPoints
        .mockResolvedValue([
          { id: 'batch-1', remainingPoints: 50, expiresAt: new Date(Date.now() + 86400000) },
        ]);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => fn(tx));

      const prevKey = process.env.RESEND_API_KEY;
      process.env.RESEND_API_KEY = 'test-key';
      const mockFetch = jest.fn().mockResolvedValue({ ok: true });
      (global as any).fetch = mockFetch;

      await service.runDailyExpiryReminders();

      expect(mockFetch).toHaveBeenCalled();

      process.env.RESEND_API_KEY = prevKey ?? '';
      if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    });

    it('continues processing other restaurants when one throws', async () => {
      const rest2 = { ...BASE_RESTAURANT, id: 'rest-2', name: 'Rest 2' };
      mockPrisma.restaurant.findMany.mockResolvedValue([BASE_RESTAURANT, rest2]);

      let callCount = 0;
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => {
        callCount++;
        if (callCount === 1) throw new Error('DB error');
        return fn(makeTx());
      });

      // Should not throw — errors are caught per restaurant
      await expect(service.runDailyExpiryReminders()).resolves.toBeUndefined();
      expect(callCount).toBe(2);
    });
  });
});
