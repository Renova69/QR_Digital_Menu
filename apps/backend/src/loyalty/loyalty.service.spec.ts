import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';

const mockTx = {
  loyaltyAccount: {
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  loyaltyPointLedger: {
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockTransaction = jest.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
  fn(mockTx),
);

const mockPrisma = {
  $transaction: mockTransaction,
  restaurant: { findFirst: jest.fn() },
  loyaltyAccount: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    groupBy: jest.fn(),
  },
  loyaltyPointLedger: { findMany: jest.fn() },
  order: { findMany: jest.fn(), groupBy: jest.fn() },
};

const mockFeatureService = { canAccess: jest.fn().mockResolvedValue(true) };

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
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([
        { id: 'a1', points: 100 },
        { id: 'a2', points: 200 },
      ]);
      mockPrisma.order.findMany.mockResolvedValue([]);
      mockPrisma.order.groupBy.mockResolvedValue([]);
      mockPrisma.loyaltyAccount.findFirst.mockResolvedValue(null);

      await service.getAnalytics('r1', 'owner1');

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.loyaltyAccount.findMany).toHaveBeenCalledWith({
        where: { restaurantId: 'r1' },
      });
    });

    it('throws ForbiddenException when restaurant not found', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue(null);
      await expect(service.getAnalytics('r1', 'other')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  // ─── Issue 13: per-account short transactions ─────────────────────────────

  describe('getExpiryReminderCandidates (Issue 13)', () => {
    it('opens one $transaction per account, not one wrapping all accounts', async () => {
      mockPrisma.restaurant.findFirst.mockResolvedValue({
        id: 'r1',
        loyaltyRedeemRate: 150,
        loyaltyExpiryReminderDays: 15,
      });
      mockPrisma.loyaltyAccount.findMany.mockResolvedValue([
        { id: 'a1', points: 100, user: { id: 'u1', email: 'a@b.com', name: 'A' } },
        { id: 'a2', points: 50, user: { id: 'u2', email: 'c@d.com', name: 'B' } },
      ]);
      // Both accounts have no expiring batches
      mockTx.loyaltyPointLedger.findMany.mockResolvedValue([]);
      mockTx.loyaltyAccount.update.mockResolvedValue({ points: 0 });

      await service.getExpiryReminderCandidates('r1', 'owner1');

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
        { id: 'a1', points: 100, user: { id: 'u1', email: 'a@b.com', name: 'A' } },
      ]);
      mockTx.loyaltyPointLedger.findMany
        .mockResolvedValueOnce([]) // expireAccountPoints: no stale entries
        .mockResolvedValueOnce([  // getExpiringPointBatches: one batch
          { id: 'b1', remainingPoints: 100, expiresAt, reminderSentAt: null, type: 'EARN' },
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
        { id: 'a1', points: 100, user: { id: 'u1', email: null, name: 'No Email' } },
        { id: 'a2', points: 100, user: { id: 'u2', email: 'has@email.test', name: 'Has Email' } },
      ]);
      mockTx.loyaltyPointLedger.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: 'b1', remainingPoints: 100, expiresAt, reminderSentAt: null, type: 'EARN' },
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
        { id: 'a1', points: 100, user: { id: 'u1', email: 'user@example.com', name: 'User' } },
      ]);
      mockTx.loyaltyPointLedger.findMany
        .mockResolvedValueOnce([]) // expireAccountPoints: no stale entries
        .mockResolvedValueOnce([  // getExpiringPointBatches
          { id: 'b1', remainingPoints: 100, expiresAt, reminderSentAt: null, type: 'EARN' },
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

    it('marks batches in dev mode (no RESEND_API_KEY)', async () => {
      delete process.env.RESEND_API_KEY;

      const result = await service.notifyExpiryReminders('r1', 'owner1');

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(1);
    });
  });
});
