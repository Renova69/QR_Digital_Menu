import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MenuImportService } from '../menu-import/menu-import.service';
import { ImportMenuDto } from '../menu-import/dto/import-menu.dto';
import { Prisma, SubscriptionTier } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const VALID_TIERS: readonly string[] = ['FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
const TIER_RANK: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

function emptyTierCounts(): Record<string, number> {
  return { FREE: 0, STARTER: 0, PROFESSIONAL: 0, ENTERPRISE: 0 };
}

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly menuImport: MenuImportService,
  ) {}

  async getStats() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      totalRestaurants,
      activeRestaurants,
      deletedRestaurants,
      totalUsers,
      suspendedCount,
      paidPlanTenants,
      stripeLinkedSubscriptions,
      tierDistribution,
      userRoleDistribution,
      recentRestaurants,
      recentUsers,
      ordersLast24h,
      ordersLast7d,
      paymentsLast7d,
      tenants,
    ] = await Promise.all([
        this.prisma.restaurant.count({ where: { deletedAt: null } }),
        this.prisma.restaurant.count({ where: { isActive: true, deletedAt: null } }),
        this.prisma.restaurant.count({ where: { deletedAt: { not: null } } }),
        this.prisma.user.count(),
        this.prisma.restaurant.count({ where: { isActive: false, deletedAt: null } }),
        this.prisma.restaurant.count({
          where: { tier: { not: SubscriptionTier.FREE }, isActive: true, deletedAt: null },
        }),
        this.prisma.restaurant.count({
          where: { stripeSubscriptionId: { not: null }, isActive: true, deletedAt: null },
        }),
        this.prisma.restaurant.groupBy({
          by: ['tier'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.user.groupBy({
          by: ['role'],
          _count: { _all: true },
        }),
        this.prisma.restaurant.count({ where: { createdAt: { gte: sevenDaysAgo }, deletedAt: null } }),
        this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        this.prisma.order.count({ where: { createdAt: { gte: twentyFourHoursAgo } } }),
        this.prisma.order.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
        this.prisma.payment.aggregate({
          where: { createdAt: { gte: sevenDaysAgo }, status: 'SUCCEEDED' },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.restaurant.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            tier: true,
            forceTier: true,
            paymentsEnabled: true,
            stripeOnboarded: true,
            stripeSubscriptionId: true,
            isActive: true,
            createdAt: true,
            owner: { select: { email: true } },
            _count: { select: { menuCategories: true, tables: true, orders: true } },
          },
        }),
      ]);

    const byBillingTier = emptyTierCounts();
    for (const row of tierDistribution) {
      byBillingTier[row.tier] = row._count._all;
    }

    const byEffectiveTier = emptyTierCounts();
    const forcedOverrides = [];
    let forcedUpgrades = 0;
    let forcedDowngrades = 0;

    for (const tenant of tenants) {
      const effectiveTier = tenant.forceTier ?? tenant.tier;
      byEffectiveTier[effectiveTier] = (byEffectiveTier[effectiveTier] ?? 0) + 1;

      if (tenant.forceTier) {
        const direction =
          TIER_RANK[tenant.forceTier] > TIER_RANK[tenant.tier]
            ? 'upgrade'
            : TIER_RANK[tenant.forceTier] < TIER_RANK[tenant.tier]
              ? 'downgrade'
              : 'same';
        if (direction === 'upgrade') forcedUpgrades += 1;
        if (direction === 'downgrade') forcedDowngrades += 1;
        forcedOverrides.push({
          id: tenant.id,
          name: tenant.name,
          ownerEmail: tenant.owner.email,
          billingTier: tenant.tier,
          effectiveTier,
          direction,
        });
      }
    }

    const userRoles: Record<string, number> = {};
    for (const row of userRoleDistribution) {
      userRoles[row.role] = row._count._all;
    }

    const paymentsNotOnboarded = tenants
      .filter((tenant) => tenant.paymentsEnabled && !tenant.stripeOnboarded)
      .map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        ownerEmail: tenant.owner.email,
        billingTier: tenant.tier,
        effectiveTier: tenant.forceTier ?? tenant.tier,
      }));
    const emptyMenus = tenants
      .filter((tenant) => tenant._count.menuCategories === 0)
      .map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        ownerEmail: tenant.owner.email,
      }));
    const noTables = tenants
      .filter((tenant) => tenant._count.tables === 0)
      .map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        ownerEmail: tenant.owner.email,
      }));
    const inactiveTenants = tenants
      .filter((tenant) => !tenant.isActive)
      .map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        ownerEmail: tenant.owner.email,
      }));

    const attentionNeeded = {
      forcedOverrides: { count: forcedOverrides.length, items: forcedOverrides.slice(0, 5) },
      paymentsNotOnboarded: { count: paymentsNotOnboarded.length, items: paymentsNotOnboarded.slice(0, 5) },
      emptyMenus: { count: emptyMenus.length, items: emptyMenus.slice(0, 5) },
      noTables: { count: noTables.length, items: noTables.slice(0, 5) },
      inactiveTenants: { count: inactiveTenants.length, items: inactiveTenants.slice(0, 5) },
    };

    return {
      totalRestaurants,
      activeRestaurants,
      deletedRestaurants,
      totalUsers,
      userRoles,
      byTier: byBillingTier,
      byBillingTier,
      byEffectiveTier,
      activeSubscriptions: paidPlanTenants,
      paidPlanTenants,
      stripeLinkedSubscriptions,
      suspendedCount,
      forcedOverrideCount: forcedOverrides.length,
      forcedUpgrades,
      forcedDowngrades,
      recent: {
        restaurants7d: recentRestaurants,
        users7d: recentUsers,
        orders24h: ordersLast24h,
        orders7d: ordersLast7d,
        payments7d: {
          count: paymentsLast7d._count,
          amount: Number(paymentsLast7d._sum.amount ?? 0),
        },
      },
      attentionNeeded,
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
    const limit = Math.min(params.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.RestaurantWhereInput = {};

    if (params.status === 'deleted') {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
      if (params.status === 'suspended') where.isActive = false;
      else if (params.status === 'active') where.isActive = true;
    }

    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { owner: { email: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    if (params.tier && VALID_TIERS.includes(params.tier)) {
      where.tier = params.tier as SubscriptionTier;
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
          deletedAt: true,
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
        deletedAt: true,
        tierUpdatedAt: true,
        createdAt: true,
        timezone: true,
        targetLanguages: true,
        paymentsEnabled: true,
        stripeOnboarded: true,
        owner: { select: { id: true, email: true, name: true, createdAt: true } },
        staffMembers: { select: { id: true, email: true, name: true, role: true, createdAt: true } },
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

  async resetOwnerPassword(id: string, newPassword: string, actorUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, ownerId: true, name: true },
    });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: restaurant.ownerId },
        data: { password: hashedPassword },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'OWNER_PASSWORD_RESET',
          targetType: 'USER',
          targetId: restaurant.ownerId,
          metadata: { restaurantId: id, restaurantName: restaurant.name },
        },
      }),
    ]);

    return { success: true };
  }

  async updatePaymentsEnabled(id: string, paymentsEnabled: boolean, actorUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, paymentsEnabled: true },
    });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    const results = await this.prisma.$transaction([
      this.prisma.restaurant.update({
        where: { id },
        data: { paymentsEnabled },
        select: { id: true, name: true, paymentsEnabled: true },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: paymentsEnabled ? 'PAYMENTS_ENABLED' : 'PAYMENTS_DISABLED',
          targetType: 'RESTAURANT',
          targetId: id,
          metadata: { previousPaymentsEnabled: restaurant.paymentsEnabled },
        },
      }),
    ]);

    return results[0];
  }

  async deleteRestaurant(id: string, actorUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }
    if (restaurant.deletedAt) {
      throw new BadRequestException({ code: 'ALREADY_DELETED', message: 'Restaurant already deleted' });
    }

    const results = await this.prisma.$transaction([
      this.prisma.restaurant.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
        select: { id: true, name: true, deletedAt: true, isActive: true },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'DELETE',
          targetType: 'RESTAURANT',
          targetId: id,
          metadata: { name: restaurant.name },
        },
      }),
    ]);

    return results[0];
  }

  async restoreRestaurant(id: string, actorUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, name: true, deletedAt: true },
    });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }
    if (!restaurant.deletedAt) {
      throw new BadRequestException({ code: 'NOT_DELETED', message: 'Restaurant is not deleted' });
    }

    const results = await this.prisma.$transaction([
      this.prisma.restaurant.update({
        where: { id },
        data: { deletedAt: null, isActive: true },
        select: { id: true, name: true, deletedAt: true, isActive: true },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'RESTORE',
          targetType: 'RESTAURANT',
          targetId: id,
          metadata: { name: restaurant.name },
        },
      }),
    ]);

    return results[0];
  }

  async deleteStaff(restaurantId: string, staffId: string, actorUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: staffId },
      select: { id: true, email: true, role: true, restaurantId: true },
    });

    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });
    if (user.restaurantId !== restaurantId) {
      throw new BadRequestException({ code: 'NOT_STAFF', message: 'User is not staff of this restaurant' });
    }

    const ownsRestaurant = await this.prisma.restaurant.findFirst({
      where: { ownerId: staffId },
      select: { id: true },
    });
    if (ownsRestaurant) {
      throw new BadRequestException({ code: 'IS_OWNER', message: 'Cannot delete restaurant owner' });
    }

    await this.prisma.$transaction([
      this.prisma.user.delete({ where: { id: staffId } }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'DELETE_STAFF',
          targetType: 'USER',
          targetId: staffId,
          metadata: { email: user.email, restaurantId },
        },
      }),
    ]);

    return { success: true };
  }

  async importMenu(restaurantId: string, dto: ImportMenuDto, actorUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });
    if (!restaurant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Restaurant not found' });
    }

    const stats = await this.menuImport.upsertMenu(restaurantId, dto);

    await this.prisma.adminAuditLog.create({
      data: {
        actorUserId,
        action: 'MENU_IMPORT',
        targetType: 'RESTAURANT',
        targetId: restaurantId,
        metadata: { stats },
      },
    });

    return stats;
  }

  async getAuditLog(params: { page: number; limit: number; targetId?: string }) {
    const { page, targetId } = params;
    const limit = Math.min(params.limit, 100);
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
