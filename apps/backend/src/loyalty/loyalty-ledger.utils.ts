import { LoyaltyPointTransactionType, Prisma } from '@prisma/client';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const SPENDABLE_ENTRY_TYPES: LoyaltyPointTransactionType[] = [
  LoyaltyPointTransactionType.EARN,
  LoyaltyPointTransactionType.SIGNUP,
  LoyaltyPointTransactionType.ADJUSTMENT,
];

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function getRewardValue(points: number, redeemRate: number) {
  if (redeemRate <= 0) return 0;
  return points / redeemRate;
}

export function getFirstRewardProgress(points: number, redeemRate: number) {
  if (redeemRate <= 0) {
    return { percent: 0, pointsToReward: 0, rewardThreshold: 0 };
  }

  return {
    percent: Math.min(100, Math.floor((points / redeemRate) * 100)),
    pointsToReward: Math.max(redeemRate - points, 0),
    rewardThreshold: redeemRate,
  };
}

export async function expireAccountPoints(
  tx: Prisma.TransactionClient,
  loyaltyAccountId: string,
  now = new Date(),
) {
  const expiredEntries = await tx.loyaltyPointLedger.findMany({
    where: {
      loyaltyAccountId,
      remainingPoints: { gt: 0 },
      expiresAt: { lte: now },
      type: { in: SPENDABLE_ENTRY_TYPES },
    },
  });

  const expiredPoints = expiredEntries.reduce(
    (sum: number, entry: { remainingPoints: number }) => sum + entry.remainingPoints,
    0,
  );

  if (expiredPoints <= 0) return 0;

  await tx.loyaltyPointLedger.updateMany({
    where: { id: { in: expiredEntries.map((e: { id: string }) => e.id) } },
    data: { remainingPoints: 0 },
  });

  await tx.loyaltyPointLedger.create({
    data: {
      loyaltyAccountId,
      type: LoyaltyPointTransactionType.EXPIRE,
      points: -expiredPoints,
      remainingPoints: 0,
    },
  });

  const updated = await tx.loyaltyAccount.update({
    where: { id: loyaltyAccountId },
    data: { points: { decrement: expiredPoints } },
  });

  if (updated.points < 0) {
    await tx.loyaltyAccount.update({
      where: { id: loyaltyAccountId },
      data: { points: 0 },
    });
  }

  return expiredPoints;
}

export async function redeemAccountPoints(
  tx: Prisma.TransactionClient,
  loyaltyAccountId: string,
  pointsToRedeem: number,
  orderId?: string,
) {
  if (pointsToRedeem <= 0) return;

  let remainingToRedeem = pointsToRedeem;
  const batches = await tx.loyaltyPointLedger.findMany({
    where: {
      loyaltyAccountId,
      remainingPoints: { gt: 0 },
      type: { in: SPENDABLE_ENTRY_TYPES },
    },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
  });

  for (const batch of batches) {
    if (remainingToRedeem <= 0) break;
    const consumed = Math.min(batch.remainingPoints, remainingToRedeem);
    remainingToRedeem -= consumed;
    await tx.loyaltyPointLedger.update({
      where: { id: batch.id },
      data: { remainingPoints: { decrement: consumed } },
    });
  }

  if (remainingToRedeem > 0) {
    throw new Error('Loyalty point ledger does not match account balance');
  }

  await tx.loyaltyPointLedger.create({
    data: {
      loyaltyAccountId,
      orderId,
      type: LoyaltyPointTransactionType.REDEEM,
      points: -pointsToRedeem,
      remainingPoints: 0,
    },
  });
}

export async function addEarnedPointBatch(
  tx: Prisma.TransactionClient,
  loyaltyAccountId: string,
  points: number,
  type: 'EARN' | 'SIGNUP',
  expiresAt: Date,
  orderId?: string,
) {
  if (points <= 0) return;

  await tx.loyaltyPointLedger.create({
    data: {
      loyaltyAccountId,
      orderId,
      type:
        type === 'SIGNUP'
          ? LoyaltyPointTransactionType.SIGNUP
          : LoyaltyPointTransactionType.EARN,
      points,
      remainingPoints: points,
      expiresAt,
    },
  });
}

/**
 * Returns point batches expiring within the reminder window.
 * Pass onlyUnnotified=true to skip batches where a reminder was already sent,
 * preventing duplicate notifications.
 */
export async function getExpiringPointBatches(
  tx: Prisma.TransactionClient,
  loyaltyAccountId: string,
  reminderDays: number,
  now = new Date(),
  onlyUnnotified = false,
) {
  const reminderCutoff = addDays(now, reminderDays);

  return tx.loyaltyPointLedger.findMany({
    where: {
      loyaltyAccountId,
      remainingPoints: { gt: 0 },
      expiresAt: { gt: now, lte: reminderCutoff },
      type: { in: SPENDABLE_ENTRY_TYPES },
      ...(onlyUnnotified ? { reminderSentAt: null } : {}),
    },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
  });
}

/** Stamps reminderSentAt on ledger batches so they aren't returned again. */
export async function markRemindersSent(
  tx: Prisma.TransactionClient,
  batchIds: string[],
  now = new Date(),
) {
  if (batchIds.length === 0) return;
  await tx.loyaltyPointLedger.updateMany({
    where: { id: { in: batchIds } },
    data: { reminderSentAt: now },
  });
}
