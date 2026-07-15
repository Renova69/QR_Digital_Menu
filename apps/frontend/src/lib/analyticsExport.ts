import writeXlsxFile from "write-excel-file/browser";
import type { TFunction } from "i18next";
import type { AnalyticsData, PeakHour } from "../hooks/useAnalytics";
import { BGN_RATE } from "./currency";

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
  fontWeight?: "bold";
  fontSize?: number;
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
}

const HEADER_BG = "#4f46e5";
const SECTION_BG = "#ede9fe";
const HEADER_FG = "#ffffff";
const EUR_FORMAT = '"EUR "#,##0.00';
const BGN_FORMAT = '#,##0.00" BGN"';
const PCT_FORMAT = '0.0"%"';

const dayParts = [
  { id: "morning", range: [6, 7, 8, 9, 10, 11] },
  { id: "lunch", range: [12, 13, 14, 15] },
  { id: "dinner", range: [16, 17, 18, 19, 20, 21] },
  { id: "late", range: [22, 23, 0, 1, 2, 3, 4, 5] },
];

const orderStatusKeyMap: Record<string, string> = {
  PENDING: "analytics.statusPending",
  CONFIRMED: "analytics.statusConfirmed",
  PREPARING: "analytics.statusPreparing",
  READY: "analytics.statusReady",
  SERVED: "analytics.statusServed",
  DELIVERED: "analytics.statusDelivered",
  CANCELED: "analytics.statusCanceled",
  REJECTED: "analytics.statusRejected",
};

function h(value: string): Cell {
  return {
    value,
    fontWeight: "bold",
    backgroundColor: HEADER_BG,
    textColor: HEADER_FG,
  };
}

function section(value: string, cols: number): Cell[] {
  return [
    {
      value,
      fontWeight: "bold",
      backgroundColor: SECTION_BG,
      textColor: "#312e81",
      fontSize: 14,
    },
    ...Array.from({ length: cols - 1 }, () => ({
      value: null,
      backgroundColor: SECTION_BG,
    })),
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

// Force literal-text rendering for any cell whose value would otherwise be
// parsed as a formula by Excel/Sheets (leading = + - @ / tab / CR). Menu item
// names flow into this export, so the same CSV-injection guard applies (#29).
function sanitizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function text(value?: string | number | null): Cell {
  return { value: value == null ? "" : sanitizeFormula(String(value)) };
}

function empty(): Cell {
  return { value: null };
}

function noDataRow(t: TFunction, cols: number): Cell[][] {
  return [
    Array.from({ length: cols }, (_, i) =>
      i === 0
        ? { value: t("analytics.export.noData", "No data for this period") }
        : empty(),
    ),
  ];
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function safePercent(value: number, total: number) {
  return total > 0 ? (value / total) * 100 : 0;
}

function resolveRange(
  meta: ExportMeta,
  t: TFunction,
): { from: Date; to: Date; label: string } {
  if (meta.startDate && meta.endDate) {
    return {
      from: new Date(meta.startDate),
      to: new Date(meta.endDate),
      label: t("analytics.export.labels.customRange", {
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
    label: t("analytics.export.labels.lastDays", {
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
  const totalHourRevenue = data.peakHours.reduce(
    (sum, h) => sum + (h.revenue ?? 0),
    0,
  );
  return dayParts.map((part) => {
    const matched = part.range.map((hour) =>
      data.peakHours.find((h) => h.hour === hour),
    );
    const orders = matched.reduce((sum, h) => sum + (h?.orders ?? 0), 0);
    const revenue = matched.reduce((sum, h) => sum + (h?.revenue ?? 0), 0);
    return [
      text(t(`analytics.export.dayParts.${part.id}`, part.id)),
      text(part.range.map(formatHour).join(", ")),
      int(orders),
      eur(revenue),
      bgn(revenue),
      pct(safePercent(orders, data.totalOrders)),
      pct(safePercent(revenue, totalHourRevenue)),
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
  const num = (v: number): Cell => ({ value: v, type: Number });

  const ex = (
    key: string,
    fallback: string,
    options?: Record<string, unknown>,
  ) =>
    t(`analytics.export.${key}`, {
      defaultValue: fallback,
      ...(options ?? {}),
    });
  const slug = toSlug(meta.restaurantName || "restaurant");
  const fileName = `analytics-${slug}-${fmtDate(range.from)}_to_${fmtDate(range.to)}.xlsx`;

  const bestDay = topBy(data.revenueTrend, (row) => row.revenue);
  const quietDay = topBy(data.revenueTrend, (row) => -row.orders);
  const peakHour = topBy(data.peakHours, (row) => row.orders);
  const busiestWindow = getBusiestWindow(data.peakHours);
  const heroItem = data.topItems[0];
  const topThreeRevenue = data.topItems
    .slice(0, 3)
    .reduce((sum, item) => sum + item.revenue, 0);
  const bestTable = data.ordersByTable[0];
  const completed =
    data.ordersByStatus.find((row) => row.status === "COMPLETED")?.count ?? 0;
  const canceled =
    data.ordersByStatus.find((row) => row.status === "CANCELED")?.count ?? 0;
  const observedOrders = data.ordersByStatus.reduce(
    (sum, row) => sum + row.count,
    0,
  );
  const cancelRate = safePercent(canceled, observedOrders);
  const topItemRevenue = data.topItems.reduce(
    (sum, item) => sum + item.revenue,
    0,
  );
  const itemRevenueTotal = data.categoryBreakdown.reduce(
    (sum, category) => sum + category.revenue,
    0,
  );

  // Phase-2 / reconciliation metrics (Professional+ payload). Guarded with
  // nullish fallbacks so a partial payload never throws during export.
  const collectedRevenue = data.collectedRevenue ?? 0;
  const refundedAmount = data.refundedAmount ?? 0;
  const netCollected = collectedRevenue - refundedAmount;
  const orderPaymentGap = Math.max(0, data.totalRevenue - collectedRevenue);
  const refundRate = safePercent(refundedAmount, collectedRevenue);
  const paymentMethods = data.paymentsByMethod ?? [];

  const summarySheet: Cell[][] = [
    section(ex("sections.exportDetails", "Export details"), 5),
    [
      h(ex("columns.field", "Field")),
      h(ex("columns.value", "Value")),
      h(ex("columns.eur", "EUR")),
      h(ex("columns.bgn", "BGN")),
      h(ex("columns.notes", "Notes")),
    ],
    [
      text(ex("summary.restaurant", "Restaurant")),
      text(meta.restaurantName),
      empty(),
      empty(),
      empty(),
    ],
    [
      text(ex("summary.period", "Period")),
      text(range.label),
      empty(),
      empty(),
      text(
        ex("labels.previousPeriod", "Previous: {{start}} to {{end}}", {
          start: data.prevPeriodStart ?? "-",
          end: data.prevPeriodEnd ?? "-",
        }),
      ),
    ],
    [
      text(ex("summary.generatedAt", "Generated at")),
      text(new Date().toLocaleString()),
      empty(),
      empty(),
      empty(),
    ],
    [empty(), empty(), empty(), empty(), empty()],
    section(ex("sections.kpiCards", "KPI cards"), 5),
    [
      h(ex("columns.metric", "Metric")),
      h(ex("columns.value", "Value")),
      h(ex("columns.eur", "EUR")),
      h(ex("columns.bgn", "BGN")),
      h(ex("columns.changeDetail", "Change / detail")),
    ],
    [
      text(ex("metrics.revenue", "Revenue")),
      empty(),
      eur(data.totalRevenue),
      bgn(data.totalRevenue),
      pct(data.comparison.revenueChange),
    ],
    [
      text(ex("metrics.orders", "Orders")),
      int(data.totalOrders),
      empty(),
      empty(),
      pct(data.comparison.ordersChange),
    ],
    [
      text(ex("metrics.avgOrderValue", "Average order value")),
      empty(),
      eur(data.avgOrderValue),
      bgn(data.avgOrderValue),
      pct(data.comparison.avgOrderValueChange),
    ],
    [
      text(ex("metrics.activeCustomers", "Active customers")),
      int(data.activeCustomers),
      empty(),
      empty(),
      pct(data.comparison.activeCustomersChange),
    ],
    [
      text(ex("metrics.completionRate", "Completion rate")),
      pct(data.completionRate),
      empty(),
      empty(),
      text(
        ex("labels.completedOrders", "{{count}} completed orders", {
          count: completed,
        }),
      ),
    ],
    [
      text(ex("metrics.repeatGuests", "Repeat guests")),
      pct(data.repeatCustomerRate ?? 0),
      empty(),
      empty(),
      text(ex("labels.repeatGuestsDetail", "Share of guests with 2+ orders")),
    ],
    [empty(), empty(), empty(), empty(), empty()],
    section(ex("sections.revenueReconciliation", "Revenue reconciliation"), 5),
    [
      h(ex("columns.stage", "Stage")),
      h(ex("columns.value", "Value")),
      h(ex("columns.eur", "EUR")),
      h(ex("columns.bgn", "BGN")),
      h(ex("columns.notes", "Notes")),
    ],
    [
      text(ex("reconciliation.ordered", "Ordered revenue")),
      empty(),
      eur(data.totalRevenue),
      bgn(data.totalRevenue),
      text(ex("reconciliation.orderedNote", "Order rows, excludes canceled")),
    ],
    [
      text(ex("reconciliation.collected", "Collected")),
      empty(),
      eur(collectedRevenue),
      bgn(collectedRevenue),
      text(ex("reconciliation.collectedNote", "Successful payments")),
    ],
    [
      text(ex("reconciliation.refunded", "Refunded")),
      empty(),
      eur(refundedAmount),
      bgn(refundedAmount),
      text(
        ex("reconciliation.refundRate", "Refund rate {{rate}}%", {
          rate: refundRate.toFixed(1),
        }),
      ),
    ],
    [
      text(ex("reconciliation.netCollected", "Net collected")),
      empty(),
      eur(netCollected),
      bgn(netCollected),
      text(ex("reconciliation.netCollectedNote", "Collected minus refunded")),
    ],
    [
      text(ex("reconciliation.orderPaymentGap", "Order/payment gap")),
      empty(),
      eur(orderPaymentGap),
      bgn(orderPaymentGap),
      text(
        ex(
          "reconciliation.orderPaymentGapNote",
          "Order-created revenue minus payment-created sales; timing and unpaid orders can differ",
        ),
      ),
    ],
    [empty(), empty(), empty(), empty(), empty()],
    section(ex("sections.insightCards", "Insight cards"), 5),
    [
      h(ex("columns.insight", "Insight")),
      h(ex("columns.primaryValue", "Primary value")),
      h(ex("columns.eur", "EUR")),
      h(ex("columns.bgn", "BGN")),
      h(ex("columns.detail", "Detail")),
    ],
    [
      text(ex("insights.revenueLeader", "Revenue leader")),
      text(bestDay?.date ?? "-"),
      eur(bestDay?.revenue ?? 0),
      bgn(bestDay?.revenue ?? 0),
      text(
        ex("labels.ordersCount", "{{count}} orders", {
          count: bestDay?.orders ?? 0,
        }),
      ),
    ],
    [
      text(ex("insights.peakWindow", "Peak window")),
      text(busiestWindow?.label ?? "-"),
      empty(),
      empty(),
      text(
        ex(
          "labels.busiestWindowOrders",
          "{{count}} orders in the busiest 3 hours",
          { count: busiestWindow?.orders ?? 0 },
        ),
      ),
    ],
    [
      text(ex("insights.top3MenuShare", "Top 3 menu share")),
      pct(safePercent(topThreeRevenue, itemRevenueTotal)),
      eur(topThreeRevenue),
      bgn(topThreeRevenue),
      text(
        heroItem
          ? ex("labels.heroLeads", "{{name}} leads with {{share}}%", {
              name: heroItem.name,
              share: safePercent(heroItem.revenue, itemRevenueTotal).toFixed(1),
            })
          : ex("labels.noItemData", "No item data"),
      ),
    ],
    [
      text(ex("insights.bestTable", "Best table")),
      text(bestTable?.table ?? "-"),
      eur(bestTable?.revenue ?? 0),
      bgn(bestTable?.revenue ?? 0),
      text(
        ex("labels.ordersCount", "{{count}} orders", {
          count: bestTable?.orders ?? 0,
        }),
      ),
    ],
    [empty(), empty(), empty(), empty(), empty()],
    section(ex("sections.actionableSignals", "Actionable signals"), 5),
    [
      h(ex("columns.signal", "Signal")),
      h(ex("columns.value", "Value")),
      h(ex("columns.eur", "EUR")),
      h(ex("columns.bgn", "BGN")),
      h(ex("columns.recommendation", "Recommendation")),
    ],
    [
      text(ex("signals.protectRush", "Protect the rush")),
      text(busiestWindow?.label ?? "-"),
      empty(),
      empty(),
      text(
        busiestWindow
          ? ex(
              "labels.protectRushRecommendation",
              "{{count}} orders: schedule strongest coverage.",
              { count: busiestWindow.orders },
            )
          : ex("labels.noRushPattern", "No rush pattern yet."),
      ),
    ],
    [
      text(ex("signals.pushHero", "Push the hero")),
      text(heroItem?.name ?? "-"),
      eur(heroItem?.revenue ?? 0),
      bgn(heroItem?.revenue ?? 0),
      text(
        heroItem
          ? ex(
              "labels.pushHeroRecommendation",
              "Use this item in combos, QR highlights, and staff suggestions.",
            )
          : ex("labels.noItemDataYet", "No item data yet."),
      ),
    ],
    [
      text(ex("signals.watchCancellations", "Watch cancellations")),
      pct(cancelRate),
      empty(),
      empty(),
      text(
        ex("labels.cancelledOrders", "{{count}} cancelled orders", {
          count: canceled,
        }),
      ),
    ],
    [
      text(ex("signals.liftQuietDays", "Lift quiet days")),
      text(quietDay?.date ?? "-"),
      eur(quietDay?.revenue ?? 0),
      bgn(quietDay?.revenue ?? 0),
      text(
        quietDay
          ? ex(
              "labels.liftQuietDaysRecommendation",
              "{{count}} orders: test a timed offer.",
              { count: quietDay.orders },
            )
          : ex("labels.noDailyData", "No daily data yet."),
      ),
    ],
  ];

  const revenueTrendSheet: Cell[][] = [
    [
      h(ex("columns.date", "Date")),
      h(ex("columns.revenueEur", "Revenue EUR")),
      h(ex("columns.revenueBgnExcel", "Revenue BGN")),
      h(ex("columns.orders", "Orders")),
      h(ex("columns.avgOrderEur", "Avg order EUR")),
      h(ex("columns.avgOrderBgn", "Avg order BGN")),
    ],
    ...(data.revenueTrend.length > 0
      ? data.revenueTrend.map((row) => {
          const avg = row.orders > 0 ? row.revenue / row.orders : 0;
          return [
            text(row.date),
            eur(row.revenue),
            bgn(row.revenue),
            int(row.orders),
            eur(avg),
            bgn(avg),
          ];
        })
      : noDataRow(t, 6)),
  ];

  const demandSheet: Cell[][] = [
    section(ex("sections.hourlyDemand", "Hourly demand"), 7),
    [
      h(ex("columns.hour", "Hour")),
      h(ex("columns.orders", "Orders")),
      h(ex("columns.revenueEur", "Revenue EUR")),
      h(ex("columns.revenueBgnExcel", "Revenue BGN")),
      h(ex("columns.shareOfTotal", "Share of total")),
      h(ex("columns.shareOfPeak", "Share of peak")),
      h(ex("columns.segment", "Segment")),
    ],
    ...(data.peakHours.length > 0
      ? data.peakHours.map((row) => {
          const shareOfPeak =
            peakHour && peakHour.orders > 0
              ? safePercent(row.orders, peakHour.orders)
              : 0;
          const segment =
            row.orders === 0
              ? ex("segments.noOrders", "No orders")
              : row.hour === peakHour?.hour
                ? ex("segments.peak", "Peak")
                : shareOfPeak >= 65
                  ? ex("segments.busy", "Busy")
                  : ex("segments.quiet", "Quiet");
          return [
            text(formatHour(row.hour)),
            int(row.orders),
            eur(row.revenue ?? 0),
            bgn(row.revenue ?? 0),
            pct(safePercent(row.orders, data.totalOrders)),
            pct(shareOfPeak),
            text(segment),
          ];
        })
      : noDataRow(t, 7)),
    [empty(), empty(), empty(), empty(), empty(), empty(), empty()],
    section(ex("sections.daypartDemand", "Daypart demand"), 7),
    [
      h(ex("columns.daypart", "Daypart")),
      h(ex("columns.hours", "Hours")),
      h(ex("columns.orders", "Orders")),
      h(ex("columns.revenueEur", "Revenue EUR")),
      h(ex("columns.revenueBgnExcel", "Revenue BGN")),
      h(ex("columns.shareOfOrders", "Share of orders")),
      h(ex("columns.shareOfRevenue", "Share of revenue")),
    ],
    ...getDayPartRows(data, t),
  ];

  const menuSheet: Cell[][] = [
    [
      h(ex("columns.rank", "Rank")),
      h(ex("columns.item", "Item")),
      h(ex("columns.quantitySold", "Quantity sold")),
      h(ex("columns.revenueEur", "Revenue EUR")),
      h(ex("columns.revenueBgnExcel", "Revenue BGN")),
      h(ex("columns.avgItemYieldEur", "Avg item yield EUR")),
      h(ex("columns.shareOfItemSales", "Share of item sales")),
    ],
    ...(data.topItems.length > 0
      ? data.topItems.map((item, index) => [
          int(index + 1),
          text(item.name),
          int(item.quantity),
          eur(item.revenue),
          bgn(item.revenue),
          eur(item.quantity > 0 ? item.revenue / item.quantity : 0),
          pct(safePercent(item.revenue, itemRevenueTotal)),
        ])
      : noDataRow(t, 7)),
    [empty(), empty(), empty(), empty(), empty(), empty(), empty()],
    [
      text(ex("metrics.trackedTopItemRevenue", "Tracked top item revenue")),
      empty(),
      empty(),
      eur(topItemRevenue),
      bgn(topItemRevenue),
      empty(),
      pct(safePercent(topItemRevenue, itemRevenueTotal)),
    ],
  ];

  const categoriesSheet: Cell[][] = [
    [
      h(ex("columns.category", "Category")),
      h(ex("columns.revenueEur", "Revenue EUR")),
      h(ex("columns.revenueBgnExcel", "Revenue BGN")),
      h(ex("columns.shareOfItemSales", "Share of item sales")),
    ],
    ...(data.categoryBreakdown.length > 0
      ? data.categoryBreakdown.map((row) => [
          text(row.category),
          eur(row.revenue),
          bgn(row.revenue),
          pct(safePercent(row.revenue, itemRevenueTotal)),
        ])
      : noDataRow(t, 4)),
  ];

  const tablesSheet: Cell[][] = [
    [
      h(ex("columns.table", "Table")),
      h(ex("columns.orders", "Orders")),
      h(ex("columns.revenueEur", "Revenue EUR")),
      h(ex("columns.revenueBgnExcel", "Revenue BGN")),
      h(ex("columns.avgOrderEur", "Avg order EUR")),
      h(ex("columns.revenueShare", "Revenue share")),
    ],
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
    [
      h(ex("columns.status", "Status")),
      h(ex("columns.orders", "Orders")),
      h(ex("columns.shareOfSelectedOrders", "Share of selected orders")),
    ],
    ...(data.ordersByStatus.length > 0
      ? data.ordersByStatus.map((row) => [
          text(
            t(
              orderStatusKeyMap[row.status] ?? "",
              row.status.replace("_", " "),
            ),
          ),
          int(row.count),
          pct(safePercent(row.count, data.totalOrders)),
        ])
      : noDataRow(t, 3)),
  ];

  const paymentMethodsSheet: Cell[][] = [
    section(ex("sections.paymentSplit", "Payment-method split"), 4),
    [
      h(ex("columns.method", "Method")),
      h(ex("columns.revenueEur", "Revenue EUR")),
      h(ex("columns.revenueBgnExcel", "Revenue BGN")),
      h(ex("columns.shareOfCollected", "Share of collected")),
    ],
    ...(paymentMethods.length > 0
      ? paymentMethods.map((row) => [
          text(row.method),
          eur(row.amount),
          bgn(row.amount),
          pct(safePercent(row.amount, collectedRevenue)),
        ])
      : noDataRow(t, 4)),
    [empty(), empty(), empty(), empty()],
    [
      text(ex("reconciliation.collected", "Collected")),
      eur(collectedRevenue),
      bgn(collectedRevenue),
      empty(),
    ],
    [
      text(ex("reconciliation.refunded", "Refunded")),
      eur(refundedAmount),
      bgn(refundedAmount),
      pct(refundRate),
    ],
  ];

  const guestSheet: Cell[][] = feedback
    ? [
        section(ex("sections.guestVoiceSummary", "Guest voice summary"), 4),
        [
          h(ex("columns.metric", "Metric")),
          h(ex("columns.value", "Value")),
          empty(),
          empty(),
        ],
        [
          text(ex("metrics.totalFeedbacks", "Total feedbacks")),
          int(feedback.totalFeedbacks),
          empty(),
          empty(),
        ],
        [
          text(ex("metrics.averageRating", "Average rating")),
          int(feedback.averageRating),
          empty(),
          empty(),
        ],
        [
          text(ex("metrics.positiveRate", "Positive rate")),
          pct(feedback.positiveRate),
          empty(),
          empty(),
        ],
        [
          text(ex("metrics.googleRedirects", "Google redirects")),
          int(feedback.googleRedirects),
          empty(),
          empty(),
        ],
        [empty(), empty(), empty(), empty()],
        section(ex("sections.ratingDistribution", "Rating distribution"), 4),
        [
          h(ex("columns.rating", "Rating")),
          h(ex("columns.count", "Count")),
          h(ex("columns.share", "Share")),
          empty(),
        ],
        ...[5, 4, 3, 2, 1].map((rating) => {
          const count = feedback.ratingDistribution?.[rating] ?? 0;
          return [
            text(ex("labels.starRating", "{{rating}} star", { rating })),
            int(count),
            pct(safePercent(count, feedback.totalFeedbacks)),
            empty(),
          ];
        }),
      ]
    : [
        [h(ex("columns.metric", "Metric")), h(ex("columns.value", "Value"))],
        [
          text(ex("metrics.guestFeedback", "Guest feedback")),
          text(
            ex(
              "labels.noFeedbackLoaded",
              "No feedback data loaded for this export",
            ),
          ),
        ],
      ];

  const sheets: { sheet: string; columns: { width: number }[]; data: any }[] = [
    {
      sheet: ex("sheets.summary", "Summary"),
      columns: [
        { width: 26 },
        { width: 28 },
        { width: 16 },
        { width: 16 },
        { width: 48 },
      ],
      data: summarySheet as any,
    },
    {
      sheet: ex("sheets.revenueTrend", "Revenue Trend"),
      columns: [
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 10 },
        { width: 16 },
        { width: 16 },
      ],
      data: revenueTrendSheet as any,
    },
    {
      sheet: ex("sheets.demandMap", "Demand Map"),
      columns: [
        { width: 12 },
        { width: 10 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
      ],
      data: demandSheet as any,
    },
    {
      sheet: ex("sheets.menuEngineering", "Menu Engineering"),
      columns: [
        { width: 8 },
        { width: 38 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 18 },
        { width: 14 },
      ],
      data: menuSheet as any,
    },
    {
      sheet: ex("sheets.categories", "Categories"),
      columns: [{ width: 28 }, { width: 14 }, { width: 14 }, { width: 16 }],
      data: categoriesSheet as any,
    },
    {
      sheet: ex("sheets.tableYield", "Table Yield"),
      columns: [
        { width: 18 },
        { width: 10 },
        { width: 14 },
        { width: 14 },
        { width: 16 },
        { width: 14 },
      ],
      data: tablesSheet as any,
    },
    {
      sheet: ex("sheets.orderFlow", "Order Flow"),
      columns: [{ width: 18 }, { width: 10 }, { width: 20 }],
      data: orderFlowSheet as any,
    },
    {
      sheet: ex("sheets.paymentMethods", "Payment Methods"),
      columns: [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 18 }],
      data: paymentMethodsSheet as any,
    },
    {
      sheet: ex("sheets.guestVoice", "Guest Voice"),
      columns: [{ width: 24 }, { width: 14 }, { width: 14 }, { width: 14 }],
      data: guestSheet as any,
    },
  ];

  // ── Phase B: new analytics sheets (conditional) ──────────────────────
  if (data.staffPerformance && data.staffPerformance.length > 0) {
    sheets.push({
      sheet: ex("sheets.staffPerformance", "Staff Performance"),
      columns: [
        { width: 22 },
        { width: 10 },
        { width: 14 },
        { width: 14 },
        { width: 10 },
        { width: 10 },
      ],
      data: [
        [
          h(ex("columns.staffName", "Staff")),
          h(ex("columns.orders", "Orders")),
          h(ex("columns.revenueEur", "Revenue EUR")),
          h(ex("columns.revenueBgn", "Revenue BGN")),
          h(ex("columns.pos", "POS")),
          h(ex("columns.qr", "QR")),
        ],
        ...data.staffPerformance.map((s) => [
          text(s.staffName),
          num(s.totalOrders),
          eur(s.totalRevenue),
          bgn(s.totalRevenue),
          num(s.posOrders),
          num(s.qrOrders),
        ]),
      ] as any,
    });
  }

  if (data.customerMetrics && data.customerMetrics.topCustomers.length > 0) {
    sheets.push({
      sheet: ex("sheets.customerInsights", "Customer Insights"),
      columns: [
        { width: 22 },
        { width: 16 },
        { width: 14 },
        { width: 10 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
      ],
      data: [
        [
          h(ex("columns.customerName", "Customer")),
          h(ex("columns.phone", "Phone")),
          h(ex("columns.totalSpend", "Total Spend")),
          h(ex("columns.visits", "Visits")),
          h(ex("columns.avgPerVisit", "Avg/Visit")),
          h(ex("columns.clv", "CLV")),
          h(ex("columns.daysSinceLast", "Days Since")),
        ],
        ...data.customerMetrics.topCustomers.map((c) => [
          text(c.customerName || c.customerPhone),
          text(c.customerPhone),
          eur(c.totalSpend),
          num(c.visitCount),
          eur(c.avgSpendPerVisit),
          text("-"),
          num(c.daysSinceLastVisit),
        ]),
      ] as any,
    });
  }

  if (
    data.kitchenEfficiency &&
    data.kitchenEfficiency.hourlyAverages.length > 0
  ) {
    sheets.push({
      sheet: ex("sheets.kitchenEfficiency", "Kitchen Efficiency"),
      columns: [{ width: 14 }, { width: 12 }, { width: 14 }, { width: 14 }],
      data: [
        [
          h(ex("columns.hour", "Hour")),
          h(ex("columns.orders", "Orders")),
          h(ex("columns.avgPrep", "Avg Prep (min)")),
          h(ex("columns.zone", "Zone")),
        ],
        ...data.kitchenEfficiency.hourlyAverages.map((h) => [
          text(h.label),
          num(h.orderCount),
          num(h.avgPrepMinutes),
          text(
            data.kitchenEfficiency!.zoneAverages.find(
              (z) => z.orderCount === h.orderCount,
            )?.zone ?? "",
          ),
        ]),
      ] as any,
    });
  }

  if (
    data.cancelAnalytics &&
    data.cancelAnalytics.cancelRateByItem.length > 0
  ) {
    sheets.push({
      sheet: ex("sheets.cancelAnalysis", "Cancel Analysis"),
      columns: [{ width: 28 }, { width: 12 }, { width: 12 }, { width: 12 }],
      data: [
        [
          h(ex("columns.item", "Item")),
          h(ex("columns.totalQty", "Total Qty")),
          h(ex("columns.canceledQty", "Canceled Qty")),
          h(ex("columns.cancelRate", "Cancel Rate")),
        ],
        ...data.cancelAnalytics.cancelRateByItem.map((c) => [
          text(c.itemName),
          num(c.totalQty),
          num(c.canceledQty),
          pct(c.cancelRate),
        ]),
        [empty(), empty(), empty(), empty()],
        [
          h(ex("columns.revenueLost", "Revenue Lost")),
          eur(data.cancelAnalytics!.revenueLost),
          bgn(data.cancelAnalytics!.revenueLost),
          empty(),
        ],
      ] as any,
    });
  }

  if (data.tableTurnover && data.tableTurnover.length > 0) {
    sheets.push({
      sheet: ex("sheets.tableTurnover", "Table Turnover"),
      columns: [
        { width: 18 },
        { width: 12 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 12 },
      ],
      data: [
        [
          h(ex("columns.table", "Table")),
          h(ex("columns.sessions", "Sessions")),
          h(ex("columns.avgDuration", "Avg Duration")),
          h(ex("columns.turnsPer24Hours", "Est. max turns / 24h")),
          h(ex("columns.revenue", "Revenue")),
          h(ex("columns.revenuePerOccupiedHour", "Revenue / occupied hour")),
        ],
        ...data.tableTurnover.map((tbl) => [
          text(tbl.tableName),
          num(tbl.sessionCount),
          text(`${tbl.avgDurationMinutes}m`),
          num(tbl.estimatedTurnsPer24Hours),
          eur(tbl.totalRevenue),
          eur(tbl.revenuePerOccupiedHour),
        ]),
      ] as any,
    });
  }

  if (data.menuProfitability && data.menuProfitability.items.length > 0) {
    sheets.push({
      sheet: ex("sheets.menuProfitability", "Menu Profitability"),
      columns: [
        { width: 24 },
        { width: 10 },
        { width: 14 },
        { width: 14 },
        { width: 14 },
        { width: 12 },
        { width: 16 },
      ],
      data: [
        [
          h(ex("columns.item", "Item")),
          h(ex("columns.qty", "Qty")),
          h(ex("columns.revenue", "Revenue")),
          h(ex("columns.cost", "Cost")),
          h(ex("columns.profit", "Profit")),
          h(ex("columns.margin", "Margin %")),
          h(ex("columns.quadrant", "Quadrant")),
        ],
        ...data.menuProfitability.items.map((i) => [
          text(i.name),
          num(i.quantity),
          eur(i.revenue),
          eur(i.cost),
          eur(i.profit),
          pct(i.margin),
          text(i.quadrant),
        ]),
      ] as any,
    });
  }

  if (data.grossProfit) {
    sheets.push({
      sheet: ex("sheets.grossProfit", "Gross Profit"),
      columns: [{ width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }],
      data: [
        [
          h(ex("columns.metric", "Metric")),
          h(ex("columns.eur", "EUR")),
          h(ex("columns.bgn", "BGN")),
          h(ex("columns.percentage", "Percentage")),
        ],
        [
          text(ex("labels.netSales", "Net Sales (excl. tips)")),
          eur(data.grossProfit.netSales),
          bgn(data.grossProfit.netSales),
          empty(),
        ],
        [
          text(ex("labels.estimatedCOGS", "Est. COGS")),
          eur(data.grossProfit.estimatedCOGS),
          bgn(data.grossProfit.estimatedCOGS),
          text(
            `${safePercent(data.grossProfit.estimatedCOGS, data.grossProfit.netSales)}%`,
          ),
        ],
        [
          text(ex("labels.grossProfit", "Gross Profit")),
          eur(data.grossProfit.grossProfit),
          bgn(data.grossProfit.grossProfit),
          pct(data.grossProfit.grossMargin),
        ],
      ] as any,
    });
  }

  await writeXlsxFile(sheets).toFile(fileName);
}

// ── Closeout report export (standalone, single-day) ────────────────────────

interface CloseoutReport {
  date: string;
  revenueByMethod: { method: string; amount: number }[];
  totalCollected: number;
  totalTips: number;
  orderedRevenue: number;
  discountPointsRedeemed: number;
  refundedAmount: number;
  canceledRevenue: number;
  netRevenue: number;
  totalOrderCount: number;
  canceledOrderCount: number;
}

export async function exportCloseoutXlsx(
  closeout: CloseoutReport,
  t: TFunction,
): Promise<void> {
  const ex = (key: string, fallback: string) =>
    t(`analytics.export.${key}`, { defaultValue: fallback });
  const h = (label: string): Cell => ({
    value: label,
    fontWeight: "bold",
    fontSize: 10,
    backgroundColor: HEADER_BG,
    textColor: HEADER_FG,
  });
  const eur = (v: number): Cell => ({
    value: v,
    type: Number,
    format: EUR_FORMAT,
  });
  const bgn = (v: number): Cell => ({
    value: v * BGN_RATE,
    type: Number,
    format: BGN_FORMAT,
  });
  const text = (v: string): Cell => ({ value: v, type: String });
  const bold = (v: string): Cell => ({
    value: v,
    type: String,
    fontWeight: "bold",
  });
  const num = (v: number): Cell => ({ value: v, type: Number });
  const empty = () => ({ value: null });

  const dateStr = closeout.date;
  const sheets = [
    {
      sheet: ex("closeout.sheetName", "Daily Closeout"),
      columns: [{ width: 34 }, { width: 16 }, { width: 16 }],
      data: [
        [bold(ex("closeout.date", "Date")), text(dateStr), empty()],
        [empty(), empty(), empty()],
        [bold(ex("closeout.revenue", "Revenue by Method"))],
        ...closeout.revenueByMethod.map((m) => [
          text(m.method),
          eur(m.amount),
          bgn(m.amount),
        ]),
        [empty(), empty(), empty()],
        [bold(ex("closeout.totals", "Totals"))],
        [
          text(ex("closeout.totalCollected", "Total Collected")),
          eur(closeout.totalCollected),
          bgn(closeout.totalCollected),
        ],
        [
          text(ex("closeout.totalTips", "Tips")),
          eur(closeout.totalTips),
          bgn(closeout.totalTips),
        ],
        [
          text(ex("closeout.orderedRevenue", "Ordered Revenue")),
          eur(closeout.orderedRevenue),
          bgn(closeout.orderedRevenue),
        ],
        [
          text(
            ex("closeout.discountPointsRedeemed", "Discount points redeemed"),
          ),
          num(closeout.discountPointsRedeemed),
          empty(),
        ],
        [
          text(ex("closeout.refundedAmount", "Refunded")),
          eur(closeout.refundedAmount),
          bgn(closeout.refundedAmount),
        ],
        [
          text(ex("closeout.canceledRevenue", "Canceled Revenue")),
          eur(closeout.canceledRevenue),
          bgn(closeout.canceledRevenue),
        ],
        [empty(), empty(), empty()],
        [
          bold(ex("closeout.netRevenue", "Net Revenue")),
          eur(closeout.netRevenue),
          bgn(closeout.netRevenue),
        ],
        [empty(), empty(), empty()],
        [
          text(ex("closeout.totalOrders", "Non-canceled orders")),
          num(closeout.totalOrderCount),
          empty(),
        ],
        [
          text(ex("closeout.canceledOrders", "Canceled Orders")),
          num(closeout.canceledOrderCount),
          empty(),
        ],
      ] as any,
    },
  ];

  const slug = `closeout-${dateStr}`;
  await writeXlsxFile(sheets).toFile(`${slug}.xlsx`);
}
