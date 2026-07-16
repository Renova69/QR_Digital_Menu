import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardViewsService } from './dashboard-views.service';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import {
  buildRestaurantDateRange,
  buildRestaurantPresetDateRange,
} from '../common/restaurant-date-range';

// Upper bound for the createdAt→updatedAt prep-time estimate (kitchen efficiency).
// Orders idle past this are treated as stale/edited, not real prep time.
const MAX_PREP_MINUTES = 180;

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
    includePremium = true,
    language?: string,
  ) {
    // The 7 premium (ANALYTICS_FULL) metrics below are stripped by the
    // controller for STARTER. Skip computing them when the caller lacks FULL so
    // a basic-tier request doesn't pay for raw SQL joins + a full-range order
    // scan it will never see.
    const cacheKey = `${restaurantId}:${period}:${startDateStr ?? ''}:${endDateStr ?? ''}:${includePremium ? 'full' : 'basic'}:${language ?? 'source'}`;
    const cached = this.analyticsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = restaurant?.timezone || 'Europe/Sofia';

    let nowDateTime = DateTime.now().setZone(tz);
    let periodStartDateTime = nowDateTime
      .minus({ days: Math.max(0, period - 1) })
      .startOf('day');
    const hasCustomRange = !!(startDateStr && endDateStr);

    if (hasCustomRange) {
      periodStartDateTime = DateTime.fromISO(startDateStr, {
        zone: tz,
      }).startOf('day');
      nowDateTime = DateTime.fromISO(endDateStr, { zone: tz }).endOf('day');
    }

    const now = nowDateTime.toJSDate();
    const periodStart = periodStartDateTime.toJSDate();
    let prevPeriodStart: Date;
    let prevPeriodEnd: Date;

    if (hasCustomRange) {
      const timeDeltaMs = now.getTime() - periodStart.getTime();
      prevPeriodEnd = new Date(periodStart.getTime() - 1);
      prevPeriodStart = new Date(prevPeriodEnd.getTime() - timeDeltaMs);
    } else {
      prevPeriodStart = periodStartDateTime.minus({ days: period }).toJSDate();
      prevPeriodEnd = nowDateTime.minus({ days: period }).toJSDate();
    }

    // UTC-day materialized views cannot represent a partial local "Today" or
    // exact custom-day boundary. Use direct range queries for those windows.
    const useViews =
      this.views.isReady() && tz === 'UTC' && period !== 1 && !hasCustomRange;
    const [
      revenueTrend,
      topItems,
      peakHours,
      currentPeriodStats,
      previousPeriodStats,
      ordersByStatus,
      categoryBreakdown,
      ordersByTable,
      currentActiveCustomers,
      previousActiveCustomers,
      paymentTotals,
      repeatCustomerRate,
      staffPerformance,
      customerMetrics,
      kitchenEfficiency,
      cancelAnalytics,
      tableTurnover,
      menuProfitability,
      grossProfit,
    ] = await Promise.all([
      useViews
        ? this.getRevenueTrendFromView(restaurantId, periodStart, now, tz)
        : this.getRevenueTrend(restaurantId, periodStart, now, tz),
      useViews
        ? this.getTopItemsFromView(restaurantId, periodStart, now, language)
        : this.getTopItems(restaurantId, periodStart, now, language),
      useViews
        ? this.getPeakHoursFromView(restaurantId, periodStart, now, tz)
        : this.getPeakHours(restaurantId, periodStart, now, tz),
      this.getPeriodStats(restaurantId, periodStart, now),
      this.getPeriodStats(restaurantId, prevPeriodStart, prevPeriodEnd),
      this.getOrdersByStatus(restaurantId, periodStart, now),
      this.getCategoryBreakdown(restaurantId, periodStart, now, language),
      this.getOrdersByTable(restaurantId, periodStart, now),
      this.getActiveCustomers(restaurantId, periodStart, now),
      this.getActiveCustomers(restaurantId, prevPeriodStart, prevPeriodEnd),
      this.getPaymentTotals(restaurantId, periodStart, now),
      this.getRepeatCustomerRate(restaurantId, periodStart, now),
      includePremium
        ? this.getStaffPerformance(restaurantId, periodStart, now)
        : undefined,
      includePremium
        ? this.getCustomerMetrics(restaurantId, periodStart, now, tz)
        : undefined,
      includePremium
        ? this.getKitchenEfficiency(restaurantId, periodStart, now, tz)
        : undefined,
      includePremium
        ? this.getCancelAnalytics(restaurantId, periodStart, now, tz, language)
        : undefined,
      includePremium
        ? this.getTableTurnover(restaurantId, periodStart, now)
        : undefined,
      includePremium
        ? this.getMenuProfitability(restaurantId, periodStart, now, language)
        : undefined,
      includePremium
        ? this.getGrossProfit(restaurantId, periodStart, now)
        : undefined,
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

    const activeCustomersChange =
      previousActiveCustomers > 0
        ? ((currentActiveCustomers - previousActiveCustomers) /
            previousActiveCustomers) *
          100
        : currentActiveCustomers > 0
          ? 100
          : 0;

    // Orders flow NEW -> IN_PROGRESS -> SERVED -> COMPLETED (batch-advanced).
    // SERVED is transient; fulfilled orders settle in COMPLETED, so completion
    // rate (not the near-empty SERVED snapshot) is the real fulfillment KPI.
    // Denominator excludes CANCELED (never meant to complete) and
    // PENDING_PAYMENT (abandoned online checkouts that never became real
    // orders) — folding them in understates the rate for restaurants with
    // normal cancel/abandon volume (e.g. 50 done / 30 canceled / 20 abandoned
    // read as 50% instead of the correct 71%).
    const completedOrders =
      ordersByStatus.find((s) => s.status === 'COMPLETED')?.count || 0;
    const observedOrders = ordersByStatus
      .filter(
        (s) =>
          s.status !== OrderStatus.CANCELED &&
          s.status !== OrderStatus.PENDING_PAYMENT,
      )
      .reduce((total, status) => total + status.count, 0);
    const completionRate =
      observedOrders > 0 ? (completedOrders / observedOrders) * 100 : 0;

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
      periodStart: periodStart.toISOString(),
      periodEnd: now.toISOString(),
      revenueTrend,
      topItems,
      peakHours,
      categoryBreakdown,
      ordersByTable,
      totalRevenue: currentPeriodStats.totalRevenue,
      collectedRevenue: paymentTotals.collectedRevenue,
      refundedAmount: paymentTotals.refundedAmount,
      paymentsByMethod: paymentTotals.paymentsByMethod,
      totalOrders: currentPeriodStats.totalOrders,
      activeCustomers: currentActiveCustomers,
      repeatCustomerRate,
      avgOrderValue: currentPeriodStats.avgOrderValue,
      completionRate: Math.round(completionRate * 10) / 10,
      ordersByStatus,
      staffPerformance,
      customerMetrics,
      kitchenEfficiency,
      cancelAnalytics,
      tableTurnover,
      menuProfitability,
      grossProfit,
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
        activeCustomersChange:
          previousActiveCustomers > 0
            ? Math.round(activeCustomersChange * 10) / 10
            : currentActiveCustomers > 0
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
    type Row = { date: string; revenue: number; orders: number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT TO_CHAR((("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS date,
             COALESCE(SUM("totalPrice"), 0)::float AS revenue,
             COUNT(*)::int AS orders
      FROM customer_order
      WHERE "restaurantId" = ${restaurantId}
        AND status != 'CANCELED'
        AND "createdAt" >= ${start}
        AND "createdAt" <= ${end}
      GROUP BY date
      ORDER BY date
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
      if (grouped[row.date]) {
        grouped[row.date].revenue += Number(row.revenue);
        grouped[row.date].orders += row.orders;
      }
    }

    return Object.values(grouped).map((d) => ({
      ...d,
      revenue: Math.round(d.revenue * 100) / 100,
    }));
  }

  private async getTopItems(
    restaurantId: string,
    start: Date,
    end: Date,
    language?: string,
  ) {
    type Row = { name: string; quantity: number; revenue: number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT COALESCE(
               NULLIF(mi.translations #>> ARRAY[${language ?? ''}, 'name']::text[], ''),
               mi.name,
               MIN(oi."itemName")
             ) AS name,
             SUM(oi.quantity)::int                        AS quantity,
             COALESCE(SUM(oi."unitPriceWithOptions" * oi.quantity), 0)::float AS revenue
      FROM order_item oi
      JOIN customer_order o ON oi."orderId"    = o.id
      LEFT JOIN menu_item mi ON oi."menuItemId" = mi.id
      WHERE o."restaurantId" = ${restaurantId}
        AND o.status         != 'CANCELED'
        AND o."createdAt"   >= ${start}
        AND o."createdAt"   <= ${end}
      GROUP BY COALESCE(oi."menuItemId", oi."itemName"),
               oi."menuItemId", mi.name, mi.translations
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
    type Row = { hour: number; orders: number; revenue: number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(HOUR FROM (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::int AS hour,
             COUNT(*)::int AS orders,
             COALESCE(SUM("totalPrice"), 0)::float AS revenue
      FROM customer_order
      WHERE "restaurantId" = ${restaurantId}
        AND status         != 'CANCELED'
        AND "createdAt"   >= ${start}
        AND "createdAt"   <= ${end}
      GROUP BY hour
      ORDER BY hour
    `;

    const hours: {
      hour: number;
      label: string;
      orders: number;
      revenue: number;
    }[] = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${h.toString().padStart(2, '0')}:00`,
      orders: 0,
      revenue: 0,
    }));
    for (const row of rows) {
      const h = row.hour;
      if (h >= 0 && h < 24) {
        hours[h].orders += row.orders;
        hours[h].revenue += row.revenue;
      }
    }
    return hours.map((d) => ({
      ...d,
      revenue: Math.round(d.revenue * 100) / 100,
    }));
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

  private async getActiveCustomers(
    restaurantId: string,
    start: Date,
    end: Date,
  ) {
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

  // % of identifiable guests in the window who placed more than one order.
  // Keyed on customerPhone (the identity we reliably capture). A high rate is
  // the strongest signal of loyalty/return behaviour for an owner.
  private async getRepeatCustomerRate(
    restaurantId: string,
    start: Date,
    end: Date,
  ) {
    const grouped = await this.prisma.order.groupBy({
      by: ['customerPhone'],
      _count: true,
      where: {
        restaurantId,
        customerPhone: { not: '' },
        status: { not: OrderStatus.CANCELED },
        createdAt: { gte: start, lte: end },
      },
    });
    const distinct = grouped.length;
    const repeat = grouped.filter((g) => g._count >= 2).length;
    return distinct > 0 ? Math.round((repeat / distinct) * 1000) / 10 : 0;
  }

  // Refunds belong to the window in which they succeeded, not the original
  // payment's creation window. The second branch preserves legacy refunds that
  // predate RefundAttempt without double-counting current records.
  private async getRefundTotals(restaurantId: string, start: Date, end: Date) {
    type Row = { grossAmount: number; salesAmount: number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH successful_refunds AS (
        SELECT ra.id AS "refundKey", ra.amount, p."tipAmount"
        FROM refund_attempt ra
        JOIN payment p ON p.id = ra."paymentId"
        WHERE ra."restaurantId" = ${restaurantId}
          AND ra.status = 'SUCCEEDED'
          AND ra."updatedAt" >= ${start}
          AND ra."updatedAt" <= ${end}

        UNION ALL

        SELECT p.id AS "refundKey", p.amount, p."tipAmount"
        FROM payment p
        WHERE p."restaurantId" = ${restaurantId}
          AND p.status = 'REFUNDED'
          AND p."updatedAt" >= ${start}
          AND p."updatedAt" <= ${end}
          AND NOT EXISTS (
            SELECT 1
            FROM refund_attempt ra
            WHERE ra."paymentId" = p.id AND ra.status = 'SUCCEEDED'
          )
      )
      SELECT COALESCE(SUM(amount), 0)::float AS "grossAmount",
             COALESCE(SUM(GREATEST(amount - "tipAmount", 0)), 0)::float AS "salesAmount"
      FROM successful_refunds
    `;

    return {
      grossAmount: Math.round(Number(rows?.[0]?.grossAmount ?? 0) * 100) / 100,
      salesAmount: Math.round(Number(rows?.[0]?.salesAmount ?? 0) * 100) / 100,
    };
  }

  private async getPaymentTotals(restaurantId: string, start: Date, end: Date) {
    const [collected, refunded, byMethod] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true, tipAmount: true },
        where: {
          restaurantId,
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
          createdAt: { gte: start, lte: end },
        },
      }),
      this.getRefundTotals(restaurantId, start, end),
      this.prisma.payment.groupBy({
        by: ['provider'],
        _sum: { amount: true, tipAmount: true },
        where: {
          restaurantId,
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
          createdAt: { gte: start, lte: end },
        },
      }),
    ]);
    const collectedSales =
      (collected._sum.amount ?? 0) - (collected._sum.tipAmount ?? 0);
    return {
      collectedRevenue: Math.round(collectedSales * 100) / 100,
      refundedAmount: refunded.salesAmount,
      paymentsByMethod: byMethod
        .map((m) => ({
          method: m.provider,
          amount:
            Math.round(((m._sum.amount ?? 0) - (m._sum.tipAmount ?? 0)) * 100) /
            100,
        }))
        .sort((a, b) => b.amount - a.amount),
    };
  }

  async getPaymentsSummary(
    restaurantId: string,
    startDateStr?: string,
    endDateStr?: string,
    period?: number,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const timezone = restaurant?.timezone ?? 'UTC';
    const dateFilter =
      startDateStr || endDateStr
        ? buildRestaurantDateRange(startDateStr, endDateStr, timezone)
        : period
          ? buildRestaurantPresetDateRange(period, timezone)
          : {};

    const where = {
      restaurantId,
      ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
    };

    const refundStart = dateFilter.gte ?? new Date(0);
    const refundEnd = dateFilter.lte ?? new Date();
    const [collected, refunded, byMethod] = await Promise.all([
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          ...where,
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
        },
      }),
      this.getRefundTotals(restaurantId, refundStart, refundEnd),
      this.prisma.payment.groupBy({
        by: ['provider'],
        _sum: { amount: true },
        where: {
          ...where,
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
        },
      }),
    ]);

    return {
      totalCollected: Math.round((collected._sum.amount || 0) * 100) / 100,
      refundAmount: refunded.grossAmount,
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
      OrderStatus.COMPLETED,
      OrderStatus.CANCELED,
      OrderStatus.PENDING_PAYMENT,
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
    language?: string,
  ) {
    type Row = { category: string; revenue: number };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT COALESCE(
               NULLIF(mc.translations #>> ARRAY[${language ?? ''}, 'name']::text[], ''),
               mc.name,
               ''
             ) AS category,
             COALESCE(SUM(oi."unitPriceWithOptions" * oi.quantity), 0)::float AS revenue
      FROM order_item oi
      JOIN customer_order  o  ON oi."orderId"    = o.id
       LEFT JOIN menu_item  mi ON oi."menuItemId" = mi.id
      LEFT JOIN menu_category mc ON mi."categoryId" = mc.id
      WHERE o."restaurantId" = ${restaurantId}
        AND o.status         != 'CANCELED'
        AND o."createdAt"   >= ${start}
        AND o."createdAt"   <= ${end}
      GROUP BY mc.id, mc.name, mc.translations
      ORDER BY SUM(oi."unitPriceWithOptions" * oi.quantity) DESC
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
    type Row = {
      local_hour: number;
      total_orders: number;
      total_revenue: number;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT EXTRACT(HOUR FROM (((day_utc + (hour_utc * INTERVAL '1 hour')) AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::int AS local_hour,
             SUM(order_count)::int AS total_orders,
             SUM(revenue)::float AS total_revenue
      FROM mv_peak_hours
      WHERE "restaurantId" = ${restaurantId}
        AND day_utc >= ${start} AND day_utc <= ${end}
      GROUP BY local_hour
      ORDER BY local_hour
    `;

    const hours: {
      hour: number;
      label: string;
      orders: number;
      revenue: number;
    }[] = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${h.toString().padStart(2, '0')}:00`,
      orders: 0,
      revenue: 0,
    }));

    for (const row of rows) {
      const h = row.local_hour;
      if (h >= 0 && h < 24) {
        hours[h].orders += row.total_orders;
        hours[h].revenue += Number(row.total_revenue);
      }
    }

    return hours.map((d) => ({
      ...d,
      revenue: Math.round(d.revenue * 100) / 100,
    }));
  }

  private async getTopItemsFromView(
    restaurantId: string,
    start: Date,
    end: Date,
    language?: string,
  ) {
    type Row = {
      itemKey: string;
      menuItemId: string;
      item_name: string;
      quantity: number;
      revenue: number;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
       SELECT stats."itemKey",
              stats."menuItemId",
             COALESCE(
               NULLIF(mi.translations #>> ARRAY[${language ?? ''}, 'name']::text[], ''),
               mi.name,
               stats.item_name
             ) AS item_name,
              SUM(stats.total_quantity)::int AS quantity,
             SUM(stats.total_revenue)::float AS revenue
      FROM mv_item_stats stats
      LEFT JOIN menu_item mi ON stats."menuItemId" = mi.id
      WHERE stats."restaurantId" = ${restaurantId}
        AND stats.day_utc >= ${start} AND stats.day_utc <= ${end}
       GROUP BY stats."itemKey", stats."menuItemId", stats.item_name, mi.name, mi.translations
      ORDER BY SUM(stats.total_quantity) DESC
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
        AND (co."servicePointType" IS NULL OR co."servicePointType" = 'TABLE')
      GROUP BY co."tableId"
      ORDER BY SUM(co."totalPrice") DESC
      LIMIT 10
    `;
    return rows.map((r) => ({
      table: r.table_name || '',
      orders: r.orders,
      revenue: Math.round(Number(r.revenue) * 100) / 100,
    }));
  }

  // ── Staff performance ──────────────────────────────────────────────────────

  private async getStaffPerformance(
    restaurantId: string,
    start: Date,
    end: Date,
  ) {
    type Row = {
      staffUserId: string;
      staffName: string;
      totalOrders: number;
      totalRevenue: number;
      avgOrderValue: number;
      posOrders: number;
      qrOrders: number;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        o."staffUserId",
        COALESCE(u.name, 'Unknown') AS "staffName",
        COUNT(*)::int AS "totalOrders",
        COALESCE(SUM(o."totalPrice"), 0)::float AS "totalRevenue",
        COALESCE(AVG(o."totalPrice"), 0)::float AS "avgOrderValue",
        COUNT(*) FILTER (WHERE o.source = 'POS')::int AS "posOrders",
        COUNT(*) FILTER (WHERE o.source = 'CUSTOMER')::int AS "qrOrders"
      FROM customer_order o
      LEFT JOIN app_user u ON o."staffUserId" = u.id
      WHERE o."restaurantId" = ${restaurantId}
        AND o.status != 'CANCELED'
        AND o."createdAt" >= ${start}
        AND o."createdAt" <= ${end}
        AND o."staffUserId" IS NOT NULL
      GROUP BY o."staffUserId", u.name
      ORDER BY "totalRevenue" DESC
    `;
    return rows.map((r) => ({
      staffUserId: r.staffUserId,
      staffName: r.staffName,
      totalOrders: r.totalOrders,
      totalRevenue: Math.round(Number(r.totalRevenue) * 100) / 100,
      avgOrderValue: Math.round(Number(r.avgOrderValue) * 100) / 100,
      posOrders: r.posOrders,
      qrOrders: r.qrOrders,
    }));
  }

  // ── Customer CLV & insights ────────────────────────────────────────────────

  private async getCustomerMetrics(
    restaurantId: string,
    start: Date,
    end: Date,
    tz: string,
  ) {
    // Aggregate per customer in SQL (one row per phone, not one per order) so a
    // busy restaurant's full-range order history never lands in Node memory.
    type Row = {
      phone: string;
      name: string | null;
      periodSpend: number;
      periodVisits: number;
      lifetimeSpend: number;
      lifetimeVisits: number;
      lastVisit: Date;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH lifetime AS (
        SELECT "customerPhone" AS phone,
               MAX("customerName") AS name,
               COALESCE(SUM("totalPrice"), 0)::float AS spend,
               COUNT(*)::int AS visits,
               MAX("createdAt") AS "lastVisit"
        FROM customer_order
        WHERE "restaurantId" = ${restaurantId}
          AND "customerPhone" IS NOT NULL
          AND "customerPhone" <> ''
          AND status != 'CANCELED'
        GROUP BY "customerPhone"
      ), period AS (
        SELECT "customerPhone" AS phone,
               MAX("customerName") AS name,
               COALESCE(SUM("totalPrice"), 0)::float AS spend,
               COUNT(*)::int AS visits
        FROM customer_order
        WHERE "restaurantId" = ${restaurantId}
          AND "customerPhone" IS NOT NULL
          AND "customerPhone" <> ''
          AND status != 'CANCELED'
          AND "createdAt" >= ${start}
          AND "createdAt" <= ${end}
        GROUP BY "customerPhone"
      )
      SELECT lifetime.phone,
             COALESCE(period.name, lifetime.name) AS name,
             COALESCE(period.spend, 0)::float AS "periodSpend",
             COALESCE(period.visits, 0)::int AS "periodVisits",
             lifetime.spend::float AS "lifetimeSpend",
             lifetime.visits::int AS "lifetimeVisits",
             lifetime."lastVisit"
      FROM lifetime
      LEFT JOIN period ON period.phone = lifetime.phone
      ORDER BY "periodSpend" DESC
    `;

    const today = DateTime.now().setZone(tz).startOf('day');
    const all = rows.map((r) => {
      const periodSpend = Number(r.periodSpend);
      return {
        customerPhone: r.phone,
        customerName: r.name || '',
        totalSpend: Math.round(periodSpend * 100) / 100,
        visitCount: r.periodVisits,
        avgSpendPerVisit:
          r.periodVisits > 0
            ? Math.round((periodSpend / r.periodVisits) * 100) / 100
            : 0,
        lifetimeSpend: Math.round(Number(r.lifetimeSpend) * 100) / 100,
        daysSinceLastVisit: Math.max(
          0,
          Math.floor(
            today.diff(
              DateTime.fromJSDate(new Date(r.lastVisit), { zone: tz }).startOf(
                'day',
              ),
              'days',
            ).days,
          ),
        ),
      };
    });

    // Churn is measured across the whole customer base, not just top spenders.
    const churn30 = all.filter(
      (c) => c.daysSinceLastVisit >= 30 && c.daysSinceLastVisit < 60,
    ).length;
    const churn60 = all.filter(
      (c) => c.daysSinceLastVisit >= 60 && c.daysSinceLastVisit < 90,
    ).length;
    const churn90 = all.filter((c) => c.daysSinceLastVisit >= 90).length;

    return {
      topCustomers: all
        .filter((customer) => customer.visitCount > 0)
        .slice(0, 20),
      churnRiskCount: churn30 + churn60 + churn90,
      churnRiskBreakdown: { '30d': churn30, '60d': churn60, '90d+': churn90 },
      averageClv:
        all.length > 0
          ? Math.round(
              (all.reduce((s, c) => s + c.lifetimeSpend, 0) / all.length) * 100,
            ) / 100
          : 0,
    };
  }

  // ── Kitchen efficiency (prep time estimate) ────────────────────────────────

  private async getKitchenEfficiency(
    restaurantId: string,
    start: Date,
    end: Date,
    tz: string,
  ) {
    type Row = {
      prepMinutes: number;
      hour: number;
      zoneName: string | null;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        EXTRACT(EPOCH FROM (o."updatedAt" - o."createdAt")) / 60 AS "prepMinutes",
        EXTRACT(HOUR FROM ((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::int AS hour,
        tz.name AS "zoneName"
      FROM customer_order o
      LEFT JOIN restaurant_table rt ON o."tableId" = rt.id
      LEFT JOIN table_zone tz ON rt."zoneId" = tz.id
      WHERE o."restaurantId" = ${restaurantId}
        AND o.status = 'COMPLETED'
        AND o."createdAt" >= ${start}
        AND o."createdAt" <= ${end}
        AND o."updatedAt" > o."createdAt"
        -- Prep time is estimated as createdAt → updatedAt (no completedAt column).
        -- Drop orders whose last update is hours later (stale/edited sessions) so a
        -- single multi-day order can't blow up the average.
        AND EXTRACT(EPOCH FROM (o."updatedAt" - o."createdAt")) / 60 <= ${MAX_PREP_MINUTES}
    `;

    const prepTimes = rows.map((r) => Number(r.prepMinutes));
    const avg =
      prepTimes.length > 0
        ? prepTimes.reduce((s, v) => s + v, 0) / prepTimes.length
        : 0;

    const byHourMap: Record<number, number[]> = {};
    for (const r of rows) {
      if (!byHourMap[r.hour]) byHourMap[r.hour] = [];
      byHourMap[r.hour].push(Number(r.prepMinutes));
    }
    const hourlyAverages = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      avgPrepMinutes:
        byHourMap[h] && byHourMap[h].length > 0
          ? Math.round(
              (byHourMap[h].reduce((s, v) => s + v, 0) / byHourMap[h].length) *
                10,
            ) / 10
          : 0,
      orderCount: byHourMap[h]?.length ?? 0,
    }));

    const byZone: Record<string, number[]> = {};
    for (const r of rows) {
      const zone = r.zoneName ?? 'Unzoned';
      if (!byZone[zone]) byZone[zone] = [];
      byZone[zone].push(Number(r.prepMinutes));
    }
    const zoneAverages = Object.entries(byZone).map(([zone, times]) => ({
      zone,
      avgPrepMinutes:
        Math.round((times.reduce((s, v) => s + v, 0) / times.length) * 10) / 10,
      orderCount: times.length,
    }));

    return {
      overallAvgPrepMinutes: Math.round(avg * 10) / 10,
      totalCompletedOrders: prepTimes.length,
      hourlyAverages,
      zoneAverages,
    };
  }

  // ── Cancel analytics ───────────────────────────────────────────────────────

  private async getCancelAnalytics(
    restaurantId: string,
    start: Date,
    end: Date,
    tz: string,
    language?: string,
  ) {
    type ItemRow = {
      menuItemId: string;
      itemName: string;
      totalQty: number;
      canceledQty: number;
    };
    const byItem = await this.prisma.$queryRaw<ItemRow[]>`
      SELECT
        COALESCE(oi."menuItemId", 'deleted:' || oi."itemName") AS "menuItemId",
        COALESCE(
          NULLIF(mi.translations #>> ARRAY[${language ?? ''}, 'name']::text[], ''),
          mi.name,
          MIN(oi."itemName")
        ) AS "itemName",
        SUM(oi.quantity)::int AS "totalQty",
        SUM(oi.quantity) FILTER (WHERE o.status = 'CANCELED')::int AS "canceledQty"
      FROM order_item oi
      JOIN customer_order o ON oi."orderId" = o.id
      LEFT JOIN menu_item mi ON oi."menuItemId" = mi.id
      WHERE o."restaurantId" = ${restaurantId}
        AND o."createdAt" >= ${start}
        AND o."createdAt" <= ${end}
      GROUP BY COALESCE(oi."menuItemId", 'deleted:' || oi."itemName"),
               oi."menuItemId", mi.name, mi.translations
      HAVING SUM(oi.quantity) FILTER (WHERE o.status = 'CANCELED') > 0
      ORDER BY "canceledQty" DESC
      LIMIT 20
    `;

    type HourRow = {
      hour: number;
      totalOrders: number;
      canceledOrders: number;
    };
    const byHour = await this.prisma.$queryRaw<HourRow[]>`
      SELECT
        EXTRACT(HOUR FROM (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::int AS hour,
        COUNT(*)::int AS "totalOrders",
        COUNT(*) FILTER (WHERE status = 'CANCELED')::int AS "canceledOrders"
      FROM customer_order
      WHERE "restaurantId" = ${restaurantId}
        AND "createdAt" >= ${start}
        AND "createdAt" <= ${end}
      GROUP BY hour
      ORDER BY hour
    `;

    const lostRevenue = await this.prisma.order.aggregate({
      _sum: { totalPrice: true },
      where: {
        restaurantId,
        status: OrderStatus.CANCELED,
        createdAt: { gte: start, lte: end },
      },
    });

    return {
      totalCanceledOrders: byHour.reduce((s, h) => s + h.canceledOrders, 0),
      revenueLost: Math.round((lostRevenue._sum.totalPrice ?? 0) * 100) / 100,
      cancelRateByItem: byItem.map((r) => ({
        menuItemId: r.menuItemId,
        itemName: r.itemName,
        totalQty: r.totalQty,
        canceledQty: r.canceledQty,
        cancelRate:
          r.totalQty > 0
            ? Math.round((r.canceledQty / r.totalQty) * 1000) / 10
            : 0,
      })),
      cancelRateByHour: byHour.map((r) => ({
        hour: r.hour,
        label: `${String(r.hour).padStart(2, '0')}:00`,
        totalOrders: r.totalOrders,
        canceledOrders: r.canceledOrders,
        cancelRate:
          r.totalOrders > 0
            ? Math.round((r.canceledOrders / r.totalOrders) * 1000) / 10
            : 0,
      })),
    };
  }

  // ── Table turnover / revenue per occupied table-hour ──────────────────────

  private async getTableTurnover(restaurantId: string, start: Date, end: Date) {
    type Row = {
      tableId: string;
      tableName: string | null;
      sessionCount: number;
      avgDurationMinutes: number;
      totalDurationMinutes: number;
      totalRevenue: number;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      WITH payment_totals AS (
        SELECT "tableSessionId",
               COALESCE(SUM(amount - "tipAmount"), 0)::float AS revenue
        FROM payment
        WHERE "restaurantId" = ${restaurantId}
          AND status = 'SUCCEEDED'
          AND "tableSessionId" IS NOT NULL
        GROUP BY "tableSessionId"
      )
      SELECT
        ts."tableId",
        MIN(rt.name) AS "tableName",
        COUNT(*)::int AS "sessionCount",
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (ts."paidAt" - ts."createdAt")) / 60)
            FILTER (WHERE ts."paidAt" IS NOT NULL),
          0
        )::float AS "avgDurationMinutes",
        COALESCE(
          SUM(EXTRACT(EPOCH FROM (ts."paidAt" - ts."createdAt")) / 60)
            FILTER (WHERE ts."paidAt" IS NOT NULL),
          0
        )::float AS "totalDurationMinutes",
        COALESCE(SUM(payment_totals.revenue), 0)::float AS "totalRevenue"
      FROM table_session ts
      LEFT JOIN restaurant_table rt ON ts."tableId" = rt.id
      LEFT JOIN payment_totals ON payment_totals."tableSessionId" = ts.id
      WHERE ts."restaurantId" = ${restaurantId}
        AND ts."isServicePoint" = false
        AND ts."createdAt" >= ${start}
        AND ts."createdAt" <= ${end}
      GROUP BY ts."tableId"
      ORDER BY "sessionCount" DESC
    `;

    return rows.map((r) => {
      const avgDur = Number(r.avgDurationMinutes);
      const totalDuration = Number(r.totalDurationMinutes);
      const rev = Number(r.totalRevenue);
      const revenuePerOccupiedHour =
        totalDuration > 0
          ? Math.round((rev / (totalDuration / 60)) * 100) / 100
          : 0;
      const estimatedTurns =
        avgDur > 0 ? Math.round(((24 * 60) / avgDur) * 10) / 10 : 0;
      return {
        tableId: r.tableId,
        tableName: r.tableName ?? '',
        sessionCount: r.sessionCount,
        avgDurationMinutes: Math.round(avgDur * 10) / 10,
        estimatedTurnsPer24Hours: estimatedTurns,
        totalRevenue: Math.round(rev * 100) / 100,
        revenuePerOccupiedHour,
      };
    });
  }

  // ── Menu profitability (cost-based) ────────────────────────────────────────

  private async getMenuProfitability(
    restaurantId: string,
    start: Date,
    end: Date,
    language?: string,
  ) {
    type Row = {
      menuItemId: string;
      item_name: string;
      quantity: number;
      revenue: number;
      totalCost: number;
      costPrice: number | null;
    };
    const rows = await this.prisma.$queryRaw<Row[]>`
      SELECT
        COALESCE(oi."menuItemId", 'deleted:' || oi."itemName") AS "menuItemId",
        COALESCE(
          NULLIF(mi.translations #>> ARRAY[${language ?? ''}, 'name']::text[], ''),
          mi.name,
          MIN(oi."itemName")
        ) AS item_name,
        SUM(oi.quantity)::int AS quantity,
        COALESCE(SUM(oi."unitPriceWithOptions" * oi.quantity), 0)::float AS revenue,
        COALESCE(SUM(COALESCE(mi."costPrice", 0) * oi.quantity), 0)::float AS "totalCost",
        mi."costPrice" AS "costPrice"
      FROM order_item oi
      JOIN customer_order o ON oi."orderId" = o.id
      LEFT JOIN menu_item mi ON oi."menuItemId" = mi.id
      WHERE o."restaurantId" = ${restaurantId}
        AND o.status != 'CANCELED'
        AND o."createdAt" >= ${start}
        AND o."createdAt" <= ${end}
      GROUP BY COALESCE(oi."menuItemId", 'deleted:' || oi."itemName"),
               oi."menuItemId", mi.name, mi.translations, mi."costPrice"
      ORDER BY SUM(oi.quantity) DESC
    `;

    const missingCostItems = rows.filter(
      (row) => Number(row.costPrice ?? 0) <= 0,
    ).length;
    const items = rows
      .filter((row) => Number(row.costPrice ?? 0) > 0)
      .map((r) => {
        const revenue = Number(r.revenue);
        const cost = Number(r.totalCost);
        const profit = revenue - cost;
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
        return {
          menuItemId: r.menuItemId,
          name: r.item_name,
          quantity: Number(r.quantity),
          revenue: Math.round(revenue * 100) / 100,
          cost: Math.round(cost * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          margin: Math.round(margin * 10) / 10,
        };
      });

    // Median-based quadrant classification (menu engineering matrix)
    const quantities = items.map((i) => i.quantity).sort((a, b) => a - b);
    const medianQty =
      quantities.length > 0 ? quantities[Math.floor(quantities.length / 2)] : 0;
    const margins = items.map((i) => i.margin).sort((a, b) => a - b);
    const medianMargin =
      margins.length > 0 ? margins[Math.floor(margins.length / 2)] : 0;

    const withQuadrant = items.map((i) => ({
      ...i,
      quadrant:
        i.quantity >= medianQty && i.margin >= medianMargin
          ? 'Star'
          : i.quantity >= medianQty && i.margin < medianMargin
            ? 'Plowhorse'
            : i.quantity < medianQty && i.margin >= medianMargin
              ? 'Puzzle'
              : 'Dog',
    }));

    const totalCost = items.reduce((s, i) => s + i.cost, 0);
    const totalProfit = items.reduce((s, i) => s + i.profit, 0);
    const totalRevenue = items.reduce((s, i) => s + i.revenue, 0);

    return {
      items: withQuadrant,
      summary: {
        totalCost: Math.round(totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        overallMargin:
          totalRevenue > 0
            ? Math.round((totalProfit / totalRevenue) * 1000) / 10
            : 0,
        missingCostItems,
      },
    };
  }

  // ── Gross profit ───────────────────────────────────────────────────────────

  private async getGrossProfit(restaurantId: string, start: Date, end: Date) {
    const [sales, cogsResult] = await Promise.all([
      this.prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: {
          restaurantId,
          status: { not: OrderStatus.CANCELED },
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.$queryRaw<{ totalCost: number; missingCostItems: number }[]>`
        SELECT COALESCE(SUM(COALESCE(mi."costPrice", 0) * oi.quantity), 0)::float AS "totalCost",
               (COUNT(DISTINCT COALESCE(oi."menuItemId", 'deleted:' || oi."itemName"))
                 FILTER (WHERE mi.id IS NULL OR COALESCE(mi."costPrice", 0) <= 0))::int
                 AS "missingCostItems"
        FROM order_item oi
        JOIN customer_order o ON oi."orderId" = o.id
        LEFT JOIN menu_item mi ON oi."menuItemId" = mi.id
        WHERE o."restaurantId" = ${restaurantId}
          AND o.status != 'CANCELED'
          AND o."createdAt" >= ${start}
          AND o."createdAt" <= ${end}
      `,
    ]);

    // Sales and COGS use the same non-canceled, order-created cohort.
    const netSales = Math.round((sales._sum.totalPrice ?? 0) * 100) / 100;
    const estimatedCOGS =
      cogsResult.length > 0
        ? Math.round(Number(cogsResult[0].totalCost) * 100) / 100
        : 0;
    const grossProfit = Math.round((netSales - estimatedCOGS) * 100) / 100;
    const grossMargin =
      netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : 0;

    return {
      netSales,
      estimatedCOGS,
      grossProfit,
      grossMargin,
      missingCostItems: Number(cogsResult[0]?.missingCostItems ?? 0),
    };
  }

  // ── Daily target ───────────────────────────────────────────────────────────

  async getDailyTarget(restaurantId: string, dateStr?: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = restaurant?.timezone || 'Europe/Sofia';
    const date = dateStr
      ? DateTime.fromISO(dateStr, { zone: tz }).startOf('day').toJSDate()
      : DateTime.now().setZone(tz).startOf('day').toJSDate();

    const endOfDay = DateTime.fromJSDate(date, { zone: tz })
      .endOf('day')
      .toJSDate();

    const [target, actual] = await Promise.all([
      this.prisma.dailyTarget.findUnique({
        where: { restaurantId_targetDate: { restaurantId, targetDate: date } },
      }),
      this.prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: {
          restaurantId,
          status: { not: OrderStatus.CANCELED },
          createdAt: { gte: date, lte: endOfDay },
        },
      }),
    ]);

    return {
      target: target?.dailyRevenue ?? 0,
      actual: Math.round((actual._sum.totalPrice ?? 0) * 100) / 100,
    };
  }

  async setDailyTarget(
    restaurantId: string,
    dateStr: string,
    dailyRevenue: number,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = restaurant?.timezone || 'Europe/Sofia';
    const targetDate = DateTime.fromISO(dateStr, { zone: tz })
      .startOf('day')
      .toJSDate();

    await this.prisma.dailyTarget.upsert({
      where: { restaurantId_targetDate: { restaurantId, targetDate } },
      create: { restaurantId, targetDate, dailyRevenue },
      update: { dailyRevenue },
    });

    return { success: true, targetDate: dateStr, dailyRevenue };
  }

  // ── Daily closeout (accountant report) ─────────────────────────────────────

  async getDailyCloseout(restaurantId: string, dateStr: string) {
    const tzResult = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { timezone: true },
    });
    const tz = tzResult?.timezone || 'Europe/Sofia';
    const date = DateTime.fromISO(dateStr, { zone: tz }).startOf('day');
    const start = date.toJSDate();
    const end = date.endOf('day').toJSDate();

    const [
      byMethod,
      tips,
      orders,
      refunds,
      cancelled,
      orderCount,
      canceledCount,
    ] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['provider'],
        _sum: { amount: true },
        where: {
          restaurantId,
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.payment.aggregate({
        _sum: { tipAmount: true },
        where: {
          restaurantId,
          status: { in: [PaymentStatus.SUCCEEDED, PaymentStatus.REFUNDED] },
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.order.aggregate({
        _sum: {
          totalPrice: true,
          pointsRedeemedForDiscount: true,
        },
        where: {
          restaurantId,
          status: { not: OrderStatus.CANCELED },
          createdAt: { gte: start, lte: end },
        },
      }),
      this.getRefundTotals(restaurantId, start, end),
      this.prisma.order.aggregate({
        _sum: { totalPrice: true },
        where: {
          restaurantId,
          status: OrderStatus.CANCELED,
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          status: { not: OrderStatus.CANCELED },
          createdAt: { gte: start, lte: end },
        },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          status: OrderStatus.CANCELED,
          createdAt: { gte: start, lte: end },
        },
      }),
    ]);

    const collectedRevenue =
      Math.round(byMethod.reduce((s, m) => s + (m._sum.amount ?? 0), 0) * 100) /
      100;
    const totalTips = Math.round((tips._sum.tipAmount ?? 0) * 100) / 100;
    const orderedRevenue =
      Math.round((orders._sum.totalPrice ?? 0) * 100) / 100;
    const discountPointsRedeemed = orders._sum.pointsRedeemedForDiscount ?? 0;
    const refundedAmount = refunds.grossAmount;
    const canceledRevenue =
      Math.round((cancelled._sum.totalPrice ?? 0) * 100) / 100;

    return {
      date: dateStr,
      revenueByMethod: byMethod.map((m) => ({
        method: m.provider,
        amount: Math.round((m._sum.amount ?? 0) * 100) / 100,
      })),
      totalCollected: collectedRevenue,
      totalTips,
      orderedRevenue,
      discountPointsRedeemed,
      refundedAmount,
      canceledRevenue,
      // Gross intake includes tips and payments later refunded. Net sales remove
      // tips from intake and the sales portion of refunds completed on this day.
      netRevenue:
        Math.round((collectedRevenue - totalTips - refunds.salesAmount) * 100) /
        100,
      totalOrderCount: orderCount,
      canceledOrderCount: canceledCount,
    };
  }
}
