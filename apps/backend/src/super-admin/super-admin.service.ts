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
import { EventsGateway } from '../events/events.gateway';
import { randomBytes, createHash } from 'crypto';

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
  const n = Number.isFinite(value) ? (value as number) : 1;
  return Math.max(1, n);
}

function clampLimit(value?: number): number {
  const n = Number.isFinite(value) ? (value as number) : 20;
  return Math.max(1, Math.min(n, 100));
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
    private readonly events: EventsGateway,
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
        forceTierExpiresAt: true,
        isActive: true,
        deletedAt: true,
        tierUpdatedAt: true,
        createdAt: true,
        timezone: true,
        targetLanguages: true,
        paymentsEnabled: true,
        stripeOnboarded: true,
        stripeSubscriptionId: true,
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
      where: { restaurantId: id, status: 'SUCCEEDED' },
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
      select: { id: true, isActive: true, ownerId: true },
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

    if (!isActive) {
      const users = await this.prisma.user.findMany({
        where: {
          OR: [{ id: restaurant.ownerId }, { restaurantId: id }],
        },
        select: { id: true },
      });
      for (const user of users) {
        void this.events.evictUser(user.id, 'restaurant_suspended');
      }
    }

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
      this.prisma.order.updateMany({
        where: { staffUserId: staffId },
        data: { staffUserId: null },
      }),
      this.prisma.order.updateMany({
        where: { customerId: staffId },
        data: { customerId: null },
      }),
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
    const postCommitCleanup: Array<() => Promise<void>> = [];
    const stats = await this.prisma.$transaction(
      async (tx) => {
        const restaurant = await tx.restaurant.findUnique({
          where: { id: restaurantId },
          select: { id: true },
        });
        if (!restaurant) {
          throw new NotFoundException({
            code: 'TENANT_NOT_FOUND',
            message: 'Restaurant not found',
          });
        }

        const stats = await this.menuImport.upsertMenu(
          restaurantId,
          dto,
          tx,
          postCommitCleanup,
        );

        await tx.adminAuditLog.create({
          data: {
            actorUserId,
            action: 'MENU_IMPORT',
            targetType: 'RESTAURANT',
            targetId: restaurantId,
            metadata: { stats },
          },
        });

        return stats;
      },
      { timeout: 60000 },
    );

    await Promise.all(postCommitCleanup.map((cleanup) => cleanup()));
    return stats;
  }

  async forceLogoutOwner(restaurantId: string, actorUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, ownerId: true },
    });
    if (!restaurant)
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: restaurant.ownerId },
        data: { passwordChangedAt: new Date() },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'FORCE_LOGOUT',
          targetType: 'USER',
          targetId: restaurant.ownerId,
          metadata: { restaurantId, restaurantName: restaurant.name },
        },
      }),
    ]);

    void this.events.evictUser(restaurant.ownerId, 'admin_force_logout');
    return { success: true };
  }

  async regenerateImportApiKey(restaurantId: string, actorUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true },
    });
    if (!restaurant)
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });

    const apiKey = 'ocrk_' + randomBytes(24).toString('hex');
    const hash = createHash('sha256').update(apiKey).digest('hex');

    await this.prisma.$transaction([
      this.prisma.restaurant.update({
        where: { id: restaurantId },
        data: { importApiKeyHash: hash },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'REGENERATE_IMPORT_API_KEY',
          targetType: 'RESTAURANT',
          targetId: restaurantId,
          metadata: { restaurantName: restaurant.name },
        },
      }),
    ]);

    return { apiKey };
  }

  async getTenantSessions(restaurantId: string, page: number, limit: number) {
    const p = Math.max(1, page);
    const l = Math.max(1, Math.min(limit, 100));
    const [data, total] = await Promise.all([
      this.prisma.tableSession.findMany({
        where: { restaurantId, status: { in: ['OPEN', 'PAID'] } },
        skip: (p - 1) * l,
        take: l,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          token: true,
          tableId: true,
          status: true,
          createdAt: true,
          paidAt: true,
          table: { select: { name: true } },
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.tableSession.count({
        where: { restaurantId, status: { in: ['OPEN', 'PAID'] } },
      }),
    ]);
    return { data, meta: { total, page: p, limit: l } };
  }

  async forceCloseSession(
    restaurantId: string,
    sessionId: string,
    actorUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          token: string;
          restaurantId: string;
          status: 'OPEN' | 'PAID' | 'CLOSED_PAID' | 'CLOSED_NO_PAYMENT';
        }>
      >(Prisma.sql`
        SELECT "id", "token", "restaurantId", "status"
        FROM "table_session"
        WHERE "id" = ${sessionId}
        FOR UPDATE
      `);
      const session = rows[0];
      if (!session) {
        throw new NotFoundException({
          code: 'SESSION_NOT_FOUND',
          message: 'Session not found',
        });
      }
      if (session.restaurantId !== restaurantId) {
        throw new BadRequestException({
          code: 'SESSION_MISMATCH',
          message: 'Session does not belong to this restaurant',
        });
      }
      if (
        session.status === 'CLOSED_NO_PAYMENT' ||
        session.status === 'CLOSED_PAID'
      ) {
        throw new BadRequestException({
          code: 'ALREADY_CLOSED',
          message: 'Session already closed',
        });
      }

      // Derive the terminal state only after locking and re-reading the row so
      // a concurrent successful settlement cannot be overwritten as unpaid.
      const nextStatus =
        session.status === 'PAID' ? 'CLOSED_PAID' : 'CLOSED_NO_PAYMENT';
      const updated = await tx.tableSession.update({
        where: { id: sessionId },
        data: { status: nextStatus },
        select: { id: true, status: true },
      });
      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'FORCE_CLOSE_SESSION',
          targetType: 'TABLE_SESSION',
          targetId: sessionId,
          metadata: {
            restaurantId,
            token: session.token,
            previousStatus: session.status,
            status: nextStatus,
          },
        },
      });
      return updated;
    });
  }

  async getLoyaltyAccounts(restaurantId: string) {
    return this.prisma.loyaltyAccount.findMany({
      where: { restaurantId },
      select: {
        id: true,
        points: true,
        lifetimePoints: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { points: 'desc' },
      take: 100,
    });
  }

  async adjustLoyaltyPoints(
    restaurantId: string,
    loyaltyAccountId: string,
    delta: number,
    note: string | null,
    actorUserId: string,
  ) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { id: loyaltyAccountId },
      select: { id: true, restaurantId: true, points: true },
    });
    if (!account)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Loyalty account not found',
      });
    if (account.restaurantId !== restaurantId)
      throw new BadRequestException({
        code: 'ACCOUNT_MISMATCH',
        message: 'Account does not belong to this restaurant',
      });

    const newPoints = Math.max(0, account.points + delta);
    const actualDelta = newPoints - account.points;
    if (actualDelta === 0) return { success: true, points: account.points };

    await this.prisma.$transaction([
      this.prisma.loyaltyAccount.update({
        where: { id: loyaltyAccountId },
        data: {
          points: { increment: actualDelta },
          ...(actualDelta > 0
            ? { lifetimePoints: { increment: actualDelta } }
            : {}),
        },
      }),
      this.prisma.loyaltyPointLedger.create({
        data: {
          loyaltyAccountId,
          type: 'ADJUSTMENT',
          points: actualDelta,
          remainingPoints: Math.max(0, actualDelta),
        },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'LOYALTY_ADJUST',
          targetType: 'LOYALTY_ACCOUNT',
          targetId: loyaltyAccountId,
          metadata: {
            restaurantId,
            delta: actualDelta,
            previousPoints: account.points,
            newPoints,
            note,
          },
        },
      }),
    ]);

    return { success: true, previousPoints: account.points, newPoints };
  }

  async clearLoyaltyPoints(
    restaurantId: string,
    loyaltyAccountId: string,
    actorUserId: string,
  ) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { id: loyaltyAccountId },
      select: { id: true, restaurantId: true, points: true },
    });
    if (!account)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Loyalty account not found',
      });
    if (account.restaurantId !== restaurantId)
      throw new BadRequestException({
        code: 'ACCOUNT_MISMATCH',
        message: 'Account does not belong to this restaurant',
      });
    if (account.points === 0) return { success: true, clearedPoints: 0 };

    await this.prisma.$transaction([
      this.prisma.loyaltyAccount.update({
        where: { id: loyaltyAccountId },
        data: { points: 0 },
      }),
      this.prisma.loyaltyPointLedger.updateMany({
        where: { loyaltyAccountId, remainingPoints: { gt: 0 } },
        data: { remainingPoints: 0 },
      }),
      this.prisma.loyaltyPointLedger.create({
        data: {
          loyaltyAccountId,
          type: 'ADJUSTMENT',
          points: -account.points,
          remainingPoints: 0,
        },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'LOYALTY_CLEAR',
          targetType: 'LOYALTY_ACCOUNT',
          targetId: loyaltyAccountId,
          metadata: { restaurantId, clearedPoints: account.points },
        },
      }),
    ]);

    return { success: true, clearedPoints: account.points };
  }

  async getMrr() {
    const TIER_PRICES: Record<string, number> = {
      FREE: 0,
      STARTER: 29,
      PROFESSIONAL: 79,
      ENTERPRISE: 199,
    };

    const [tiers, newTenants30d, recentChanges] = await Promise.all([
      this.prisma.restaurant.findMany({
        where: { isActive: true, deletedAt: null },
        select: { tier: true, forceTier: true },
      }),
      this.prisma.restaurant.groupBy({
        by: ['tier'],
        where: {
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          deletedAt: null,
        },
        _count: { _all: true },
      }),
      this.prisma.adminAuditLog.findMany({
        where: {
          action: { in: ['TIER_OVERRIDE', 'TIER_CLEAR'] },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { action: true, metadata: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const billingCounts = emptyTierCounts();
    const effectiveCounts = emptyTierCounts();
    for (const row of tiers) {
      billingCounts[row.tier] = (billingCounts[row.tier] ?? 0) + 1;
      const eff = row.forceTier ?? row.tier;
      effectiveCounts[eff] = (effectiveCounts[eff] ?? 0) + 1;
    }

    const mrr = Object.entries(TIER_PRICES).reduce(
      (sum, [tier, price]) => sum + (billingCounts[tier] ?? 0) * price,
      0,
    );

    const newByTier: Record<string, number> = {};
    for (const row of newTenants30d) {
      newByTier[row.tier] = row._count._all;
    }

    return {
      mrr,
      arr: mrr * 12,
      byTier: (Object.keys(TIER_PRICES) as string[]).map((tier) => ({
        tier,
        billing: billingCounts[tier] ?? 0,
        effective: effectiveCounts[tier] ?? 0,
        price: TIER_PRICES[tier] ?? 0,
        contribution: (billingCounts[tier] ?? 0) * (TIER_PRICES[tier] ?? 0),
      })),
      newLast30d: newByTier,
      recentTierChanges: recentChanges,
    };
  }

  async getDataRequests(params: {
    page: number;
    limit: number;
    status?: string;
    type?: string;
  }) {
    const page = clampPage(params.page);
    const limit = clampLimit(params.limit);
    const where: Prisma.DataRequestWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;

    const [data, total] = await Promise.all([
      this.prisma.dataRequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { requestedAt: 'desc' },
        select: {
          id: true,
          type: true,
          status: true,
          requestedAt: true,
          processedAt: true,
          notes: true,
          downloadUrl: true,
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      this.prisma.dataRequest.count({ where }),
    ]);

    return { data, meta: { total, page, limit } };
  }

  async updateDataRequest(
    id: string,
    patch: {
      status?: string;
      notes?: string;
      downloadUrl?: string;
      confirmation?: string;
    },
    actorUserId: string,
  ) {
    const { confirmation, ...requestPatch } = patch;

    return this.prisma.$transaction(async (tx) => {
      const request = await tx.dataRequest.findUnique({ where: { id } });
      if (!request) {
        throw new NotFoundException({
          code: 'REQUEST_NOT_FOUND',
          message: 'Data request not found',
        });
      }

      const statusChanged =
        requestPatch.status !== undefined &&
        requestPatch.status !== request.status;
      const isTerminalTransition =
        statusChanged &&
        (requestPatch.status === 'COMPLETED' ||
          requestPatch.status === 'REJECTED');
      if (isTerminalTransition && confirmation !== 'CONFIRM') {
        throw new BadRequestException({
          code: 'CONFIRMATION_REQUIRED',
          message: 'Terminal data request status changes require confirmation',
        });
      }

      const processingPatch = statusChanged
        ? isTerminalTransition
          ? { processedAt: new Date(), processedByUserId: actorUserId }
          : { processedAt: null, processedByUserId: null }
        : {};
      const updated = await tx.dataRequest.update({
        where: { id },
        data: {
          ...requestPatch,
          ...processingPatch,
        },
      });

      const changedFields = (
        ['status', 'notes', 'downloadUrl'] as const
      ).filter((field) => requestPatch[field] !== undefined);
      await tx.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'DATA_REQUEST_UPDATE',
          targetType: 'DATA_REQUEST',
          targetId: id,
          metadata: {
            changedFields,
            previousStatus: request.status,
            nextStatus: updated.status,
            terminalStatusConfirmed: isTerminalTransition,
          },
        },
      });

      return updated;
    });
  }

  async createImpersonationSession(restaurantId: string, actorUserId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        owner: { select: { id: true, email: true, name: true } },
      },
    });
    if (!restaurant)
      throw new NotFoundException({
        code: 'TENANT_NOT_FOUND',
        message: 'Restaurant not found',
      });

    const exchangeCode = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min to exchange

    const [session] = await this.prisma.$transaction([
      this.prisma.impersonationSession.create({
        data: {
          actorId: actorUserId,
          targetId: restaurant.ownerId,
          restaurantId,
          exchangeCode,
          expiresAt,
        },
        select: { id: true, expiresAt: true },
      }),
      this.prisma.adminAuditLog.create({
        data: {
          actorUserId,
          action: 'IMPERSONATION_START',
          targetType: 'USER',
          targetId: restaurant.ownerId,
          metadata: { restaurantId, restaurantName: restaurant.name },
        },
      }),
    ]);

    return {
      sessionId: session.id,
      exchangeCode,
      expiresAt: session.expiresAt,
      targetUser: restaurant.owner,
    };
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
