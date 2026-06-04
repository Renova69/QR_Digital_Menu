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

const VALID_TIERS: readonly string[] = [
  'FREE',
  'STARTER',
  'PROFESSIONAL',
  'ENTERPRISE',
];
const TIER_RANK: Record<string, number> = {
  FREE: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

function emptyTierCounts(): Record<string, number> {
  return { FREE: 0, STARTER: 0, PROFESSIONAL: 0, ENTERPRISE: 0 };
}

function clampPage(value?: number): number {
  return Math.max(1, value ?? 1);
}

function clampLimit(value?: number): number {
  return Math.max(1, Math.min(value ?? 20, 100));
}

function parseOptionalDate(value: string | undefined, field: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException({
      code: 'INVALID_DATE',
      message: `${field} must be a valid date`,
    });
  }
  return date;
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
      allTiers,
      forcedTierList,
      paymentsNotOnboarded,
      paymentsNotOnboardedCount,
      emptyMenuList,
      emptyMenuCount,
      noTableList,
      noTableCount,
      inactiveList,
      inactiveCount,
    ] = await Promise.all([
      this.prisma.restaurant.count({ where: { deletedAt: null } }),
      this.prisma.restaurant.count({
        where: { isActive: true, deletedAt: null },
      }),
      this.prisma.restaurant.count({ where: { deletedAt: { not: null } } }),
      this.prisma.user.count(),
      this.prisma.restaurant.count({
        where: { isActive: false, deletedAt: null },
      }),
      this.prisma.restaurant.count({
        where: {
          tier: { not: SubscriptionTier.FREE },
          isActive: true,
          deletedAt: null,
        },
      }),
      this.prisma.restaurant.count({
        where: {
          stripeSubscriptionId: { not: null },
          isActive: true,
          deletedAt: null,
        },
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
      this.prisma.restaurant.count({
        where: { createdAt: { gte: sevenDaysAgo }, deletedAt: null },
      }),
      this.prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.order.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
      this.prisma.payment.aggregate({
        where: { createdAt: { gte: sevenDaysAgo }, status: 'SUCCEEDED' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.restaurant.findMany({
        where: { deletedAt: null },
        select: { tier: true, forceTier: true },
      }),
      this.prisma.restaurant.findMany({
        where: { forceTier: { not: null }, deletedAt: null },
        select: {
          id: true,
          name: true,
          tier: true,
          forceTier: true,
          owner: { select: { email: true } },
        },
      }),
      this.prisma.restaurant.findMany({
        where: {
          paymentsEnabled: true,
          stripeOnboarded: false,
          deletedAt: null,
        },
        select: {
          id: true,
          name: true,
          tier: true,
          forceTier: true,
          owner: { select: { email: true } },
        },
        take: 5,
      }),
      this.prisma.restaurant.count({
        where: {
          paymentsEnabled: true,
          stripeOnboarded: false,
          deletedAt: null,
        },
      }),
      this.prisma.restaurant.findMany({
        where: { menuCategories: { none: {} }, deletedAt: null },
        select: { id: true, name: true, owner: { select: { email: true } } },
        take: 5,
      }),
      this.prisma.restaurant.count({
        where: { menuCategories: { none: {} }, deletedAt: null },
      }),
      this.prisma.restaurant.findMany({
        where: { tables: { none: {} }, deletedAt: null },
        select: { id: true, name: true, owner: { select: { email: true } } },
        take: 5,
      }),
      this.prisma.restaurant.count({
        where: { tables: { none: {} }, deletedAt: null },
      }),
      this.prisma.restaurant.findMany({
        where: { isActive: false, deletedAt: null },
        select: { id: true, name: true, owner: { select: { email: true } } },
        take: 5,
      }),
      this.prisma.restaurant.count({
        where: { isActive: false, deletedAt: null },
      }),
    ]);

    const byBillingTier = emptyTierCounts();
    for (const row of tierDistribution) {
      byBillingTier[row.tier] = row._count._all;
    }

    const byEffectiveTier = emptyTierCounts();
    for (const t of allTiers) {
      const effectiveTier = t.forceTier ?? t.tier;
      byEffectiveTier[effectiveTier] =
        (byEffectiveTier[effectiveTier] ?? 0) + 1;
    }

    const forcedOverrides: Array<{
      id: string;
      name: string;
      ownerEmail: string;
      billingTier: string;
      effectiveTier: string;
      direction: string;
    }> = [];
    let forcedUpgrades = 0;
    let forcedDowngrades = 0;

    for (const tenant of forcedTierList) {
      const direction =
        TIER_RANK[tenant.forceTier!] > TIER_RANK[tenant.tier]
          ? 'upgrade'
          : TIER_RANK[tenant.forceTier!] < TIER_RANK[tenant.tier]
            ? 'downgrade'
            : 'same';
      if (direction === 'upgrade') forcedUpgrades += 1;
      if (direction === 'downgrade') forcedDowngrades += 1;
      forcedOverrides.push({
        id: tenant.id,
        name: tenant.name,
        ownerEmail: tenant.owner.email,
        billingTier: tenant.tier,
        effectiveTier: tenant.forceTier!,
        direction,
      });
    }

    const userRoles: Record<string, number> = {};
    for (const row of userRoleDistribution) {
      userRoles[row.role] = row._count._all;
    }

    const attentionNeeded = {
      forcedOverrides: {
        count: forcedTierList.length,
        items: forcedOverrides.slice(0, 5),
      },
      paymentsNotOnboarded: {
        count: paymentsNotOnboardedCount,
        items: paymentsNotOnboarded.map((t) => ({
          id: t.id,
          name: t.name,
          ownerEmail: t.owner.email,
          billingTier: t.tier,
          effectiveTier: t.forceTier ?? t.tier,
        })),
      },
      emptyMenus: {
        count: emptyMenuCount,
        items: emptyMenuList.map((t) => ({
          id: t.id,
          name: t.name,
          ownerEmail: t.owner.email,
        })),
      },
      noTables: {
        count: noTableCount,
        items: noTableList.map((t) => ({
          id: t.id,
          name: t.name,
          ownerEmail: t.owner.email,
        })),
      },
      inactiveTenants: {
        count: inactiveCount,
        items: inactiveList.map((t) => ({
          id: t.id,
          name: t.name,
          ownerEmail: t.owner.email,
        })),
      },
    };

    return {
      totalRestaurants,
      activeRestaurants,
      deletedRestaurants,
      totalUsers,
      userRoles,
      byBillingTier,
      byEffectiveTier,
      paidPlanTenants,
      stripeLinkedSubscriptions,
      suspendedCount,
      forcedOverrideCount: forcedTierList.length,
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
    subscription?: string;
  }) {
    const page = clampPage(params.page);
    const limit = clampLimit(params.limit);
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

    if (params.subscription === 'active') {
      where.stripeSubscriptionId = { not: null };
    } else if (params.subscription === 'none') {
      where.stripeSubscriptionId = null;
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
          stripeSubscriptionId: true,
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
        owner: {
          select: { id: true, email: true, name: true, createdAt: true },
        },
        staffMembers: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
          },
        },
        _count: {
          select: { menuCategories: true, orders: true, tables: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });
    }

    const paymentStats = await this.prisma.payment.aggregate({
      where: { restaurantId: id },
      _sum: { amount: true },
      _count: true,
    });

    const { _count, ...tenantFields } = tenant;
    return {
      ...tenantFields,
      orderCount: _count.orders,
      menuCategoryCount: _count.menuCategories,
      tableCount: _count.tables,
      paymentSummary: {
        totalAmount: Number(paymentStats._sum.amount ?? 0),
        totalPayments: paymentStats._count,
      },
    };
  }

  async updateTier(
    id: string,
    forceTier: string | null,
    actorUserId: string,
    forceTierExpiresInDays?: number | null,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, tier: true, forceTier: true },
    });
    if (!restaurant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });
    }

    // Expiry only applies while an override is active (M-2). Clearing the
    // override (forceTier=null) always nulls the expiry too.
    const forceTierExpiresAt =
      forceTier && forceTierExpiresInDays
        ? new Date(Date.now() + forceTierExpiresInDays * 24 * 60 * 60 * 1000)
        : null;

    // Skip the write only when nothing changes — same tier AND no new expiry
    // window requested (a fresh expiry on the same tier is still a real change).
    if (restaurant.forceTier === forceTier && !forceTierExpiresAt) {
      return restaurant;
    }

    const results = await this.prisma.$transaction([
      this.prisma.restaurant.update({
        where: { id },
        data: {
          forceTier: forceTier as SubscriptionTier | null,
          forceTierExpiresAt,
        },
        select: {
          id: true,
          name: true,
          tier: true,
          forceTier: true,
          forceTierExpiresAt: true,
        },
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
            forceTierExpiresAt: forceTierExpiresAt?.toISOString() ?? null,
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
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });
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

  async resetOwnerPassword(
    id: string,
    newPassword: string,
    actorUserId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, ownerId: true, name: true },
    });
    if (!restaurant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: restaurant.ownerId },
        data: { password: hashedPassword, passwordChangedAt: new Date() },
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

  async updatePaymentsEnabled(
    id: string,
    paymentsEnabled: boolean,
    actorUserId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { id: true, paymentsEnabled: true, tier: true, forceTier: true },
    });
    if (!restaurant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });
    }

    if (restaurant.paymentsEnabled === paymentsEnabled) return restaurant;

    if (paymentsEnabled) {
      const effectiveTier = restaurant.forceTier ?? restaurant.tier;
      if (effectiveTier !== 'PROFESSIONAL' && effectiveTier !== 'ENTERPRISE') {
        throw new BadRequestException({
          code: 'TIER_RESTRICTED',
          message: `Payments require PROFESSIONAL or ENTERPRISE tier. Current effective tier: ${effectiveTier}.`,
        });
      }
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
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });
    }
    if (restaurant.deletedAt) {
      throw new BadRequestException({
        code: 'ALREADY_DELETED',
        message: 'Restaurant already deleted',
      });
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
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });
    }
    if (!restaurant.deletedAt) {
      throw new BadRequestException({
        code: 'NOT_DELETED',
        message: 'Restaurant is not deleted',
      });
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

  async deleteStaff(
    restaurantId: string,
    staffId: string,
    actorUserId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: staffId },
      select: { id: true, email: true, role: true, restaurantId: true },
    });

    if (!user)
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      });
    if (user.restaurantId !== restaurantId) {
      throw new BadRequestException({
        code: 'NOT_STAFF',
        message: 'User is not staff of this restaurant',
      });
    }
    if (user.role === 'OWNER' || user.role === 'SUPER_ADMIN') {
      throw new BadRequestException({
        code: 'PROTECTED_ROLE',
        message: 'Cannot delete an OWNER or SUPER_ADMIN via staff deletion',
      });
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

  async importMenu(
    restaurantId: string,
    dto: ImportMenuDto,
    actorUserId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });
    if (!restaurant) {
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });
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

  async getAuditLog(params: {
    page: number;
    limit: number;
    targetId?: string;
    action?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const { targetId, action, dateFrom, dateTo } = params;
    const page = clampPage(params.page);
    const limit = clampLimit(params.limit);
    const skip = (page - 1) * limit;
    const where: Prisma.AdminAuditLogWhereInput = {};

    if (targetId) where.targetId = targetId;
    if (action) where.action = action;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      const parsedFrom = parseOptionalDate(dateFrom, 'dateFrom');
      const parsedTo = parseOptionalDate(dateTo, 'dateTo');
      if (parsedFrom) where.createdAt.gte = parsedFrom;
      if (parsedTo) where.createdAt.lte = parsedTo;
    }

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
