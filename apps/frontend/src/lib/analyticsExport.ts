import writeXlsxFile from 'write-excel-file/browser';
import type { TFunction } from 'i18next';
import type { AnalyticsData, PeakHour } from '../hooks/useAnalytics';
import { BGN_RATE } from './currency';

export interface ExportMeta {
  restaurantName: string;
  startDate?: string;
  endDate?: string;
  period: number;
}

export interface FeedbackExportData {
  totalFeedbacks: number;
  averageRating: number;
  ratingDistribution: Record<number, number>;
  googleRedirects: number;
  positiveRate: number;
}

interface Cell {
  value?: boolean | number | string | Date | null;
  type?: typeof Number | typeof String | typeof Boolean | typeof Date;
  format?: string;
  fontWeight?: 'bold';
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  align?: 'left' | 'center' | 'right';
}

const HEADER_BG = '#4f46e5';
const SECTION_BG = '#ede9fe';
const HEADER_FG = '#ffffff';
const EUR_FORMAT = '"EUR "#,##0.00';
const BGN_FORMAT = '#,##0.00" BGN"';
const PCT_FORMAT = '0.0"%"';

const dayParts = [
  { id: 'morning', range: [6, 7, 8, 9, 10, 11] },
  { id: 'lunch', range: [12, 13, 14, 15] },
  { id: 'dinner', range: [16, 17, 18, 19, 20, 21] },
  { id: 'late', range: [22, 23, 0, 1, 2, 3, 4, 5] },
];

const orderStatusKeyMap: Record<string, string> = {
  PENDING: 'analytics.statusPending',
  CONFIRMED: 'analytics.statusConfirmed',
  PREPARING: 'analytics.statusPreparing',
  READY: 'analytics.statusReady',
  SERVED: 'analytics.statusServed',
  DELIVERED: 'analytics.statusDelivered',
  CANCELED: 'analytics.statusCanceled',
  REJECTED: 'analytics.statusRejected',
};

function h(value: string): Cell {
  return { value, fontWeight: 'bold', backgroundColor: HEADER_BG, textColor: HEADER_FG };
}

function section(value: string, cols: number): Cell[] {
  return [
    { value, fontWeight: 'bold', backgroundColor: SECTION_BG, textColor: '#312e81', fontSize: 14 },
    ...Array.from({ length: cols - 1 }, () => ({ value: null, backgroundColor: SECTION_BG })),
  ];
}

function eur(value: number): Cell {
  return { value, type: Number, format: EUR_FORMAT };
}

function bgn(eurValue: number): Cell {
  return { value: eurValue * BGN_RATE, type: Number, format: BGN_FORMAT };
}

function int(value: number): Cell {
  return { value, type: Number };
}

function pct(value: number): Cell {
  return { value, type: Number, format: PCT_FORMAT };
}

function text(value?: string | number | null): Cell {
  return { value: value == null ? '' : String(value) };
}

function empty(): Cell {
  return { value: null };
}

function noDataRow(t: TFunction, cols: number): Cell[][] {
  return [
    Array.from({ length: cols }, (_, i) =>
      i === 0 ? { value: t('analytics.export.noData', 'No data for this period') } : empty(),
    ),
  ];
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`;
}

function safePercent(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function resolveRange(meta: ExportMeta, t: TFunction): { from: Date; to: Date; label: string } {
  if (meta.startDate && meta.endDate) {
    return {
      from: new Date(meta.startDate),
      to: new Date(meta.endDate),
      label: t('analytics.export.labels.customRange', {
        start: meta.startDate,
        end: meta.endDate,
        defaultValue: `${meta.startDate} to ${meta.endDate}`,
      }),
    };
  }
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - meta.period);
  return {
    from,
    to,
    label: t('analytics.export.labels.lastDays', {
      days: meta.period,
      defaultValue: `Last ${meta.period} days`,
    }),
  };
}

function topBy<T>(items: T[], value: (item: T) => number): T | undefined {
  return items.reduce<T | undefined>((best, item) => {
    if (!best) return item;
    return value(item) > value(best) ? item : best;
  }, undefined);
}

function getBusiestWindow(hours: PeakHour[]) {
  if (hours.length === 0) return undefined;

  return hours
    .map((hour, index) => {
      const next = hours[(index + 1) % hours.length];
      const third = hours[(index + 2) % hours.length];
      return {
        start: hour.hour,
        end: (hour.hour + 2) % 24,
        label: `${formatHour(hour.hour)}-${formatHour((hour.hour + 2) % 24)}`,
        orders: hour.orders + (next?.orders ?? 0) + (third?.orders ?? 0),
      };
    })
    .reduce((best, current) => (current.orders > best.orders ? current : best));
}

function getDayPartRows(data: AnalyticsData, t: TFunction): Cell[][] {
  return dayParts.map((part) => {
    const orders = part.range.reduce(
      (sum, hour) => sum + (data.peakHours.find((h) => h.hour === hour)?.orders ?? 0),
      0,
    );
    return [
      text(t(`analytics.export.dayParts.${part.id}`, part.id)),
      text(part.range.map(formatHour).join(', ')),
      int(orders),
      pct(safePercent(orders, data.totalOrders)),
    ];
  });
}

export async function downloadAnalyticsExport(
  data: AnalyticsData,
  meta: ExportMeta,
  t: TFunction,
  feedback?: FeedbackExportData | null,
): Promise<void> {
  const range = resolveRange(meta, t);
  const ex = (key: string, fallback: string, options?: Record<string, unknown>) =>
    t(`analytics.export.${key}`, { defaultValue: fallback, ...(options ?? {}) });
  const slug = toSlug(meta.restaurantName || 'restaurant');
  const fileName = `analytics-${slug}-${fmtDate(range.from)}_to_${fmtDate(range.to)}.xlsx`;

  const bestDay = topBy(data.revenueTrend, (row) => row.revenue);
  const quietDay = topBy(data.revenueTrend, (row) => -row.orders);
  const peakHour = topBy(data.peakHours, (row) => row.orders);
  const busiestWindow = getBusiestWindow(data.peakHours);
  const heroItem = data.topItems[0];
  const topThreeRevenue = data.topItems.slice(0, 3).reduce((sum, item) => sum + item.revenue, 0);
  const bestTable = data.ordersByTable[0];
  const served = data.ordersByStatus.find((row) => row.status === 'SERVED')?.count ?? 0;
  const canceled = data.ordersByStatus.find((row) => row.status === 'CANCELED')?.count ?? 0;
  const cancelRate = safePercent(canceled, data.totalOrders);
  const topItemRevenue = data.topItems.reduce((sum, item) => sum + item.revenue, 0);

  const summarySheet: Cell[][] = [
    section(ex('sections.exportDetails', 'Export details'), 5),
    [h(ex('columns.field', 'Field')), h(ex('columns.value', 'Value')), h(ex('columns.eur', 'EUR')), h(ex('columns.bgn', 'BGN')), h(ex('columns.notes', 'Notes'))],
    [text(ex('summary.restaurant', 'Restaurant')), text(meta.restaurantName), empty(), empty(), empty()],
    [text(ex('summary.period', 'Period')), text(range.label), empty(), empty(), text(ex('labels.previousPeriod', 'Previous: {{start}} to {{end}}', { start: data.prevPeriodStart ?? '-', end: data.prevPeriodEnd ?? '-' }))],
    [text(ex('summary.generatedAt', 'Generated at')), text(new Date().toLocaleString()), empty(), empty(), empty()],
    [empty(), empty(), empty(), empty(), empty()],
    section(ex('sections.kpiCards', 'KPI cards'), 5),
    [h(ex('columns.metric', 'Metric')), h(ex('columns.value', 'Value')), h(ex('columns.eur', 'EUR')), h(ex('columns.bgn', 'BGN')), h(ex('columns.changeDetail', 'Change / detail'))],
    [text(ex('metrics.revenue', 'Revenue')), empty(), eur(data.totalRevenue), bgn(data.totalRevenue), pct(data.comparison.revenueChange)],
    [text(ex('metrics.orders', 'Orders')), int(data.totalOrders), empty(), empty(), pct(data.comparison.ordersChange)],
    [text(ex('metrics.avgOrderValue', 'Average order value')), empty(), eur(data.avgOrderValue), bgn(data.avgOrderValue), pct(data.comparison.avgOrderValueChange)],
    [text(ex('metrics.activeCustomers', 'Active customers')), int(data.newCustomers), empty(), empty(), pct(data.comparison.newCustomersChange)],
    [text(ex('metrics.servedRate', 'Served rate')), pct(data.servedRate), empty(), empty(), text(ex('labels.completedOrders', '{{count}} completed orders', { count: served }))],
    [empty(), empty(), empty(), empty(), empty()],
    section(ex('sections.insightCards', 'Insight cards'), 5),
    [h(ex('columns.insight', 'Insight')), h(ex('columns.primaryValue', 'Primary value')), h(ex('columns.eur', 'EUR')), h(ex('columns.bgn', 'BGN')), h(ex('columns.detail', 'Detail'))],
    [
      text(ex('insights.revenueLeader', 'Revenue leader')),
      text(bestDay?.date ?? '-'),
      eur(bestDay?.revenue ?? 0),
      bgn(bestDay?.revenue ?? 0),
      text(ex('labels.ordersCount', '{{count}} orders', { count: bestDay?.orders ?? 0 })),
    ],
    [
      text(ex('insights.peakWindow', 'Peak window')),
      text(busiestWindow?.label ?? '-'),
      empty(),
      empty(),
      text(ex('labels.busiestWindowOrders', '{{count}} orders in the busiest 3 hours', { count: busiestWindow?.orders ?? 0 })),
    ],
    [
      text(ex('insights.top3MenuShare', 'Top 3 menu share')),
      pct(safePercent(topThreeRevenue, data.totalRevenue)),
      eur(topThreeRevenue),
      bgn(topThreeRevenue),
      text(heroItem
        ? ex('labels.heroLeads', '{{name}} leads with {{share}}%', { name: heroItem.name, share: safePercent(heroItem.revenue, data.totalRevenue).toFixed(1) })
        : ex('labels.noItemData', 'No item data')),
    ],
    [
      text(ex('insights.bestTable', 'Best table')),
      text(bestTable?.table ?? '-'),
      eur(bestTable?.revenue ?? 0),
      bgn(bestTable?.revenue ?? 0),
      text(ex('labels.ordersCount', '{{count}} orders', { count: bestTable?.orders ?? 0 })),
    ],
    [empty(), empty(), empty(), empty(), empty()],
    section(ex('sections.actionableSignals', 'Actionable signals'), 5),
    [h(ex('columns.signal', 'Signal')), h(ex('columns.value', 'Value')), h(ex('columns.eur', 'EUR')), h(ex('columns.bgn', 'BGN')), h(ex('columns.recommendation', 'Recommendation'))],
    [
      text(ex('signals.protectRush', 'Protect the rush')),
      text(busiestWindow?.label ?? '-'),
      empty(),
      empty(),
      text(busiestWindow
        ? ex('labels.protectRushRecommendation', '{{count}} orders: schedule strongest coverage.', { count: busiestWindow.orders })
        : ex('labels.noRushPattern', 'No rush pattern yet.')),
    ],
    [
      text(ex('signals.pushHero', 'Push the hero')),
      text(heroItem?.name ?? '-'),
      eur(heroItem?.revenue ?? 0),
      bgn(heroItem?.revenue ?? 0),
      text(heroItem ? ex('labels.pushHeroRecommendation', 'Use this item in combos, QR highlights, and staff suggestions.') : ex('labels.noItemDataYet', 'No item data yet.')),
    ],
    [
      text(ex('signals.watchCancellations', 'Watch cancellations')),
      pct(cancelRate),
      empty(),
      empty(),
      text(ex('labels.cancelledOrders', '{{count}} cancelled orders', { count: canceled })),
    ],
    [
      text(ex('signals.liftQuietDays', 'Lift quiet days')),
      text(quietDay?.date ?? '-'),
      eur(quietDay?.revenue ?? 0),
      bgn(quietDay?.revenue ?? 0),
      text(quietDay
        ? ex('labels.liftQuietDaysRecommendation', '{{count}} orders: test a timed offer.', { count: quietDay.orders })
        : ex('labels.noDailyData', 'No daily data yet.')),
    ],
  ];

  const revenueTrendSheet: Cell[][] = [
    [h(ex('columns.date', 'Date')), h(ex('columns.revenueEur', 'Revenue EUR')), h(ex('columns.revenueBgnExcel', 'Revenue BGN')), h(ex('columns.orders', 'Orders')), h(ex('columns.avgOrderEur', 'Avg order EUR')), h(ex('columns.avgOrderBgn', 'Avg order BGN'))],
    ...(data.revenueTrend.length > 0
      ? data.revenueTrend.map((row) => {
          const avg = row.orders > 0 ? row.revenue / row.orders : 0;
          return [text(row.date), eur(row.revenue), bgn(row.revenue), int(row.orders), eur(avg), bgn(avg)];
        })
      : noDataRow(t, 6)),
  ];

  const demandSheet: Cell[][] = [
    section(ex('sections.hourlyDemand', 'Hourly demand'), 6),
    [h(ex('columns.hour', 'Hour')), h(ex('columns.orders', 'Orders')), h(ex('columns.shareOfTotal', 'Share of total')), h(ex('columns.shareOfPeak', 'Share of peak')), h(ex('columns.segment', 'Segment')), h(ex('columns.note', 'Note'))],
    ...(data.peakHours.length > 0
      ? data.peakHours.map((row) => {
          const shareOfPeak = peakHour && peakHour.orders > 0 ? safePercent(row.orders, peakHour.orders) : 0;
          const segment = row.orders === 0
            ? ex('segments.noOrders', 'No orders')
            : row.hour === peakHour?.hour
              ? ex('segments.peak', 'Peak')
              : shareOfPeak >= 65
                ? ex('segments.busy', 'Busy')
                : ex('segments.quiet', 'Quiet');
          return [
            text(formatHour(row.hour)),
            int(row.orders),
            pct(safePercent(row.orders, data.totalOrders)),
            pct(shareOfPeak),
            text(segment),
            text(ex('labels.visibleInDemandMap', 'Visible in demand map')),
          ];
        })
      : noDataRow(t, 6)),
    [empty(), empty(), empty(), empty(), empty(), empty()],
    section(ex('sections.daypartDemand', 'Daypart demand'), 6),
    [h(ex('columns.daypart', 'Daypart')), h(ex('columns.hours', 'Hours')), h(ex('columns.orders', 'Orders')), h(ex('columns.shareOfTotal', 'Share of total')), empty(), empty()],
    ...getDayPartRows(data, t),
  ];

  const menuSheet: Cell[][] = [
    [h(ex('columns.rank', 'Rank')), h(ex('columns.item', 'Item')), h(ex('columns.quantitySold', 'Quantity sold')), h(ex('columns.revenueEur', 'Revenue EUR')), h(ex('columns.revenueBgnExcel', 'Revenue BGN')), h(ex('columns.avgItemYieldEur', 'Avg item yield EUR')), h(ex('columns.revenueShare', 'Revenue share'))],
    ...(data.topItems.length > 0
      ? data.topItems.map((item, index) => [
          int(index + 1),
          text(item.name),
          int(item.quantity),
          eur(item.revenue),
          bgn(item.revenue),
          eur(item.quantity > 0 ? item.revenue / item.quantity : 0),
          pct(safePercent(item.revenue, data.totalRevenue)),
        ])
      : noDataRow(t, 7)),
    [empty(), empty(), empty(), empty(), empty(), empty(), empty()],
    [text(ex('metrics.trackedTopItemRevenue', 'Tracked top item revenue')), empty(), empty(), eur(topItemRevenue), bgn(topItemRevenue), empty(), pct(safePercent(topItemRevenue, data.totalRevenue))],
  ];

  const categoriesSheet: Cell[][] = [
    [h(ex('columns.category', 'Category')), h(ex('columns.revenueEur', 'Revenue EUR')), h(ex('columns.revenueBgnExcel', 'Revenue BGN')), h(ex('columns.shareOfRevenue', 'Share of revenue'))],
    ...(data.categoryBreakdown.length > 0
      ? data.categoryBreakdown.map((row) => [
          text(row.category),
          eur(row.revenue),
          bgn(row.revenue),
          pct(safePercent(row.revenue, data.totalRevenue)),
        ])
      : noDataRow(t, 4)),
  ];

  const tablesSheet: Cell[][] = [
    [h(ex('columns.table', 'Table')), h(ex('columns.orders', 'Orders')), h(ex('columns.revenueEur', 'Revenue EUR')), h(ex('columns.revenueBgnExcel', 'Revenue BGN')), h(ex('columns.avgOrderEur', 'Avg order EUR')), h(ex('columns.revenueShare', 'Revenue share'))],
    ...(data.ordersByTable.length > 0
      ? data.ordersByTable.map((row) => [
          text(row.table),
          int(row.orders),
          eur(row.revenue),
          bgn(row.revenue),
          eur(row.orders > 0 ? row.revenue / row.orders : 0),
          pct(safePercent(row.revenue, data.totalRevenue)),
        ])
      : noDataRow(t, 6)),
  ];

  const orderFlowSheet: Cell[][] = [
    [h(ex('columns.status', 'Status')), h(ex('columns.orders', 'Orders')), h(ex('columns.shareOfSelectedOrders', 'Share of selected orders'))],
    ...(data.ordersByStatus.length > 0
      ? data.ordersByStatus.map((row) => [
          text(t(orderStatusKeyMap[row.status] ?? '', row.status.replace('_', ' '))),
          int(row.count),
          pct(safePercent(row.count, data.totalOrders)),
        ])
      : noDataRow(t, 3)),
  ];

  const guestSheet: Cell[][] = feedback
    ? [
        section(ex('sections.guestVoiceSummary', 'Guest voice summary'), 4),
        [h(ex('columns.metric', 'Metric')), h(ex('columns.value', 'Value')), empty(), empty()],
        [text(ex('metrics.totalFeedbacks', 'Total feedbacks')), int(feedback.totalFeedbacks), empty(), empty()],
        [text(ex('metrics.averageRating', 'Average rating')), int(feedback.averageRating), empty(), empty()],
        [text(ex('metrics.positiveRate', 'Positive rate')), pct(feedback.positiveRate), empty(), empty()],
        [text(ex('metrics.googleRedirects', 'Google redirects')), int(feedback.googleRedirects), empty(), empty()],
        [empty(), empty(), empty(), empty()],
        section(ex('sections.ratingDistribution', 'Rating distribution'), 4),
        [h(ex('columns.rating', 'Rating')), h(ex('columns.count', 'Count')), h(ex('columns.share', 'Share')), empty()],
        ...[5, 4, 3, 2, 1].map((rating) => {
          const count = feedback.ratingDistribution?.[rating] ?? 0;
          return [text(ex('labels.starRating', '{{rating}} star', { rating })), int(count), pct(safePercent(count, feedback.totalFeedbacks)), empty()];
        }),
      ]
    : [
        [h(ex('columns.metric', 'Metric')), h(ex('columns.value', 'Value'))],
        [text(ex('metrics.guestFeedback', 'Guest feedback')), text(ex('labels.noFeedbackLoaded', 'No feedback data loaded for this export'))],
      ];

  const sheets = [
    {
      sheet: ex('sheets.summary', 'Summary'),
      columns: [{ width: 26 }, { width: 28 }, { width: 16 }, { width: 16 }, { width: 48 }],
      data: summarySheet as any,
    },
    {
      sheet: ex('sheets.revenueTrend', 'Revenue Trend'),
      columns: [{ width: 14 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 16 }, { width: 16 }],
      data: revenueTrendSheet as any,
    },
    {
      sheet: ex('sheets.demandMap', 'Demand Map'),
      columns: [{ width: 12 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 24 }],
      data: demandSheet as any,
    },
    {
      sheet: ex('sheets.menuEngineering', 'Menu Engineering'),
      columns: [{ width: 8 }, { width: 38 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 14 }],
      data: menuSheet as any,
    },
    {
      sheet: ex('sheets.categories', 'Categories'),
      columns: [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 16 }],
      data: categoriesSheet as any,
    },
    {
      sheet: ex('sheets.tableYield', 'Table Yield'),
      columns: [{ width: 18 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 }],
      data: tablesSheet as any,
    },
    {
      sheet: ex('sheets.orderFlow', 'Order Flow'),
      columns: [{ width: 18 }, { width: 10 }, { width: 20 }],
      data: orderFlowSheet as any,
    },
    {
      sheet: ex('sheets.guestVoice', 'Guest Voice'),
      columns: [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }],
      data: guestSheet as any,
    },
  ];

  const wb = await writeXlsxFile(sheets);
  await wb.toFile(fileName);
}
