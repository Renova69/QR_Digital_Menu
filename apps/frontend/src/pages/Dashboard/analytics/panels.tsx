import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExternalLink, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatEuro } from "../../../lib/currency";
import { Panel } from "./Panel";
import { CustomTooltip, EmptyState } from "./primitives";
import {
  CHART_COLORS,
  PAYMENT_METHOD_LABEL_KEYS,
  formatPercent,
  numberFormat,
  orderStatusKeyMap,
  safePercent,
} from "./shared";

export const RevenueReconciliation = ({
  ordered,
  collected,
  refunded,
}: {
  ordered: number;
  collected: number;
  refunded: number;
}) => {
  const { t } = useTranslation();
  const net = Math.round((collected - refunded) * 100) / 100;
  const orderPaymentGap =
    Math.round(Math.max(0, ordered - collected) * 100) / 100;
  const refundRate = collected > 0 ? (refunded / collected) * 100 : 0;

  const steps = [
    {
      key: "ordered",
      label: t("analytics.recoOrdered", "Ordered"),
      value: ordered,
      hint: t("analytics.recoOrderedHint", "All non-cancelled orders"),
    },
    {
      key: "collected",
      label: t("analytics.recoCollected", "Collected"),
      value: collected,
      hint: t("analytics.recoCollectedHint", "Payments received"),
    },
    {
      key: "refunded",
      label: t("analytics.recoRefunded", "Refunded"),
      value: refunded,
      hint:
        refunded > 0
          ? `${formatPercent(refundRate)} ${t("analytics.vsPeriodSales", "vs period gross sales")}`
          : t("analytics.recoRefundedHint", "Reversed to guests"),
      tone: "text-red-600 dark:text-red-400",
    },
    {
      key: "net",
      label: t("analytics.recoNet", "Net collected"),
      value: net,
      hint: t("analytics.recoNetHint", "Collected − refunded"),
      emphasis: true,
    },
  ];

  return (
    <Panel
      title={t("analytics.revenueReconciliation", "Revenue reconciliation")}
      eyebrow={t("analytics.moneyFlow", "Money flow")}
      action={
        orderPaymentGap > 0
          ? `${t("analytics.recoOrderPaymentGap", "Order/payment gap")} ${formatEuro(orderPaymentGap)}`
          : undefined
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {steps.map((s) => (
          <div
            key={s.key}
            className={`rounded-lg border p-3 ${
              s.emphasis
                ? "border-primary/30 bg-primary/5"
                : "border-border bg-secondary/20"
            }`}
          >
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {s.label}
            </p>
            <p
              className={`mt-1 text-lg font-display font-black ${
                s.tone ?? "text-foreground"
              }`}
            >
              {s.tone ? `−${formatEuro(s.value)}` : formatEuro(s.value)}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
              {s.hint}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
        {t(
          "analytics.recoTimingExplainer",
          "Orders and payments use their own event dates. Timing, unpaid orders, cash not closed through the POS, and refunds can create a gap.",
        )}
      </p>
    </Panel>
  );
};

export const PaymentMethods = ({
  methods,
  collected,
}: {
  methods: { method: string; amount: number }[];
  collected: number;
}) => {
  const { t } = useTranslation();
  return (
    <Panel
      title={t("analytics.paymentMethods", "Payment methods")}
      eyebrow={t("analytics.howGuestsPay", "How guests pay")}
    >
      {!methods || methods.length === 0 ? (
        <EmptyState
          message={t("analytics.noPaymentData", "No payments in this period")}
        />
      ) : (
        <div className="space-y-4">
          {methods.map((m) => {
            const share = collected > 0 ? (m.amount / collected) * 100 : 0;
            return (
              <div key={m.method}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-black uppercase tracking-widest text-foreground">
                    {PAYMENT_METHOD_LABEL_KEYS[m.method]
                      ? t(PAYMENT_METHOD_LABEL_KEYS[m.method])
                      : m.method}
                  </p>
                  <p className="text-sm font-black text-foreground">
                    {formatEuro(m.amount)}
                  </p>
                </div>
                <div className="mt-2 h-2 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, share)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatPercent(share)}{" "}
                  {t("analytics.ofCollected", "of collected")}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
};

export const HourlyDemand = ({
  hours,
}: {
  hours: Array<{
    hour: number;
    label: string;
    orders: number;
    revenue: number;
  }>;
}) => {
  const { t } = useTranslation();
  const [hoveredHour, setHoveredHour] = useState<{
    hour: number;
    label: string;
    orders: number;
    revenue: number;
  } | null>(null);
  const maxOrders = Math.max(1, ...hours.map((hour) => hour.orders));
  const displayHours = hours;
  const peak = hours.reduce(
    (max, hour) => (hour.orders > max.orders ? hour : max),
    hours[0],
  );
  const activeHour = hoveredHour ?? peak;
  const activeShare =
    activeHour && maxOrders > 0
      ? Math.round((activeHour.orders / maxOrders) * 100)
      : 0;
  const averageOrders =
    displayHours.length > 0
      ? displayHours.reduce((sum, hour) => sum + hour.orders, 0) /
        displayHours.length
      : 0;

  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-4">
      <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-foreground">
            {t("analytics.popularTimes")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("analytics.hourlyPressureDesc")}
          </p>
        </div>
        <div className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-black text-primary">
          {hoveredHour
            ? t("analytics.selectedLabel")
            : t("analytics.peakLabel")}{" "}
          {activeHour?.label ?? t("analytics.noTimeSelected")} -{" "}
          {t("analytics.peakOrdersCount", { count: activeHour?.orders ?? 0 })}
          {activeHour && (activeHour.revenue ?? 0) > 0
            ? ` · ${formatEuro(activeHour.revenue)}`
            : ""}
        </div>
      </div>

      <div className="relative h-[230px]">
        <div className="absolute inset-x-0 top-4 bottom-10 flex flex-col justify-between pointer-events-none">
          {[0, 1, 2, 3].map((line) => (
            <div key={line} className="border-t border-dashed border-border" />
          ))}
        </div>

        <div
          className="relative flex h-full items-end gap-1 overflow-x-auto pb-10 sm:gap-1.5 md:overflow-hidden lg:gap-2"
          onMouseLeave={() => setHoveredHour(null)}
        >
          {displayHours.map((hour) => {
            const isPeak = hour.hour === peak?.hour && hour.orders > 0;
            const isBusy = hour.orders >= averageOrders && hour.orders > 0;
            const height =
              hour.orders > 0
                ? Math.max(18, (hour.orders / maxOrders) * 150)
                : 8;
            const isActive = hour.hour === activeHour?.hour;

            return (
              <div
                key={hour.hour}
                role="button"
                tabIndex={0}
                aria-label={t("analytics.hourBarLabel", {
                  label: hour.label,
                  orders: hour.orders,
                })}
                className={`relative flex h-full min-w-[24px] flex-1 cursor-pointer flex-col items-center justify-end rounded-md px-0 outline-none transition md:min-w-0 ${
                  isActive
                    ? "bg-primary/10 ring-1 ring-primary/20"
                    : "hover:bg-secondary"
                }`}
                onMouseEnter={() => setHoveredHour(hour)}
                onMouseMove={() => setHoveredHour(hour)}
                onFocus={() => setHoveredHour(hour)}
                onBlur={() => setHoveredHour(null)}
              >
                <div
                  className={`w-2 rounded-t-lg transition-all duration-300 sm:w-2.5 lg:w-3 xl:w-3.5 ${
                    isPeak
                      ? "bg-rose-500 shadow-lg shadow-rose-500/25"
                      : isBusy
                        ? "bg-primary"
                        : "bg-primary/35"
                  }`}
                  style={{ height }}
                  title={t("analytics.hourBarTooltip", {
                    label: hour.label,
                    orders: hour.orders,
                  })}
                />
                <span
                  className={`mt-2 text-[10px] font-bold ${isPeak ? "text-rose-500" : isActive ? "text-primary" : "text-muted-foreground"}`}
                >
                  {hour.hour}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-border bg-card px-3 py-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-black text-foreground">
            {activeHour?.label ?? t("analytics.noTimeSelected")}:{" "}
            {t("analytics.peakOrdersCount", { count: activeHour?.orders ?? 0 })}
          </p>
          <p className="text-xs font-bold text-muted-foreground">
            {t("analytics.percentOfPeakDemand", { percent: activeShare })}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px] font-bold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/35" />
          {t("analytics.quiet")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary" />
          {t("analytics.busy")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
          {t("analytics.peakLabel")}
        </span>
      </div>
    </div>
  );
};

export const MenuEngineering = ({
  items,
  totalRevenue,
}: {
  items: Array<{ name: string; quantity: number; revenue: number }>;
  totalRevenue: number;
}) => {
  const { t } = useTranslation();
  if (items.length === 0)
    return <EmptyState message={t("analytics.noMenuPerformance")} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {items.slice(0, 8).map((item, index) => {
        const share = safePercent(item.revenue, totalRevenue);
        const averageItemYield =
          item.quantity > 0 ? item.revenue / item.quantity : 0;
        return (
          <div
            key={`${item.name}-${index}`}
            className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-lg border border-border bg-secondary/20 p-3"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-xs font-black text-primary">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-foreground">
                {item.name}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {numberFormat.format(item.quantity)} {t("analytics.soldLabel")}{" "}
                - {formatEuro(averageItemYield)} {t("analytics.avgYield")} -{" "}
                {formatPercent(share)}{" "}
                {t("analytics.ofItemSales", "of item sales")}
              </p>
              <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, share)}%` }}
                />
              </div>
            </div>
            <p className="text-sm font-black text-foreground">
              {formatEuro(item.revenue)}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export const CategoryMix = ({
  categories,
}: {
  categories: Array<{ category: string; revenue: number }>;
}) => {
  const { t } = useTranslation();
  const displayCategories = categories.map((category) => ({
    ...category,
    category:
      category.category || t("analytics.uncategorized", "Uncategorized"),
  }));
  const total = displayCategories.reduce(
    (sum, category) => sum + category.revenue,
    0,
  );

  if (categories.length === 0)
    return <EmptyState message={t("analytics.noCategoryData")} />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[210px_1fr] gap-5 items-center">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={displayCategories}
            dataKey="revenue"
            nameKey="category"
            innerRadius={58}
            outerRadius={92}
            paddingAngle={3}
            stroke="none"
          >
            {displayCategories.map((_, index) => (
              <Cell
                key={index}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip currency />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-2">
        {displayCategories.slice(0, 6).map((category, index) => (
          <div
            key={`${category.category}-${index}`}
            className="flex items-center justify-between gap-3 rounded-lg bg-secondary/20 px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
                }}
              />
              <p className="truncate text-sm font-bold text-foreground">
                {category.category}
              </p>
            </div>
            <p className="text-xs font-black text-muted-foreground">
              {formatPercent(safePercent(category.revenue, total))}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export const TableYield = ({
  tables,
}: {
  tables: Array<{ table: string; orders: number; revenue: number }>;
}) => {
  const { t } = useTranslation();
  if (tables.length === 0)
    return <EmptyState message={t("analytics.noTableYieldData")} />;

  const displayTables = tables.slice(0, 10);
  const maxRevenue = Math.max(
    1,
    ...displayTables.map((table) => table.revenue),
  );
  const averageRevenue =
    displayTables.length > 0
      ? displayTables.reduce((sum, table) => sum + table.revenue, 0) /
        displayTables.length
      : 0;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={displayTables}
        margin={{ top: 4, right: 16, bottom: 0, left: 0 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="currentColor"
          className="text-border"
          vertical={false}
          opacity={0.45}
        />
        <XAxis
          dataKey="table"
          tick={{ fontSize: 11, fill: "hsl(var(--color-muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          dy={10}
        />
        <YAxis
          tickFormatter={(value) => formatEuro(Number(value))}
          tick={{ fontSize: 11, fill: "hsl(var(--color-muted-foreground))" }}
          axisLine={false}
          tickLine={false}
          width={68}
        />
        <Tooltip content={<CustomTooltip currency />} />
        <Bar
          dataKey="revenue"
          name={t("analytics.revenue")}
          radius={[6, 6, 0, 0]}
          barSize={26}
        >
          {displayTables.map((table, index) => {
            const isPeak = table.revenue === maxRevenue && table.revenue > 0;
            const isBusy =
              table.revenue >= averageRevenue && table.revenue > 0;
            return (
              <Cell
                key={`${table.table}-${index}`}
                fill={isPeak ? "#f43f5e" : isBusy ? "#38bdf8" : "#10b981"}
                fillOpacity={isPeak ? 1 : isBusy ? 0.92 : 0.78}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export const OrderFlow = ({
  statuses,
  totalOrders,
}: {
  statuses: Array<{ status: string; count: number }>;
  totalOrders: number;
}) => {
  const { t } = useTranslation();
  if (statuses.length === 0)
    return <EmptyState message={t("analytics.noOrderStatusData")} />;
  const observedOrders = statuses.reduce(
    (sum, status) => sum + status.count,
    0,
  );

  return (
    <div className="space-y-3">
      {statuses.map((status) => {
        const share = safePercent(status.count, observedOrders || totalOrders);
        return (
          <div
            key={status.status}
            className="rounded-lg border border-border bg-secondary/20 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black uppercase tracking-widest text-foreground">
                {t(orderStatusKeyMap[status.status]) ||
                  status.status.replace("_", " ")}
              </p>
              <p className="text-sm font-black text-foreground">
                {numberFormat.format(status.count)}
              </p>
            </div>
            <div className="mt-3 h-2 rounded-full bg-border overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.min(100, share)}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatPercent(share)} {t("analytics.ofSelectedOrders")}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export const GuestSatisfaction = ({ feedbackData }: { feedbackData: any }) => {
  const { t } = useTranslation();
  if (!feedbackData || feedbackData.totalFeedbacks === 0) {
    return <EmptyState message={t("analytics.noGuestFeedback")} />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-5 text-center">
        <p className="text-5xl font-display font-black text-primary">
          {feedbackData.averageRating}
        </p>
        <div className="mt-3 flex justify-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <Star
              key={star}
              className={`w-4 h-4 ${star <= Math.round(feedbackData.averageRating) ? "fill-primary text-primary" : "text-muted-foreground/30"}`}
            />
          ))}
        </div>
        <p className="mt-3 text-[11px] font-bold text-muted-foreground">
          {numberFormat.format(feedbackData.totalFeedbacks)}{" "}
          {t("analytics.reviewsLabel")}
        </p>
      </div>
      <div className="space-y-3">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = feedbackData.ratingDistribution?.[rating] || 0;
          const share = safePercent(count, feedbackData.totalFeedbacks);
          return (
            <div key={rating} className="flex items-center gap-3">
              <span className="w-12 text-xs font-black text-foreground">
                {rating} {t("analytics.starLabel")}
              </span>
              <div className="flex-1 h-2 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, share)}%` }}
                />
              </div>
              <span className="w-10 text-right text-xs font-bold text-muted-foreground">
                {count}
              </span>
            </div>
          );
        })}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="rounded-lg bg-emerald-500/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
              {t("analytics.positive")}
            </p>
            <p className="text-xl font-display font-black text-emerald-600">
              {feedbackData.positiveRate}%
            </p>
          </div>
          <div className="rounded-lg bg-sky-500/10 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">
              {t("analytics.googleImpact")}
            </p>
            <p className="text-xl font-display font-black text-sky-600 flex items-center gap-2">
              {feedbackData.googleRedirects}{" "}
              <ExternalLink className="w-4 h-4" />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
