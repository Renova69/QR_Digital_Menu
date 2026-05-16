import { Test, TestingModule } from '@nestjs/testing';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  loyaltyAccount: {
    findUnique: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  restaurant: { findUnique: jest.fn() },
  order: { findMany: jest.fn() },
  loyaltyPointBatch: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

const BASE_RESTAURANT = {
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

describe('LoyaltyService', () => {
  let service: LoyaltyService;

  beforeEach(async () => {
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
      // getPoints dependencies
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) =>
        fn({
          loyaltyAccount: {
            findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'acc-1', points: 50, lifetimePoints: 50 }),
          },
          loyaltyPointBatch: {
            updateMany: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
          },
          loyaltyPointLedger: {
            create: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        }),
      );
      mockPrisma.loyaltyAccount.findUnique
        .mockResolvedValueOnce(null)           // first call: no existing account
        .mockResolvedValue({ id: 'acc-1', points: 50, lifetimePoints: 50 }); // getPoints call
    });

    it('returns existing account without creating when already enrolled', async () => {
      mockPrisma.loyaltyAccount.findUnique.mockReset();
      mockPrisma.loyaltyAccount.findUnique
        .mockResolvedValueOnce({ id: 'acc-1', points: 100, lifetimePoints: 100 }) // existing
        .mockResolvedValue({ id: 'acc-1', points: 100, lifetimePoints: 100 });    // getPoints

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
        loyaltySignupBonus: 200, // exceeds cap
      });

      let capturedSignupBonus = 0;
      mockPrisma.$transaction.mockImplementation(async (fn: (tx: any) => any) => {
        const tx = {
          loyaltyAccount: {
            create: jest.fn().mockImplementation(({ data }: any) => {
              capturedSignupBonus = data.points;
              return { id: 'acc-new', ...data };
            }),
            findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'acc-new', points: 75, lifetimePoints: 75 }),
          },
          loyaltyPointBatch: {
            create: jest.fn(),
            updateMany: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
          },
          loyaltyPointLedger: {
            create: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        };
        await fn(tx);
        return { updatedAccount: { id: 'acc-new', points: 75, lifetimePoints: 75 }, batches: [] };
      });

      await service.enroll('user-1', 'rest-1');

      expect(capturedSignupBonus).toBe(75);
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
        fn({
          loyaltyAccount: {
            findUniqueOrThrow: jest.fn().mockResolvedValue(mockAccount),
          },
          loyaltyPointBatch: {
            updateMany: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
          },
          loyaltyPointLedger: {
            create: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        }),
      );

      await service.getPoints('user-1', 'rest-1');

      expect(mockPrisma.$transaction).toHaveBeenCalled();
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
});
