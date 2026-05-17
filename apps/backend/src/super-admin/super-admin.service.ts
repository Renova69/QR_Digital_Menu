import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SubscriptionTier } from '@prisma/client';

const VALID_TIERS: readonly string[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];

@Injectable()
export class SuperAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [totalRestaurants, totalUsers, activeSubscriptions, suspendedCount, tierDistribution] =
      await Promise.all([
        this.prisma.restaurant.count(),
        this.prisma.user.count(),
        this.prisma.restaurant.count({
          where: { tier: { not: SubscriptionTier.FREE }, isActive: true },
        }),
        this.prisma.restaurant.count({ where: { isActive: false } }),
        this.prisma.restaurant.groupBy({ by: ['tier'], _count: { _all: true } }),
      ]);

    const byTier: Record<string, number> = { FREE: 0, STARTER: 0, PROFESSIONAL: 0, ENTERPRISE: 0 };
    for (const row of tierDistribution) {
      byTier[row.tier] = row._count._all;
    }

    return { totalRestaurants, totalUsers, byTier, activeSubscriptions, suspendedCount };
  }

  async getTenants(params: {
    page?: number;
    limit?: number;
    search?: string;
    tier?: string;
    status?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.RestaurantWhereInput = {};

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { owner: { email: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    if (params.tier && VALID_TIERS.includes(params.tier)) {
      where.tier = params.tier as SubscriptionTier;
    }

    if (params.status === 'suspended') {
      where.isActive = false;
    } else if (params.status === 'active') {
      where.isActive = true;
    }

    const [data, total] = await Promise.all([
      this.prisma.restaurant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          tier: true,
          forceTier: true,
          isActive: true,
          stripeOnboarded: true,
          paymentsEnabled: true,
          createdAt: true,
          owner: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.restaurant.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async getTenantById(id: string) {
    const tenant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        tier: true,
        forceTier: true,
        isActive: true,
        tierUpdatedAt: true,
        createdAt: true,
        timezone: true,
        targetLanguages: true,
        paymentsEnabled: true,
        stripeOnboarded: true,
        owner: { select: { id: true, email: true, name: true, createdAt: true } },
        _count: { select: { menuCategories: true, orders: true, tables: true } },
      },
    });

    if (!tenant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    const paymentStats = await this.prisma.payment.aggregate({
      where: { restaurantId: id },
      _sum: { amount: true },
      _count: true,
    });

    return {
      ...tenant,
      orderCount: tenant._count.orders,
      menuCategoryCount: tenant._count.menuCategories,
      tableCount: tenant._count.tables,
      paymentSummary: {
        totalAmount: Number(paymentStats._sum.amount ?? 0),
        totalPayments: paymentStats._count,
      },
    };
  }

  async updateTier(id: string, forceTier: string | null, actorUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, tier: true, forceTier: true },
    });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    const results = await this.prisma.$transaction([
      this.prisma.restaurant.update({
        where: { id },
        data: { forceTier: forceTier as SubscriptionTier | null },
        select: { id: true, name: true, tier: true, forceTier: true },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: forceTier ? 'TIER_OVERRIDE' : 'TIER_CLEAR',
          targetType: 'RESTAURANT',
          targetId: id,
          metadata: {
            previousForceTier: restaurant.forceTier ?? null,
            newForceTier: forceTier,
            stripeTier: restaurant.tier,
          },
        },
      }),
    ]);

    return results[0];
  }

  async updateStatus(id: string, isActive: boolean, actorUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, isActive: true },
    });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    const results = await this.prisma.$transaction([
      this.prisma.restaurant.update({
        where: { id },
        data: { isActive },
        select: { id: true, name: true, isActive: true },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: isActive ? 'REACTIVATE' : 'SUSPEND',
          targetType: 'RESTAURANT',
          targetId: id,
          metadata: { previousIsActive: restaurant.isActive },
        },
      }),
    ]);

    return results[0];
  }

  async getAuditLog(params: { page: number; limit: number; targetId?: string }) {
    const { page, limit, targetId } = params;
    const skip = (page - 1) * limit;
    const where: Prisma.AdminAuditLogWhereInput = targetId ? { targetId } : {};

    const [data, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          metadata: true,
          createdAt: true,
          actor: { select: { email: true, name: true } },
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }
}
