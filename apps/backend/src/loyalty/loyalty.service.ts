import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { FeatureService } from '../subscription/feature.service';
import { isLoyaltyAvailable } from './loyalty-availability.util';

const MAX_SIGNUP_BONUS = 75;

// Effective-tier fields needed to evaluate loyalty availability (#5).
const LOYALTY_TIER_FIELDS = {
  tier: true,
  forceTier: true,
  isActive: true,
} as const;

const TIER_FIELDS = {
  loyaltySilverThreshold: true,
  loyaltyGoldThreshold: true,
  loyaltySilverMultiplier: true,
  loyaltyGoldMultiplier: true,
} as const;

const LOYALTY_CONFIG_FIELDS = {
  isLoyaltyEnabled: true,
  happyHourEnable: true,
  happyHourDays: true,
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureService: FeatureService,
  ) {}

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
    const tierInfo: TierInfo = getTierInfo(account.lifetimePoints, tierConfig);
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
      expiringSoon: expiringBatches.map((b: { remainingPoints: number; expiresAt: Date }) => ({
        points: b.remainingPoints,
        value: getRewardValue(b.remainingPoints, redeemRate),
        expiresAt: b.expiresAt,
      })),
    };
  }

  async getPublicConfig(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { ...LOYALTY_CONFIG_FIELDS, ...LOYALTY_TIER_FIELDS },
    });
    // Unavailable (tier lacks LOYALTY or owner disabled it) → no config (#5).
    if (!isLoyaltyAvailable(restaurant, this.featureService)) return null;
    const { tier, forceTier, ...config } = restaurant!;
    return config;
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
        ...LOYALTY_TIER_FIELDS,
      },
    });

    if (!restaurant || !isLoyaltyAvailable(restaurant, this.featureService)) {
      return this.getPoints(userId, restaurantId);
    }

    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
      select: { ...LOYALTY_CONFIG_FIELDS, ...LOYALTY_TIER_FIELDS },
    });

    // Unavailable → surface nothing (balances stay preserved in the DB and
    // resume when loyalty is re-enabled / the tier is restored) (#5).
    if (!isLoyaltyAvailable(restaurant, this.featureService)) {
      return { points: 0, lifetimePoints: 0, restaurantConfig: null };
    }

    let expiringSoon: any[] = [];

    if (acc && restaurant) {
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

    if (!restaurant) throw new ForbiddenException('Forbidden');

    const restaurantName = restaurant.name;

    const candidates = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const accounts = await tx.loyaltyAccount.findMany({
        where: { restaurantId, points: { gt: 0 } },
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
          true, // only unnotified
        );

        if (batches.length === 0) continue;

        const points = batches.reduce((s: number, b: { remainingPoints: number }) => s + b.remainingPoints, 0);
        await markRemindersSent(
          tx,
          batches.map((b: { id: string }) => b.id),
        );

        const redeemRate = restaurant.loyaltyRedeemRate || 150;
        results.push({
          user: account.user,
          loyaltyAccountId: account.id,
          points,
          value: getRewardValue(points, redeemRate),
          nextExpirationAt: batches[0]?.expiresAt ?? null,
          message: `You have €${getRewardValue(points, redeemRate).toFixed(2)} in rewards expiring soon at ${restaurantName}!`,
        });
      }

      return results;
    });

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com';

    for (const candidate of candidates) {
      if (!candidate.user.email) continue;

      if (resendKey) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [candidate.user.email],
              subject: `Your loyalty points at ${restaurantName} are expiring soon`,
              text: `Hi ${candidate.user.name || 'there'},\n\nYou have ${candidate.points} loyalty points at ${restaurantName} expiring soon.\n\nVisit us to redeem them!\n\nThe ${restaurantName} team`,
              html: `<p style="font-family:sans-serif">Hi ${candidate.user.name || 'there'},</p><p style="font-family:sans-serif">You have <strong>${candidate.points} loyalty points</strong> at <strong>${restaurantName}</strong> expiring soon.</p><p style="font-family:sans-serif">Visit us to redeem them!</p><p style="font-family:sans-serif">The ${restaurantName} team</p>`,
            }),
          });
        } catch (emailErr) {
          this.logger.error(
            `Failed to send expiry reminder to ${candidate.user.email}`,
            emailErr,
          );
        }
      } else {
        this.logger.log(
          `[DEV] Expiry reminder for ${candidate.user.email}: ${candidate.message}`,
        );
      }
    }

    return candidates;
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

    if (!restaurant) throw new ForbiddenException('Forbidden');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

    if (!restaurant) throw new ForbiddenException('Forbidden');

    const accounts = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.loyaltyAccount.findMany({
        where: { restaurantId },
      });

      for (const account of existing) {
        await expireAccountPoints(tx, account.id);
      }

      return tx.loyaltyAccount.findMany({ where: { restaurantId } });
    });

    const [ordersWithRedemptions, customerOrderCounts, topAccount] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { restaurantId, pointsRedeemed: { gt: 0 } },
        }),
        this.prisma.order.groupBy({
          by: ['customerPhone'],
          _count: true,
          where: {
            restaurantId,
            customerPhone: { not: '' },
            status: { not: 'CANCELED' },
          },
        }),
        this.prisma.loyaltyAccount.findFirst({
          where: { restaurantId, points: { gt: 0 } },
          orderBy: { points: 'desc' },
          include: { user: { select: { name: true, email: true } } },
        }),
      ]);

    const totalCustomers = customerOrderCounts.length;
    const repeatCustomers = customerOrderCounts.filter(
      (c) => c._count > 1,
    ).length;
    const repeatRate =
      totalCustomers > 0
        ? Math.round((repeatCustomers / totalCustomers) * 1000) / 10
        : 0;

    return {
      totalMembers: accounts.length,
      totalPointsOutstanding: accounts.reduce((s: number, a: { points: number }) => s + a.points, 0),
      totalPointsRedeemed: ordersWithRedemptions.reduce(
        (s: number, o: { pointsRedeemed: number }) => s + o.pointsRedeemed,
        0,
      ),
      repeatRate,
      topMember: topAccount
        ? {
            name: topAccount.user?.name || topAccount.user?.email || 'Unknown',
            points: topAccount.points,
          }
        : null,
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
        const candidates = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

            const points = batches.reduce((s: number, b: { remainingPoints: number }) => s + b.remainingPoints, 0);
            await markRemindersSent(
              tx,
              batches.map((b: { id: string }) => b.id),
            );

            results.push({
              user: account.user,
              points,
              restaurantName: restaurant.name,
            });
          }

          return results;
        });

        if (candidates.length > 0) {
          const resendKey = process.env.RESEND_API_KEY;
          const fromEmail =
            process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com';

          for (const candidate of candidates) {
            if (!candidate.user.email) continue;

            if (resendKey) {
              try {
                await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${resendKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    from: fromEmail,
                    to: [candidate.user.email],
                    subject: `Your loyalty points at ${candidate.restaurantName} are expiring soon`,
                    text: `Hi ${candidate.user.name || 'there'},\n\nYou have ${candidate.points} loyalty points at ${candidate.restaurantName} that will expire soon.\n\nVisit us before they expire to redeem them!\n\nThe ${candidate.restaurantName} team`,
                    html: `<p style="font-family:sans-serif">Hi ${candidate.user.name || 'there'},</p><p style="font-family:sans-serif">You have <strong>${candidate.points} loyalty points</strong> at <strong>${candidate.restaurantName}</strong> that will expire soon.</p><p style="font-family:sans-serif">Visit us before they expire to redeem them!</p><p style="font-family:sans-serif">The ${candidate.restaurantName} team</p>`,
                  }),
                });
              } catch (emailErr) {
                this.logger.error(
                  `Failed to send expiry reminder to ${candidate.user.email}`,
                  emailErr,
                );
              }
            } else {
              this.logger.log(
                `[DEV] Expiry reminder for ${candidate.user.email}: ${candidate.points} pts at ${candidate.restaurantName}`,
              );
            }
          }

          this.logger.log(
            `[${restaurant.name}] ${candidates.length} expiry reminders sent`,
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
