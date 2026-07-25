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
  lockLoyaltyAccountRow,
  MAX_SIGNUP_BONUS,
} from './loyalty-ledger.utils';
import {
  getTierInfo,
  tierConfigFromRestaurant,
  TierInfo,
} from './loyalty-tiers.utils';
import { FeatureService } from '../subscription/feature.service';
import { isLoyaltyAvailable } from './loyalty-availability.util';
import { LoyaltyHistoryQueryDto } from './dto/loyalty-history-query.dto';

const EXPIRY_BATCH_SIZE = 50;

// M-ORDER-4: customer name and restaurant name are user-controlled and get
// interpolated into HTML email bodies below — escape before every use.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
      expiringSoon: expiringBatches.map(
        (b: { remainingPoints: number; expiresAt: Date }) => ({
          points: b.remainingPoints,
          value: getRewardValue(b.remainingPoints, redeemRate),
          expiresAt: b.expiresAt,
        }),
      ),
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
      const result = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          await lockLoyaltyAccountRow(tx, acc!.id);
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
        },
      );

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

    // Process each account independently in parallel with its own mini-transaction.
    // Per-account atomicity is preserved; one account failing does not roll back
    // others (fault isolation); and the outer connection is not held for N
    // sequential round-trips (#N+1-C1).
    const enriched = await Promise.all(
      accounts.map(async (account) => {
        const { updated, expiringBatches } = await this.prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            await lockLoyaltyAccountRow(tx, account.id);
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

            return { updated, expiringBatches };
          },
        );

        const summary = this.buildRewardSummary(
          updated,
          updated.restaurant,
          expiringBatches,
        );

        return {
          id: updated.id,
          points: updated.points,
          lifetimePoints: updated.lifetimePoints,
          restaurant: updated.restaurant,
          ...summary,
        };
      }),
    );

    return enriched;
  }

  async getHistory(userId: string, query: LoyaltyHistoryQueryDto) {
    const limit = query.limit ?? 25;
    const orders = await this.prisma.order.findMany({
      where: { customerId: userId },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        totalPrice: true,
        pointsEarned: true,
        pointsRedeemed: true,
        createdAt: true,
        restaurant: { select: { name: true, logoUrl: true } },
        items: {
          include: { menuItem: { select: { name: true } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    const hasMore = orders.length > limit;
    const data = hasMore ? orders.slice(0, limit) : orders;
    return {
      data,
      nextCursor: hasMore ? (data[data.length - 1]?.id ?? null) : null,
    };
  }

  private findExpiryReminderAccounts(
    restaurantId: string,
    reminderDays: number,
  ) {
    const now = new Date();
    return this.prisma.loyaltyAccount.findMany({
      take: EXPIRY_BATCH_SIZE,
      orderBy: { id: 'asc' },
      where: {
        restaurantId,
        points: { gt: 0 },
        pointLedger: {
          some: {
            type: 'EARN',
            remainingPoints: { gt: 0 },
            reminderSentAt: null,
            expiresAt: { gt: now, lte: addDays(now, reminderDays) },
          },
        },
      },
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
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

    const reminderDays = restaurant.loyaltyExpiryReminderDays || 15;
    const accounts = await this.findExpiryReminderAccounts(
      restaurantId,
      reminderDays,
    );
    const redeemRate = restaurant.loyaltyRedeemRate || 150;
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com';
    const notified: any[] = [];

    for (const account of accounts) {
      // Per-account short transaction: expire stale points, then read candidates
      const batches = await this.prisma.$transaction(async (tx) => {
        await lockLoyaltyAccountRow(tx, account.id);
        await expireAccountPoints(tx, account.id);
        return getExpiringPointBatches(
          tx,
          account.id,
          reminderDays,
          new Date(),
          true,
        );
      });

      if (batches.length === 0 || !account.user?.email) continue;

      const points = batches.reduce((s, b) => s + b.remainingPoints, 0);
      const value = getRewardValue(points, redeemRate);

      // Send first; only mark sent if delivery succeeds (Issue 14)
      let sent = true;
      if (resendKey) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: fromEmail,
              to: [account.user.email],
              subject: `Your loyalty points at ${restaurantName} are expiring soon`,
              text: `Hi ${account.user.name || 'there'},\n\nYou have ${points} loyalty points at ${restaurantName} expiring soon.\n\nVisit us to redeem them!\n\nThe ${restaurantName} team`,
              html: `<p style="font-family:sans-serif">Hi ${escapeHtml(account.user.name || 'there')},</p><p style="font-family:sans-serif">You have <strong>${points} loyalty points</strong> at <strong>${escapeHtml(restaurantName)}</strong> expiring soon.</p><p style="font-family:sans-serif">Visit us to redeem them!</p><p style="font-family:sans-serif">The ${escapeHtml(restaurantName)} team</p>`,
            }),
          });
          if (!res.ok) {
            this.logger.error(
              `Expiry reminder HTTP ${res.status} for ${account.user.email}`,
            );
            sent = false;
          }
        } catch (emailErr) {
          this.logger.error(
            `Failed to send expiry reminder to ${account.user.email}`,
            emailErr,
          );
          sent = false;
        }
      } else {
        this.logger.log(
          `[DEV] Expiry reminder for ${account.user.email}: ${points} pts at ${restaurantName}`,
        );
      }

      if (sent) {
        await this.prisma.$transaction(async (tx) =>
          markRemindersSent(
            tx,
            batches.map((b) => b.id),
          ),
        );
        notified.push({
          user: account.user,
          loyaltyAccountId: account.id,
          points,
          value,
          nextExpirationAt: batches[0]?.expiresAt ?? null,
          message: `You have €${value.toFixed(2)} in rewards expiring soon at ${restaurantName}!`,
        });
      }
    }

    return notified;
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

    const candidates: any[] = [];
    const reminderDays = restaurant.loyaltyExpiryReminderDays || 15;
    const accounts = await this.findExpiryReminderAccounts(
      restaurantId,
      reminderDays,
    );
    const redeemRate = restaurant.loyaltyRedeemRate || 150;

    for (const account of accounts) {
      if (!account.user?.email) continue;

      const batches = await this.prisma.$transaction(async (tx) => {
        await lockLoyaltyAccountRow(tx, account.id);
        await expireAccountPoints(tx, account.id);
        return getExpiringPointBatches(
          tx,
          account.id,
          reminderDays,
          new Date(),
          true,
        );
      });

      if (batches.length === 0) continue;

      const points = batches.reduce((s, b) => s + b.remainingPoints, 0);
      candidates.push({
        user: account.user,
        loyaltyAccountId: account.id,
        points,
        value: getRewardValue(points, redeemRate),
        nextExpirationAt: batches[0]?.expiresAt ?? null,
      });
    }

    return candidates;
  }

  async getAnalytics(restaurantId: string, ownerId: string) {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: { id: restaurantId, ownerId },
    });

    if (!restaurant) throw new ForbiddenException('Forbidden');

    // Read-only — expiry runs in cron; no writes inside an analytics fetch
    // (Issue 12). #M10: aggregate in the DB instead of loading every account /
    // redeemed order into memory just to sum — these tables grow unboundedly.
    const [accountAgg, redeemedAgg, customerOrderCounts, topAccount] =
      await Promise.all([
        this.prisma.loyaltyAccount.aggregate({
          where: { restaurantId },
          _count: { _all: true },
          _sum: { points: true },
        }),
        this.prisma.order.aggregate({
          where: {
            restaurantId,
            pointsRedeemed: { gt: 0 },
            status: { not: 'CANCELED' },
          },
          _sum: { pointsRedeemed: true },
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
      totalMembers: accountAgg._count._all,
      totalPointsOutstanding: accountAgg._sum.points ?? 0,
      totalPointsRedeemed: redeemedAgg._sum.pointsRedeemed ?? 0,
      repeatRate,
      topMember: topAccount
        ? {
            name: topAccount.user?.name || topAccount.user?.email || '',
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
        isLoyaltyEnabled: true,
        ...LOYALTY_TIER_FIELDS,
      },
    });

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com';

    for (const restaurant of restaurants) {
      // #5: a downgraded tenant keeps isLoyaltyEnabled=true but loses the
      // LOYALTY feature — don't email reminders for an unentitled restaurant.
      if (!isLoyaltyAvailable(restaurant, this.featureService)) continue;
      try {
        let cursor: string | undefined;
        let totalSent = 0;
        const reminderDays = restaurant.loyaltyExpiryReminderDays || 15;

        // Cursor-paginated: process EXPIRY_BATCH_SIZE accounts per iteration (Issue 13)
        do {
          const accounts = await this.prisma.loyaltyAccount.findMany({
            take: EXPIRY_BATCH_SIZE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            orderBy: { id: 'asc' },
            where: { restaurantId: restaurant.id, points: { gt: 0 } },
            include: {
              user: { select: { id: true, email: true, name: true } },
            },
          });

          for (const account of accounts) {
            const batches = await this.prisma.$transaction(async (tx) => {
              await lockLoyaltyAccountRow(tx, account.id);
              await expireAccountPoints(tx, account.id);
              return getExpiringPointBatches(
                tx,
                account.id,
                reminderDays,
                new Date(),
                true,
              );
            });

            if (batches.length === 0 || !account.user?.email) continue;

            const points = batches.reduce((s, b) => s + b.remainingPoints, 0);

            // Send first; only mark sent on confirmed delivery (Issue 14)
            let sent = true;
            if (resendKey) {
              try {
                const res = await fetch('https://api.resend.com/emails', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${resendKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    from: fromEmail,
                    to: [account.user.email],
                    subject: `Your loyalty points at ${restaurant.name} are expiring soon`,
                    text: `Hi ${account.user.name || 'there'},\n\nYou have ${points} loyalty points at ${restaurant.name} that will expire soon.\n\nVisit us before they expire to redeem them!\n\nThe ${restaurant.name} team`,
                    html: `<p style="font-family:sans-serif">Hi ${escapeHtml(account.user.name || 'there')},</p><p style="font-family:sans-serif">You have <strong>${points} loyalty points</strong> at <strong>${escapeHtml(restaurant.name)}</strong> that will expire soon.</p><p style="font-family:sans-serif">Visit us before they expire to redeem them!</p><p style="font-family:sans-serif">The ${escapeHtml(restaurant.name)} team</p>`,
                  }),
                });
                if (!res.ok) {
                  this.logger.error(
                    `Expiry reminder HTTP ${res.status} for ${account.user.email}`,
                  );
                  sent = false;
                }
              } catch (emailErr) {
                this.logger.error(
                  `Failed to send expiry reminder to ${account.user.email}`,
                  emailErr,
                );
                sent = false;
              }
            } else {
              this.logger.log(
                `[DEV] Expiry reminder for ${account.user.email}: ${points} pts at ${restaurant.name}`,
              );
            }

            if (sent) {
              await this.prisma.$transaction(async (tx) =>
                markRemindersSent(
                  tx,
                  batches.map((b) => b.id),
                ),
              );
              totalSent++;
            }
          }

          cursor =
            accounts.length === EXPIRY_BATCH_SIZE
              ? accounts.at(-1)!.id
              : undefined;
        } while (cursor);

        if (totalSent > 0) {
          this.logger.log(
            `[${restaurant.name}] ${totalSent} expiry reminders sent`,
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
