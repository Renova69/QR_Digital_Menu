import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  addDays,
  addEarnedPointBatch,
  expireAccountPoints,
  getExpiringPointBatches,
  getFirstRewardProgress,
  getRewardValue,
  markRemindersSent,
} from './loyalty-ledger.utils';
import {
  getTierInfo,
  tierConfigFromRestaurant,
  TierInfo,
} from './loyalty-tiers.utils';

const MAX_SIGNUP_BONUS = 75;

const TIER_FIELDS = {
  loyaltySilverThreshold: true,
  loyaltyGoldThreshold: true,
  loyaltySilverMultiplier: true,
  loyaltyGoldMultiplier: true,
} as const;

const LOYALTY_CONFIG_FIELDS = {
  isLoyaltyEnabled: true,
  happyHourEnable: true,
  happyHourStartTime: true,
  happyHourEndTime: true,
  happyHourMultiplier: true,
  loyaltyExchangeRate: true,
  loyaltyRedeemRate: true,
  loyaltyPointExpiryDays: true,
  loyaltyExpiryReminderDays: true,
  loyaltySignupBonus: true,
  timezone: true,
  ...TIER_FIELDS,
} as const;

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

  private buildRewardSummary(
    account: { points: number; lifetimePoints: number },
    restaurant: {
      loyaltyRedeemRate?: number | null;
      loyaltyExpiryReminderDays?: number | null;
      loyaltySilverThreshold?: number | null;
      loyaltyGoldThreshold?: number | null;
      loyaltySilverMultiplier?: number | null;
      loyaltyGoldMultiplier?: number | null;
      [key: string]: any;
    },
    expiringBatches: { remainingPoints: number; expiresAt: Date | null }[] = [],
  ) {
    const redeemRate = restaurant?.loyaltyRedeemRate ?? 150;
    const tierConfig = tierConfigFromRestaurant(restaurant ?? {});
    const tierInfo: TierInfo = getTierInfo(
      account.lifetimePoints,
      tierConfig,
    );
    const progress = getFirstRewardProgress(account.points, redeemRate);
    const expiringSoonPoints = expiringBatches.reduce(
      (sum, b) => sum + b.remainingPoints,
      0,
    );

    return {
      rewardValue: getRewardValue(account.points, redeemRate),
      rewardThresholdPoints: progress.rewardThreshold,
      firstRewardProgressPercent: progress.percent,
      pointsToFirstReward: progress.pointsToReward,
      // VIP tier info — consumed directly by frontend, no local recalculation needed
      tier: tierInfo.tier,
      tierMultiplier: tierInfo.multiplier,
      tierProgressPercent: tierInfo.progressPercent,
      pointsToNextTier: tierInfo.pointsToNext,
      nextTierName: tierInfo.nextTierName,
      tierConfig,
      // Expiry info
      expiringSoonPoints,
      expiringSoonValue: getRewardValue(expiringSoonPoints, redeemRate),
      nextExpirationAt: expiringBatches[0]?.expiresAt ?? null,
      expiringSoon: expiringBatches.map((b) => ({
        points: b.remainingPoints,
        value: getRewardValue(b.remainingPoints, redeemRate),
        expiresAt: b.expiresAt,
      })),
    };
  }

  async getPublicConfig(restaurantId: string) {
    return this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: LOYALTY_CONFIG_FIELDS,
    });
  }

  async enroll(userId: string, restaurantId: string) {
    const existing = await this.prisma.loyaltyAccount.findUnique({
      where: { userId_restaurantId: { userId, restaurantId } },
    });

    if (existing) return this.getPoints(userId, restaurantId);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        isLoyaltyEnabled: true,
        loyaltySignupBonus: true,
        loyaltyPointExpiryDays: true,
      },
    });

    if (!restaurant?.isLoyaltyEnabled) {
      return this.getPoints(userId, restaurantId);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const signupBonus = Math.min(
          MAX_SIGNUP_BONUS,
          restaurant.loyaltySignupBonus || 0,
        );
        const createdAccount = await tx.loyaltyAccount.create({
          data: {
            userId,
            restaurantId,
            points: signupBonus,
            lifetimePoints: signupBonus,
          },
        });

        await addEarnedPointBatch(
          tx,
          createdAccount.id,
          signupBonus,
          'SIGNUP',
          addDays(new Date(), restaurant.loyaltyPointExpiryDays || 90),
        );
      });
    } catch (error: any) {
      if (error.code !== 'P2002') throw error;
    }

    return this.getPoints(userId, restaurantId);
  }

  async getPoints(userId: string, restaurantId: string) {
    let acc = await this.prisma.loyaltyAccount.findUnique({
      where: { userId_restaurantId: { userId, restaurantId } },
    });

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: LOYALTY_CONFIG_FIELDS,
    });

    let expiringSoon: any[] = [];

    if (acc && restaurant) {
      const result = await this.prisma.$transaction(async (tx) => {
        await expireAccountPoints(tx, acc!.id);
        const updatedAccount = await tx.loyaltyAccount.findUniqueOrThrow({
          where: { id: acc!.id },
        });
        const batches = await getExpiringPointBatches(
          tx,
          acc!.id,
          restaurant.loyaltyExpiryReminderDays || 15,
        );
        return { updatedAccount, batches };
      });

      acc = result.updatedAccount;
      expiringSoon = result.batches;
    }

    const summary = this.buildRewardSummary(
      acc ?? { points: 0, lifetimePoints: 0 },
      restaurant ?? {},
      expiringSoon,
    );

    return {
      points: acc?.points ?? 0,
      lifetimePoints: acc?.lifetimePoints ?? 0,
      ...summary,
      restaurantConfig: restaurant,
    };
  }

  async getLoyaltyAccounts(userId: string) {
    const accounts = await this.prisma.loyaltyAccount.findMany({
      where: { userId },
      include: {
        restaurant: {
          select: {
            name: true,
            ...LOYALTY_CONFIG_FIELDS,
          },
        },
      },
    });

    return this.prisma.$transaction(async (tx) => {
      const enriched = [];

      for (const account of accounts) {
        await expireAccountPoints(tx, account.id);

        const updated = await tx.loyaltyAccount.findUniqueOrThrow({
          where: { id: account.id },
          include: {
            restaurant: {
              select: { name: true, ...LOYALTY_CONFIG_FIELDS },
            },
          },
        });

        const expiringBatches = await getExpiringPointBatches(
          tx,
          account.id,
          updated.restaurant.loyaltyExpiryReminderDays || 15,
        );

        const summary = this.buildRewardSummary(
          updated,
          updated.restaurant,
          expiringBatches,
        );

        enriched.push({
          id: updated.id,
          points: updated.points,
          lifetimePoints: updated.lifetimePoints,
          restaurant: updated.restaurant,
          ...summary,
        });
      }

      return enriched;
    });
  }

  async getHistory(userId: string) {
    return this.prisma.order.findMany({
      where: { customerId: userId },
      include: {
        restaurant: { select: { name: true, logoUrl: true } },
        items: {
          include: { menuItem: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns customers with points expiring within the reminder window
   * (only those not yet notified) and stamps reminderSentAt on their batches
   * so they won't appear again on subsequent calls.
   */
  async notifyExpiryReminders(restaurantId: string, ownerId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, ownerId },
      select: {
        id: true,
        name: true,
        loyaltyRedeemRate: true,
        loyaltyExpiryReminderDays: true,
      },
    });

    if (!restaurant) throw new Error('Forbidden');

    return this.prisma.$transaction(async (tx) => {
      const accounts = await tx.loyaltyAccount.findMany({
        where: { restaurantId, points: { gt: 0 } },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      const candidates: any[] = [];

      for (const account of accounts) {
        await expireAccountPoints(tx, account.id);

        const batches = await getExpiringPointBatches(
          tx,
          account.id,
          restaurant.loyaltyExpiryReminderDays || 15,
          new Date(),
          true, // only unnotified
        );

        if (batches.length === 0) continue;

        const points = batches.reduce((s, b) => s + b.remainingPoints, 0);
        await markRemindersSent(tx, batches.map((b) => b.id));

        const redeemRate = restaurant.loyaltyRedeemRate || 150;
        candidates.push({
          user: account.user,
          loyaltyAccountId: account.id,
          points,
          value: getRewardValue(points, redeemRate),
          nextExpirationAt: batches[0]?.expiresAt ?? null,
          // TODO: replace with actual email/push delivery here
          message: `You have €${getRewardValue(points, redeemRate).toFixed(2)} in rewards expiring soon at ${restaurant.name}!`,
        });
      }

      return candidates;
    });
  }

  /** Preview: returns reminder candidates without marking them as sent. */
  async getExpiryReminderCandidates(restaurantId: string, ownerId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, ownerId },
      select: {
        id: true,
        loyaltyRedeemRate: true,
        loyaltyExpiryReminderDays: true,
      },
    });

    if (!restaurant) throw new Error('Forbidden');

    return this.prisma.$transaction(async (tx) => {
      const accounts = await tx.loyaltyAccount.findMany({
        where: { restaurantId, points: { gt: 0 } },
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      });

      const candidates: any[] = [];

      for (const account of accounts) {
        await expireAccountPoints(tx, account.id);

        const batches = await getExpiringPointBatches(
          tx,
          account.id,
          restaurant.loyaltyExpiryReminderDays || 15,
          new Date(),
          true, // only unnotified
        );

        if (batches.length === 0) continue;

        const points = batches.reduce((s, b) => s + b.remainingPoints, 0);
        const redeemRate = restaurant.loyaltyRedeemRate || 150;

        candidates.push({
          user: account.user,
          loyaltyAccountId: account.id,
          points,
          value: getRewardValue(points, redeemRate),
          nextExpirationAt: batches[0]?.expiresAt ?? null,
        });
      }

      return candidates;
    });
  }

  async getAnalytics(restaurantId: string, ownerId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, ownerId },
    });

    if (!restaurant) throw new Error('Forbidden');

    const accounts = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.loyaltyAccount.findMany({
        where: { restaurantId },
      });

      for (const account of existing) {
        await expireAccountPoints(tx, account.id);
      }

      return tx.loyaltyAccount.findMany({ where: { restaurantId } });
    });

    const ordersWithRedemptions = await this.prisma.order.findMany({
      where: { restaurantId, pointsRedeemed: { gt: 0 } },
    });

    return {
      totalMembers: accounts.length,
      totalPointsOutstanding: accounts.reduce((s, a) => s + a.points, 0),
      totalPointsRedeemed: ordersWithRedemptions.reduce(
        (s, o) => s + o.pointsRedeemed,
        0,
      ),
    };
  }

  /**
   * Daily cron — finds all restaurants with loyalty enabled, marks expiry
   * reminder batches as sent, and logs candidates for email/push delivery.
   * Plug in an email or push service in the TODO block below.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyExpiryReminders() {
    this.logger.log('Running daily loyalty expiry reminder job');

    const restaurants = await this.prisma.restaurant.findMany({
      where: { isLoyaltyEnabled: true },
      select: {
        id: true,
        name: true,
        loyaltyExpiryReminderDays: true,
        loyaltyRedeemRate: true,
      },
    });

    for (const restaurant of restaurants) {
      try {
        const candidates = await this.prisma.$transaction(async (tx) => {
          const accounts = await tx.loyaltyAccount.findMany({
            where: { restaurantId: restaurant.id, points: { gt: 0 } },
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          });

          const results: any[] = [];

          for (const account of accounts) {
            await expireAccountPoints(tx, account.id);

            const batches = await getExpiringPointBatches(
              tx,
              account.id,
              restaurant.loyaltyExpiryReminderDays || 15,
              new Date(),
              true,
            );

            if (batches.length === 0) continue;

            const points = batches.reduce((s, b) => s + b.remainingPoints, 0);
            await markRemindersSent(tx, batches.map((b) => b.id));

            results.push({ user: account.user, points, restaurantName: restaurant.name });
          }

          return results;
        });

        if (candidates.length > 0) {
          // TODO: call your email/push service here, e.g.:
          // await this.emailService.sendExpiryReminders(candidates);
          this.logger.log(
            `[${restaurant.name}] ${candidates.length} expiry reminders marked as sent`,
          );
        }
      } catch (err) {
        this.logger.error(
          `Expiry reminder job failed for restaurant ${restaurant.id}`,
          err,
        );
      }
    }
  }
}
