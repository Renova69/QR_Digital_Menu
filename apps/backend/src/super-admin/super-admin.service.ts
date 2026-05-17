import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, SubscriptionTier } from '@prisma/client';

@Injectable()
export class SuperAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [totalRestaurants, totalUsers, activeSubscriptions, suspendedCount, byTierRaw] =
      await Promise.all([
        this.prisma.restaurant.count(),
        this.prisma.user.count(),
        this.prisma.restaurant.count({
          where: { stripeSubscriptionId: { not: null } },
        }),
        this.prisma.restaurant.count({
          where: { isActive: false },
        }),
        this.prisma.$queryRaw<
          Array<{ tier: string; count: bigint }>
        >(Prisma.sql`SELECT "tier", COUNT(*)::int AS "count" FROM "Restaurant" GROUP BY "tier"`),
      ]);

    const byTier: Record<string, number> = { FREE: 0, STARTER: 0, PROFESSIONAL: 0, ENTERPRISE: 0 };
    for (const row of byTierRaw) {
      byTier[row.tier] = Number(row.count);
    }

    return {
      totalRestaurants,
      totalUsers,
      byTier,
      activeSubscriptions,
      suspendedCount,
    };
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

    if (params.tier) {
      where.tier = params.tier as any;
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
          owner: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.restaurant.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit },
    };
  }

  async getTenantById(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, email: true, name: true },
        },
        _count: {
          select: { orders: true },
        },
      },
    });

    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    const paymentStats = await this.prisma.payment.aggregate({
      where: { restaurantId: id },
      _sum: { amount: true },
      _count: true,
    });

    return {
      ...restaurant,
      orderCount: restaurant._count.orders,
      paymentSummary: {
        totalAmount: paymentStats._sum.amount ?? 0,
        totalPayments: paymentStats._count,
      },
    };
  }

  async updateTier(id: string, forceTier: string | null) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    return this.prisma.restaurant.update({
      where: { id },
      data: { forceTier: forceTier as SubscriptionTier | null },
      select: {
        id: true,
        name: true,
        tier: true,
        forceTier: true,
      },
    });
  }

  async updateStatus(id: string, isActive: boolean) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    return this.prisma.restaurant.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        isActive: true,
      },
    });
  }
}
