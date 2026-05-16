import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { DateTime } from 'luxon';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  // In-memory analytics cache — per restaurantId+period key, 60-second TTL
  private readonly analyticsCache = new Map<string, { data: unknown; expiresAt: number }>();
  private static readonly ANALYTICS_TTL_MS = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = restaurant?.timezone || 'UTC';
    const today = DateTime.now().setZone(tz).startOf('day').toJSDate();

    const ordersToday = await this.prisma.order.count({
      where: {
        restaurantId,
        createdAt: { gte: today },
      },
    });

    const totalRevenueResult = await this.prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: {
        restaurantId,
        status: OrderStatus.SERVED,
      },
    });

    const openAssistanceRequests = await this.prisma.assistanceRequest.count({
      where: {
        restaurantId,
        isResolved: false,
      },
    });

    const recentOrders = await this.prisma.order.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      ordersToday,
      totalRevenue: totalRevenueResult._sum.totalPrice || 0,
      openAssistanceRequests,
      recentOrders,
    };
  }

  async getAnalytics(
    restaurantId: string,
    period: number,
    startDateStr?: string,
    endDateStr?: string,
  ) {
    const cacheKey = `${restaurantId}:${period}:${startDateStr ?? ''}:${endDateStr ?? ''}`;
    const cached = this.analyticsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = restaurant?.timezone || 'UTC';

    let now = new Date();
    let periodStart = new Date(now);

    if (startDateStr && endDateStr) {
      periodStart = new Date(startDateStr);
      periodStart.setHours(0, 0, 0, 0);

      now = new Date(endDateStr);
      now.setHours(23, 59, 59, 999);
    } else {
      periodStart.setDate(periodStart.getDate() - period);
      periodStart.setHours(0, 0, 0, 0);
    }

    const timeDeltaMs = now.getTime() - periodStart.getTime();
    const prevPeriodStart = new Date(periodStart.getTime() - timeDeltaMs);
    const prevPeriodEnd = new Date(periodStart.getTime() - 1);

    const [
      revenueTrend,
      topItems,
      peakHours,
      currentPeriodStats,
      previousPeriodStats,
      ordersByStatus,
      categoryBreakdown,
      ordersByTable,
    ] = await Promise.all([
      this.getRevenueTrend(restaurantId, periodStart, now, tz),
      this.getTopItems(restaurantId, periodStart, now),
      this.getPeakHours(restaurantId, periodStart, now, tz),
      this.getPeriodStats(restaurantId, periodStart, now),
      this.getPeriodStats(restaurantId, prevPeriodStart, prevPeriodEnd),
      this.getOrdersByStatus(restaurantId, periodStart, now),
      this.getCategoryBreakdown(restaurantId, periodStart, now),
      this.getOrdersByTable(restaurantId, periodStart, now),
    ]);

    const revenueChange =
      previousPeriodStats.totalRevenue > 0
        ? ((currentPeriodStats.totalRevenue - previousPeriodStats.totalRevenue) /
            previousPeriodStats.totalRevenue) *
          100
        : currentPeriodStats.totalRevenue > 0
          ? 100
          : 0;

    const ordersChange =
      previousPeriodStats.totalOrders > 0
        ? ((currentPeriodStats.totalOrders - previousPeriodStats.totalOrders) /
            previousPeriodStats.totalOrders) *
          100
        : currentPeriodStats.totalOrders > 0
          ? 100
          : 0;

    const servedOrders =
      ordersByStatus.find((s) => s.status === 'SERVED')?.count || 0;
    const servedRate =
      currentPeriodStats.totalOrders > 0
        ? (servedOrders / currentPeriodStats.totalOrders) * 100
        : 0;

    const result = {
      period,
      revenueTrend,
      topItems,
      peakHours,
      categoryBreakdown,
      ordersByTable,
      totalRevenue: currentPeriodStats.totalRevenue,
      totalOrders: currentPeriodStats.totalOrders,
      avgOrderValue: currentPeriodStats.avgOrderValue,
      servedRate: Math.round(servedRate * 10) / 10,
      ordersByStatus,
      comparison: {
        revenueChange:
          previousPeriodStats.totalRevenue > 0
            ? Math.round(revenueChange * 10) / 10
            : currentPeriodStats.totalRevenue > 0
              ? 100
              : 0,
        ordersChange:
          previousPeriodStats.totalOrders > 0
            ? Math.round(ordersChange * 10) / 10
            : currentPeriodStats.totalOrders > 0
              ? 100
              : 0,
      },
    };

    this.analyticsCache.set(cacheKey, { data: result, expiresAt: Date.now() + DashboardService.ANALYTICS_TTL_MS });
    return result;
  }

  private async getRevenueTrend(
    restaurantId: string,
    start: Date,
    end: Date,
    tz: string,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: { not: OrderStatus.CANCELED },
        createdAt: { gte: start, lte: end },
      },
      select: {
        totalPrice: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const grouped: Record<
      string,
      { date: string; revenue: number; orders: number }
    > = {};

    let current = DateTime.fromJSDate(start, { zone: tz });
    const endDt = DateTime.fromJSDate(end, { zone: tz });
    while (current <= endDt) {
      const dateKey = current.toISODate()!;
      grouped[dateKey] = { date: dateKey, revenue: 0, orders: 0 };
      current = current.plus({ days: 1 });
    }

    for (const order of orders) {
      const dateKey = DateTime.fromJSDate(order.createdAt, { zone: tz }).toISODate()!;
      if (grouped[dateKey]) {
        grouped[dateKey].revenue += order.totalPrice;
        grouped[dateKey].orders += 1;
      }
    }

    return Object.values(grouped).map((d) => ({
      ...d,
      revenue: Math.round(d.revenue * 100) / 100,
    }));
  }

  private async getTopItems(restaurantId: string, start: Date, end: Date) {
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          restaurantId,
          status: { not: OrderStatus.CANCELED },
          createdAt: { gte: start, lte: end },
        },
        menuItem: { isNot: null },
      },
      include: {
        menuItem: {
          select: { name: true, price: true },
        },
      },
    });

    // Aggregate by menu item
    const itemMap: Record<
      string,
      { name: string; quantity: number; revenue: number }
    > = {};

    for (const oi of orderItems) {
      if (!oi.menuItem) continue;
      const key = oi.menuItemId || 'unknown';
      if (!itemMap[key]) {
        itemMap[key] = { name: oi.menuItem.name, quantity: 0, revenue: 0 };
      }
      itemMap[key].quantity += oi.quantity;
      itemMap[key].revenue += oi.menuItem.price * oi.quantity;
    }

    return Object.values(itemMap)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
      .map((item) => ({
        ...item,
        revenue: Math.round(item.revenue * 100) / 100,
      }));
  }

  private async getPeakHours(
    restaurantId: string,
    start: Date,
    end: Date,
    tz: string,
  ) {
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: { not: OrderStatus.CANCELED },
        createdAt: { gte: start, lte: end },
      },
      select: { createdAt: true },
    });

    const hours: { hour: number; label: string; orders: number }[] = [];
    for (let h = 0; h < 24; h++) {
      hours.push({
        hour: h,
        label: `${h.toString().padStart(2, '0')}:00`,
        orders: 0,
      });
    }

    for (const order of orders) {
      const hour = DateTime.fromJSDate(order.createdAt, { zone: tz }).hour;
      hours[hour].orders += 1;
    }

    return hours;
  }

  private async getPeriodStats(restaurantId: string, start: Date, end: Date) {
    const result = await this.prisma.order.aggregate({
      _sum: { totalPrice: true },
      _count: true,
      _avg: { totalPrice: true },
      where: {
        restaurantId,
        status: { not: OrderStatus.CANCELED },
        createdAt: { gte: start, lte: end },
      },
    });

    return {
      totalRevenue: Math.round((result._sum.totalPrice || 0) * 100) / 100,
      totalOrders: result._count,
      avgOrderValue:
        result._count > 0
          ? Math.round(((result._sum.totalPrice || 0) / result._count) * 100) /
            100
          : 0,
    };
  }

  private async getOrdersByStatus(
    restaurantId: string,
    start: Date,
    end: Date,
  ) {
    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      _count: true,
      where: { restaurantId, createdAt: { gte: start, lte: end } },
    });

    const countMap = new Map(grouped.map((g) => [g.status, g._count]));
    const statuses: OrderStatus[] = [
      OrderStatus.NEW,
      OrderStatus.IN_PROGRESS,
      OrderStatus.SERVED,
      OrderStatus.CANCELED,
    ];
    return statuses.map((status) => ({ status, count: countMap.get(status) ?? 0 }));
  }

  private async getCategoryBreakdown(
    restaurantId: string,
    start: Date,
    end: Date,
  ) {
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          restaurantId,
          status: { not: OrderStatus.CANCELED },
          createdAt: { gte: start, lte: end },
        },
        menuItem: { isNot: null },
      },
      include: {
        menuItem: {
          include: { category: true },
        },
      },
    });

    const categoryMap: Record<string, { category: string; revenue: number }> =
      {};

    for (const oi of orderItems) {
      if (!oi.menuItem || !oi.menuItem.category) continue;
      const key = oi.menuItem.category.name || 'Uncategorized';
      if (!categoryMap[key]) {
        categoryMap[key] = { category: key, revenue: 0 };
      }
      categoryMap[key].revenue += oi.menuItem.price * oi.quantity;
    }

    return Object.values(categoryMap)
      .sort((a, b) => b.revenue - a.revenue)
      .map((item) => ({
        ...item,
        revenue: Math.round(item.revenue * 100) / 100,
      }));
  }

  private async getOrdersByTable(restaurantId: string, start: Date, end: Date) {
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: { not: OrderStatus.CANCELED },
        createdAt: { gte: start, lte: end },
        tableId: { not: '' },
      },
    });

    const tableMap: Record<
      string,
      { table: string; orders: number; revenue: number }
    > = {};

    for (const order of orders) {
      const key = order.tableId || 'Unknown Table';
      if (!tableMap[key]) {
        tableMap[key] = { table: key, orders: 0, revenue: 0 };
      }
      tableMap[key].orders += 1;
      tableMap[key].revenue += order.totalPrice;
    }

    return Object.values(tableMap)
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 10)
      .map((item) => ({
        ...item,
        revenue: Math.round(item.revenue * 100) / 100,
      }));
  }
}
