import {
  expireAccountPoints,
  redeemAccountPoints,
  addEarnedPointBatch,
  addDays,
  getRewardValue,
} from './loyalty-ledger.utils';

describe('loyalty-ledger.utils', () => {
  describe('addDays', () => {
    it('should add days correctly', () => {
      const date = new Date('2024-01-01');
      expect(addDays(date, 90)).toEqual(new Date('2024-03-31'));
    });
  });

  describe('getRewardValue', () => {
    it('should return points / redeemRate', () => {
      expect(getRewardValue(150, 150)).toBe(1);
      expect(getRewardValue(300, 150)).toBe(2);
    });

    it('should return 0 when redeemRate <= 0', () => {
      expect(getRewardValue(100, 0)).toBe(0);
      expect(getRewardValue(100, -1)).toBe(0);
    });
  });

  describe('expireAccountPoints', () => {
    const makeTx = () => ({
      loyaltyPointLedger: {
        findMany: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      loyaltyAccount: {
        update: jest.fn(),
      },
    });

    it('should set remainingPoints to 0 on expired batches', async () => {
      const tx = makeTx();
      const expiredEntries = [
        { id: 'batch-1', remainingPoints: 50, type: 'EARN' },
        { id: 'batch-2', remainingPoints: 25, type: 'SIGNUP' },
      ];
      tx.loyaltyPointLedger.findMany.mockResolvedValue(expiredEntries);
      tx.loyaltyAccount.update.mockResolvedValue({ points: 0 });

      await expireAccountPoints(tx as any, 'acc-1', new Date('2100-01-01'));

      expect(tx.loyaltyPointLedger.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { remainingPoints: 0 },
        }),
      );
    });

    it('should floor account balance at 0 after expiry', async () => {
      const tx = makeTx();
      tx.loyaltyPointLedger.findMany.mockResolvedValue([
        { id: 'batch-1', remainingPoints: 300, type: 'EARN' },
      ]);
      tx.loyaltyAccount.update
        .mockResolvedValueOnce({ points: -100 }) // first update goes negative
        .mockResolvedValueOnce({ points: 0 });

      await expireAccountPoints(tx as any, 'acc-1', new Date('2100-01-01'));

      expect(tx.loyaltyAccount.update).toHaveBeenCalledTimes(2);
    });

    it('should return 0 when no expired batches', async () => {
      const tx = makeTx();
      tx.loyaltyPointLedger.findMany.mockResolvedValue([]);

      const result = await expireAccountPoints(tx as any, 'acc-1');
      expect(result).toBe(0);
    });
  });

  describe('redeemAccountPoints', () => {
    it('should consume oldest batches first (FIFO by expiresAt)', async () => {
      const batches = [
        { id: 'old', remainingPoints: 50, expiresAt: new Date('2024-01-01') },
        { id: 'new', remainingPoints: 100, expiresAt: new Date('2024-12-31') },
      ];
      const tx = {
        loyaltyPointLedger: {
          findMany: jest.fn().mockResolvedValue(batches),
          update: jest.fn(),
          create: jest.fn(),
        },
      } as any;

      await redeemAccountPoints(tx, 'acc-1', 75);

      // Old batch fully consumed first (50), then new batch for remaining 25
      expect(tx.loyaltyPointLedger.update).toHaveBeenCalledTimes(2);
      expect(tx.loyaltyPointLedger.update).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: { id: 'old' },
          data: { remainingPoints: { decrement: 50 } },
        }),
      );
      expect(tx.loyaltyPointLedger.update).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: { id: 'new' },
          data: { remainingPoints: { decrement: 25 } },
        }),
      );
    });

    it('should throw when insufficient points', async () => {
      const tx = {
        loyaltyPointLedger: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'only', remainingPoints: 10 }]),
          update: jest.fn(),
          create: jest.fn(),
        },
      } as any;

      await expect(redeemAccountPoints(tx, 'acc-1', 100)).rejects.toThrow(
        'Loyalty point ledger does not match account balance',
      );
    });

    it('should do nothing when pointsToRedeem <= 0', async () => {
      const tx = {
        loyaltyPointLedger: {
          findMany: jest.fn(),
          update: jest.fn(),
          create: jest.fn(),
        },
      } as any;

      await redeemAccountPoints(tx, 'acc-1', 0);
      expect(tx.loyaltyPointLedger.findMany).not.toHaveBeenCalled();
    });

    it('should create a REDEEM transaction record', async () => {
      const tx = {
        loyaltyPointLedger: {
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: 'b1', remainingPoints: 200 }]),
          update: jest.fn(),
          create: jest.fn(),
        },
      } as any;

      await redeemAccountPoints(tx, 'acc-1', 100, 'order-1');

      expect(tx.loyaltyPointLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'REDEEM',
            points: -100,
            orderId: 'order-1',
          }),
        }),
      );
    });
  });

  describe('addEarnedPointBatch', () => {
    it('should create correct ledger entry for EARN', async () => {
      const tx = {
        loyaltyPointLedger: { create: jest.fn() },
      } as any;
      const expiresAt = new Date('2024-12-31');

      await addEarnedPointBatch(tx, 'acc-1', 100, 'EARN', expiresAt, 'order-1');

      expect(tx.loyaltyPointLedger.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loyaltyAccountId: 'acc-1',
            type: 'EARN',
            points: 100,
            remainingPoints: 100,
            orderId: 'order-1',
          }),
        }),
      );
    });

    it('should do nothing when points <= 0', async () => {
      const tx = {
        loyaltyPointLedger: { create: jest.fn() },
      } as any;

      await addEarnedPointBatch(tx, 'acc-1', 0, 'EARN', new Date());
      expect(tx.loyaltyPointLedger.create).not.toHaveBeenCalled();
    });
  });
});
