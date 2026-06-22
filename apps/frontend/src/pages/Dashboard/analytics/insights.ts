import { dayParts, safePercent } from "./shared";

// Pure derivation of the dashboard's computed insights from the analytics
// payload. Extracted verbatim from AnalyticsView's `insights` useMemo so the
// component keeps only orchestration. `data` is the (untyped) useAnalytics
// result; returns null when there is no data.
export const computeInsights = (data: any) => {
  if (!data) return null;

  const trend = data.revenueTrend ?? [];
  const topItems = data.topItems ?? [];
  const peakHours = data.peakHours ?? [];
  const tables = data.ordersByTable ?? [];
  const statuses = data.ordersByStatus ?? [];

  const bestDay = trend.reduce(
    (best: any, point: any) => (point.revenue > best.revenue ? point : best),
    trend[0],
  );
  const quietDay = trend.reduce(
    (quiet: any, point: any) => (point.orders < quiet.orders ? point : quiet),
    trend[0],
  );
  const averageDailyRevenue =
    trend.length > 0 ? data.totalRevenue / trend.length : 0;
  const peakHour = peakHours.reduce(
    (max: any, hour: any) => (hour.orders > max.orders ? hour : max),
    peakHours[0],
  );
  const peakRevenueHour = peakHours.reduce(
    (max: any, hour: any) =>
      (hour.revenue ?? 0) > (max?.revenue ?? 0) ? hour : max,
    peakHours[0],
  );

  const windowScores = peakHours.map((hour: any, index: number) => {
    const next = peakHours[(index + 1) % peakHours.length];
    const third = peakHours[(index + 2) % peakHours.length];
    return {
      start: hour.hour,
      end: (hour.hour + 3) % 24,
      label: `${hour.label}-${third?.label ?? hour.label}`,
      orders: hour.orders + (next?.orders ?? 0) + (third?.orders ?? 0),
    };
  });
  const busiestWindow = windowScores.reduce(
    (max: any, current: any) => (current.orders > max.orders ? current : max),
    windowScores[0],
  );

  const topItemRevenue = topItems.reduce(
    (sum: number, item: any) => sum + item.revenue,
    0,
  );
  const topThreeRevenue = topItems
    .slice(0, 3)
    .reduce((sum: number, item: any) => sum + item.revenue, 0);
  const heroItem = topItems[0];
  const bestTable = tables[0];
  const completed =
    statuses.find((status: any) => status.status === "COMPLETED")?.count ?? 0;
  const canceled =
    statuses.find((status: any) => status.status === "CANCELED")?.count ?? 0;
  const cancelRate = safePercent(canceled, data.totalOrders);
  const topThreeShare = safePercent(topThreeRevenue, data.totalRevenue);
  const topItemShare = safePercent(heroItem?.revenue ?? 0, data.totalRevenue);

  const dayPartTotals = dayParts.map((part) => {
    const orders = part.range.reduce(
      (sum: number, hour: number) =>
        sum + (peakHours.find((h: any) => h.hour === hour)?.orders ?? 0),
      0,
    );
    return { ...part, orders, share: safePercent(orders, data.totalOrders) };
  });

  return {
    trend,
    topItems,
    peakHours,
    tables,
    statuses,
    bestDay,
    quietDay,
    averageDailyRevenue,
    peakHour,
    peakRevenueHour,
    busiestWindow,
    topItemRevenue,
    heroItem,
    bestTable,
    completed,
    canceled,
    cancelRate,
    topThreeShare,
    topItemShare,
    dayPartTotals,
  };
};
