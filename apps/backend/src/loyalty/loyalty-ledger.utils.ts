import { InternalServerErrorException, Logger } from '@nestjs/common';
import { LoyaltyPointTransactionType, Prisma } from '@prisma/client';

const logger = new Logger('LoyaltyLedger');

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Hard cap on signup bonus points. Single source of truth shared between
 *  enrollment (LoyaltyService) and first-order flows (OrdersService). */
export const MAX_SIGNUP_BONUS = 75;

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
  // #3: round to cents so the displayed/redeemed value matches the money
  // actually applied — points / redeemRate is frequently non-terminating.
  return Math.round((points / redeemRate) * 100) / 100;
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

/**
 * Locks the loyalty_account row for the remainder of the current
 * transaction. Every mutator of an account's points/lifetimePoints or its
 * ledger — order creation, redemption, cancel reversal, and expiry (cron or
 * on-demand) — must call this first so concurrent mutations against the
 * same account serialize instead of racing on a stale read (M-ORDER-3).
 */
export async function lockLoyaltyAccountRow(
  tx: Prisma.TransactionClient,
  loyaltyAccountId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "loyalty_account" WHERE id = ${loyaltyAccountId} FOR UPDATE`;
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
    (sum: number, entry: { remainingPoints: number }) =>
      sum + entry.remainingPoints,
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

  // Single guarded update instead of decrement-then-clamp (L-ORDER-1): avoids
  // a transiently negative balance between two writes and computes the clamp
  // from the current DB value rather than a value read earlier in the tx.
  await tx.$executeRaw`
    UPDATE "loyalty_account"
    SET points = GREATEST(0, points - ${expiredPoints})
    WHERE id = ${loyaltyAccountId}
  `;

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
    // M-ORDER-2: this is a server invariant failure (ledger sum diverged from
    // the cached account.points balance), not user input — surface as a 500,
    // but log full context since the client-facing message can't include it.
    logger.error(
      `Ledger/account balance mismatch: loyaltyAccountId=${loyaltyAccountId} orderId=${orderId ?? 'n/a'} requested=${pointsToRedeem} unfulfilled=${remainingToRedeem}`,
    );
    throw new InternalServerErrorException(
      'Loyalty point ledger does not match account balance',
    );
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
