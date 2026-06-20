import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardViewsService } from './dashboard-views.service';
import { OrderStatus } from '@prisma/client';
import { DateTime } from 'luxon';

@Injectable()
export class DashboardService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DashboardService.name);

  // In-memory analytics cache — per restaurantId+period key, 60-second TTL
  private readonly analyticsCache = new Map<
    string,
    { data: unknown; expiresAt: number }
  >();
  private static readonly ANALYTICS_TTL_MS = 60_000;
  private static readonly ANALYTICS_CACHE_MAX = 100;
  private cacheSweepInterval?: ReturnType<typeof setInterval>;

  onModuleInit(): void {
    this.cacheSweepInterval = setInterval(
      () => this.sweepExpiredCache(),
      DashboardService.ANALYTICS_TTL_MS,
    );
    this.cacheSweepInterval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.cacheSweepInterval) clearInterval(this.cacheSweepInterval);
  }

  private sweepExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.analyticsCache) {
      if (entry.expiresAt <= now) this.analyticsCache.delete(key);
    }
  }

  private enforceCacheMax() {
    // Evict oldest entries (Map preserves insertion order) when over cap
    while (this.analyticsCache.size > DashboardService.ANALYTICS_CACHE_MAX) {
      this.analyticsCache.delete(this.analyticsCache.keys().next().value);
    }
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly views: DashboardViewsService,
  ) {}

  async getSummary(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = restaurant?.timezone || 'Europe/Sofia';
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
        status: { not: OrderStatus.CANCELED },
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
    const tz = restaurant?.timezone || 'Europe/Sofia';

    let nowDateTime = DateTime.now().setZone(tz);
    let periodStartDateTime = nowDateTime.minus({ days: period }).startOf('day');

    if (startDateStr && endDateStr) {
      periodStartDateTime = DateTime.fromISO(startDateStr, {
        zone: tz,
      }).startOf('day');
      nowDateTime = DateTime.fromISO(endDateStr, { zone: tz }).endOf('day');
    }

    const now = nowDateTime.toJSDate();
    const periodStart = periodStartDateTime.toJSDate();
    const timeDeltaMs = now.getTime() - periodStart.getTime();
    const prevPeriodStart = new Date(periodStart.getTime() - timeDeltaMs);
    const prevPeriodEnd = new Date(periodStart.getTime() - 1);

    const useViews = this.views.isReady();
    const [
      revenueTrend,
      topItems,
      peakHours,
      currentPeriodStats,
      previousPeriodStats,
      ordersByStatus,
      categoryBreakdown,
      ordersByTable,
      currentNewCustomers,
      previousNewCustomers,
    ] = await Promise.all([
      useViews
        ? this.getRevenueTrendFromView(restaurantId, periodStart, now, tz)
        : this.getRevenueTrend(restaurantId, periodStart, now, tz),
      useViews
        ? this.getTopItemsFromView(restaurantId, periodStart, now)
        : this.getTopItems(restaurantId, periodStart, now),
      useViews
        ? this.getPeakHoursFromView(restaurantId, periodStart, now, tz)
        : this.getPeakHours(restaurantId, periodStart, now, tz),
      this.getPeriodStats(restaurantId, periodStart, now),
      this.getPeriodStats(restaurantId, prevPeriodStart, prevPeriodEnd),
      this.getOrdersByStatus(restaurantId, periodStart, now),
      this.getCategoryBreakdown(restaurantId, periodStart, now),
      this.getOrdersByTable(restaurantId, periodStart, now),
      this.getNewCustomers(restaurantId, periodStart, now),
      this.getNewCustomers(restaurantId, prevPeriodStart, prevPeriodEnd),
    ]);

    const revenueChange =
      previousPeriodStats.totalRevenue > 0
        ? ((currentPeriodStats.totalRevenue -
            previousPeriodStats.totalRevenue) /
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

    const newCustomersChange =
      previousNewCustomers > 0
        ? ((currentNewCustomers - previousNewCustomers) /
            previousNewCustomers) *
          100
        : currentNewCustomers > 0
          ? 100
          : 0;

    const servedOrders =
      ordersByStatus.find((s) => s.status === 'SERVED')?.count || 0;
    const servedRate =
      currentPeriodStats.totalOrders > 0
        ? (servedOrders / currentPeriodStats.totalOrders) * 100
        : 0;

    const avgOrderValueChange =
      previousPeriodStats.avgOrderValue > 0
        ? ((currentPeriodStats.avgOrderValue -
            previousPeriodStats.avgOrderValue) /
            previousPeriodStats.avgOrderValue) *
          100
        : currentPeriodStats.avgOrderValue > 0
          ? 100
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
      newCustomers: currentNewCustomers,
      avgOrderValue: currentPeriodStats.avgOrderValue,
      servedRate: Math.round(servedRate * 10) / 10,
      ordersByStatus,
      prevPeriodStart: prevPeriodStart.toISOString(),
      prevPeriodEnd: prevPeriodEnd.toISOString(),
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
        newCustomersChange:
          previousNewCustomers > 0
            ? Math.round(newCustomersChange * 10) / 10
            : currentNewCustomers > 0
              ? 100
              : 0,
        avgOrderValueChange:
          previousPeriodStats.avgOrderValue > 0
            ? Math.round(avgOrderValueChange * 10) / 10
            : currentPeriodStats.avgOrderValue > 0
              ? 100
              : 0,
      },
    };

    this.analyticsCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + DashboardService.ANALYTICS_TTL_MS,
    });
    this.enforceCacheMax();
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
      take: 50000,
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
      const dateKey = DateTime.fromJSDate(order.createdAt, {
        zone: tz,
      }).toISODate()!;
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
    type Row = { name: string; quantity: number; revenue: number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT mi.name,
             SUM(oi.quantity)::int                        AS quantity,
             COALESCE(SUM(COALESCE(NULLIF(oi."unitPriceWithOptions", 0), mi.price) * oi.quantity), 0)::float AS revenue
      FROM order_item oi
      JOIN customer_order o ON oi."orderId"    = o.id
      JOIN menu_item     mi ON oi."menuItemId" = mi.id
      WHERE o."restaurantId" = ${restaurantId}
        AND o.status         != 'CANCELED'
        AND o."createdAt"   >= ${start}
        AND o."createdAt"   <= ${end}
        AND oi."menuItemId" IS NOT NULL
      GROUP BY oi."menuItemId", mi.name
      ORDER BY SUM(oi.quantity) DESC
      LIMIT 10
    `;
    return rows.map((r) => ({
      name: r.name,
      quantity: r.quantity,
      revenue: Math.round(Number(r.revenue) * 100) / 100,
    }));
  }

  private async getPeakHours(
    restaurantId: string,
    start: Date,
    end: Date,
    tz: string,
  ) {
    type Row = { hour: number; orders: number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE ${tz})::int AS hour,
             COUNT(*)::int AS orders
      FROM customer_order
      WHERE "restaurantId" = ${restaurantId}
        AND status         != 'CANCELED'
        AND "createdAt"   >= ${start}
        AND "createdAt"   <= ${end}
      GROUP BY hour
      ORDER BY hour
    `;

    const hours: { hour: number; label: string; orders: number }[] = Array.from(
      { length: 24 },
      (_, h) => ({ hour: h, label: `${h.toString().padStart(2, '0')}:00`, orders: 0 }),
    );
    for (const row of rows) {
      const h = row.hour;
      if (h >= 0 && h < 24) hours[h].orders += row.orders;
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

  private async getNewCustomers(restaurantId: string, start: Date, end: Date) {
    const result = await this.prisma.order.groupBy({
      by: ['customerPhone'],
      _count: true,
      where: {
        restaurantId,
        customerPhone: { not: '' },
        status: { not: OrderStatus.CANCELED },
        createdAt: { gte: start, lte: end },
      },
    });
    return result.length;
  }

  async getPaymentsSummary(
    restaurantId: string,
    startDateStr?: string,
    endDateStr?: string,
  ) {
    const dateFilter: { gte?: Date; lte?: Date } = {};
    if (startDateStr) dateFilter.gte = new Date(startDateStr);
    if (endDateStr) {
      const end = new Date(endDateStr);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }

    const where = {
      restaurantId,
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    };

    const [collected, refunded, byMethod] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { ...where, status: 'SUCCEEDED' },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { ...where, status: 'REFUNDED' },
      }),
      this.prisma.payment.groupBy({
        by: ['provider'],
        _sum: { amount: true },
        where: { ...where, status: 'SUCCEEDED' },
      }),
    ]);

    return {
      totalCollected: Math.round((collected._sum.amount || 0) * 100) / 100,
      refundAmount: Math.round((refunded._sum.amount || 0) * 100) / 100,
      byMethod: byMethod.map((m) => ({
        method: m.provider,
        amount: Math.round((m._sum.amount || 0) * 100) / 100,
      })),
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
    return statuses.map((status) => ({
      status,
      count: countMap.get(status) ?? 0,
    }));
  }

  private async getCategoryBreakdown(
    restaurantId: string,
    start: Date,
    end: Date,
  ) {
    type Row = { category: string; revenue: number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT COALESCE(mc.name, 'Uncategorized')              AS category,
             COALESCE(SUM(COALESCE(NULLIF(oi."unitPriceWithOptions", 0), mi.price) * oi.quantity), 0)::float AS revenue
      FROM order_item oi
      JOIN customer_order  o  ON oi."orderId"    = o.id
      JOIN menu_item       mi ON oi."menuItemId" = mi.id
      LEFT JOIN menu_category mc ON mi."categoryId" = mc.id
      WHERE o."restaurantId" = ${restaurantId}
        AND o.status         != 'CANCELED'
        AND o."createdAt"   >= ${start}
        AND o."createdAt"   <= ${end}
        AND oi."menuItemId" IS NOT NULL
      GROUP BY mc.name
      ORDER BY SUM(COALESCE(NULLIF(oi."unitPriceWithOptions", 0), mi.price) * oi.quantity) DESC
    `;
    return rows.map((r) => ({
      category: r.category,
      revenue: Math.round(Number(r.revenue) * 100) / 100,
    }));
  }

  // ── View-backed fast paths ────────────────────────────────────────────────

  private async getRevenueTrendFromView(
    restaurantId: string,
    start: Date,
    end: Date,
    tz: string,
  ) {
    type Row = { day_utc: Date; order_count: number; revenue: number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT day_utc, order_count, revenue::float AS revenue
      FROM mv_daily_stats
      WHERE "restaurantId" = ${restaurantId}
        AND day_utc >= ${start} AND day_utc <= ${end}
      ORDER BY day_utc
    `;

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

    for (const row of rows) {
      const dateKey = DateTime.fromJSDate(row.day_utc, {
        zone: tz,
      }).toISODate()!;
      if (grouped[dateKey]) {
        grouped[dateKey].revenue += Number(row.revenue);
        grouped[dateKey].orders += row.order_count;
      }
    }

    return Object.values(grouped).map((d) => ({
      ...d,
      revenue: Math.round(d.revenue * 100) / 100,
    }));
  }

  private async getPeakHoursFromView(
    restaurantId: string,
    start: Date,
    end: Date,
    tz: string,
  ) {
    // Use AT TIME ZONE so PostgreSQL resolves DST at each historical timestamp,
    // rather than applying the current UTC offset (Issue 46)
    type Row = { local_hour: number; total_orders: number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(HOUR FROM (day_utc + (hour_utc * INTERVAL '1 hour')) AT TIME ZONE ${tz})::int AS local_hour,
             SUM(order_count)::int AS total_orders
      FROM mv_peak_hours
      WHERE "restaurantId" = ${restaurantId}
        AND day_utc >= ${start} AND day_utc <= ${end}
      GROUP BY local_hour
      ORDER BY local_hour
    `;

    const hours: { hour: number; label: string; orders: number }[] = Array.from(
      { length: 24 },
      (_, h) => ({
        hour: h,
        label: `${h.toString().padStart(2, '0')}:00`,
        orders: 0,
      }),
    );

    for (const row of rows) {
      const h = row.local_hour;
      if (h >= 0 && h < 24) hours[h].orders += row.total_orders;
    }

    return hours;
  }

  private async getTopItemsFromView(
    restaurantId: string,
    start: Date,
    end: Date,
  ) {
    type Row = {
      menuItemId: string;
      item_name: string;
      item_price: number;
      quantity: number;
      revenue: number;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT "menuItemId", item_name,
             item_price::float AS item_price,
             SUM(total_quantity)::int AS quantity,
             SUM(total_revenue)::float AS revenue
      FROM mv_item_stats
      WHERE "restaurantId" = ${restaurantId}
        AND day_utc >= ${start} AND day_utc <= ${end}
      GROUP BY "menuItemId", item_name, item_price
      ORDER BY SUM(total_quantity) DESC
      LIMIT 10
    `;

    return rows.map((r) => ({
      name: r.item_name,
      quantity: r.quantity,
      revenue: Math.round(Number(r.revenue) * 100) / 100,
    }));
  }

  private async getOrdersByTable(restaurantId: string, start: Date, end: Date) {
    type Row = {
      table_id: string;
      table_name: string | null;
      orders: number;
      revenue: number;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT co."tableId"                                                  AS table_id,
             COALESCE(MIN(co."tableName"), MIN(rt.name))                  AS table_name,
             COUNT(*)::int                                                AS orders,
             COALESCE(SUM(co."totalPrice"), 0)::float                     AS revenue
      FROM customer_order co
      LEFT JOIN restaurant_table rt ON co."tableId" = rt.id
      WHERE co."restaurantId" = ${restaurantId}
        AND co.status         != 'CANCELED'
        AND co."createdAt"   >= ${start}
        AND co."createdAt"   <= ${end}
        AND co."tableId"     IS NOT NULL
        AND co."tableId"     != ''
      GROUP BY co."tableId"
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `;
    return rows.map((r) => ({
      table: r.table_name || 'Unknown Table',
      orders: r.orders,
      revenue: Math.round(Number(r.revenue) * 100) / 100,
    }));
  }
}
