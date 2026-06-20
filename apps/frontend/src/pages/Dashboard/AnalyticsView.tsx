import { useContext, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
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
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  Lightbulb,
  Lock,
  ReceiptText,
  Sparkles,
  Star,
  Table2,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import RestaurantContext from "../../context/RestaurantContext";
import { useAnalytics } from "../../hooks/useAnalytics";
import { useFeature } from "../../hooks/useFeature";
import { useSummaryDateRange } from "../../hooks/useSummaryDateRange";
import { getFeedbackSummary } from "../../lib/api";
import { downloadAnalyticsExport } from "../../lib/analyticsExport";
import { formatEuro } from "../../lib/currency";
import DateRangeFilter from "./summary/DateRangeFilter";

const CHART_COLORS = [
  "hsl(var(--color-primary))",
  "#10b981",
  "#f59e0b",
  "#38bdf8",
  "#ef4444",
  "#a78bfa",
];

const dayParts = [
  { id: "morning", label: "Morning", range: [6, 7, 8, 9, 10, 11] },
  { id: "lunch", label: "Lunch", range: [12, 13, 14, 15] },
  { id: "dinner", label: "Dinner", range: [16, 17, 18, 19, 20, 21] },
  { id: "late", label: "Late", range: [22, 23, 0, 1, 2, 3, 4, 5] },
];

const dayPartKeyMap: Record<string, string> = {
  morning: "analytics.dayPartMorning",
  lunch: "analytics.dayPartLunch",
  dinner: "analytics.dayPartDinner",
  late: "analytics.dayPartLate",
};

const orderStatusKeyMap: Record<string, string> = {
  PENDING: "analytics.statusPending",
  CONFIRMED: "analytics.statusConfirmed",
  PREPARING: "analytics.statusPreparing",
  READY: "analytics.statusReady",
  SERVED: "analytics.statusServed",
  COMPLETED: "analytics.statusCompleted",
  DELIVERED: "analytics.statusDelivered",
  CANCELED: "analytics.statusCanceled",
  REJECTED: "analytics.statusRejected",
};

const numberFormat = new Intl.NumberFormat("en-GB");

const formatDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

const formatPercent = (value: number) => `${Math.round(value * 10) / 10}%`;

const safePercent = (value: number, total: number) =>
  total > 0 ? (value / total) * 100 : 0;

const getChangeCopy = (change?: number) => {
  if (change === undefined) return null;
  const isUp = change >= 0;
  return {
    isUp,
    label: `${isUp ? "+" : "-"}${formatPercent(Math.abs(change))}`,
  };
};

const AnalyticsView = () => {
  const { activeRestaurant }: any = useContext(RestaurantContext);
  const { t } = useTranslation();
  const canFullAnalytics = useFeature("analytics:full");
  const dateRange = useSummaryDateRange();

  const { data, isLoading, error } = useAnalytics(
    activeRestaurant?.id,
    dateRange.period,
    dateRange.startDate,
    dateRange.endDate,
  );

  const { data: feedbackData } = useQuery({
    queryKey: ["feedbackSummary", activeRestaurant?.id],
    queryFn: () => getFeedbackSummary(activeRestaurant!.id),
    enabled: !!activeRestaurant?.id && canFullAnalytics,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const insights = useMemo(() => {
    if (!data) return null;

    const trend = data.revenueTrend ?? [];
    const topItems = data.topItems ?? [];
    const peakHours = data.peakHours ?? [];
    const tables = data.ordersByTable ?? [];
    const statuses = data.ordersByStatus ?? [];

    const bestDay = trend.reduce(
      (best, point) => (point.revenue > best.revenue ? point : best),
      trend[0],
    );
    const quietDay = trend.reduce(
      (quiet, point) => (point.orders < quiet.orders ? point : quiet),
      trend[0],
    );
    const averageDailyRevenue =
      trend.length > 0 ? data.totalRevenue / trend.length : 0;
    const peakHour = peakHours.reduce(
      (max, hour) => (hour.orders > max.orders ? hour : max),
      peakHours[0],
    );
    const peakRevenueHour = peakHours.reduce(
      (max, hour) => ((hour.revenue ?? 0) > (max?.revenue ?? 0) ? hour : max),
      peakHours[0],
    );

    const windowScores = peakHours.map((hour, index) => {
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
      (max, current) => (current.orders > max.orders ? current : max),
      windowScores[0],
    );

    const topItemRevenue = topItems.reduce(
      (sum, item) => sum + item.revenue,
      0,
    );
    const topThreeRevenue = topItems
      .slice(0, 3)
      .reduce((sum, item) => sum + item.revenue, 0);
    const heroItem = topItems[0];
    const bestTable = tables[0];
    const completed =
      statuses.find((status) => status.status === "COMPLETED")?.count ?? 0;
    const canceled =
      statuses.find((status) => status.status === "CANCELED")?.count ?? 0;
    const cancelRate = safePercent(canceled, data.totalOrders);
    const topThreeShare = safePercent(topThreeRevenue, data.totalRevenue);
    const topItemShare = safePercent(heroItem?.revenue ?? 0, data.totalRevenue);

    const dayPartTotals = dayParts.map((part) => {
      const orders = part.range.reduce(
        (sum, hour) =>
          sum + (peakHours.find((h) => h.hour === hour)?.orders ?? 0),
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
  }, [data]);

  const handleExport = async () => {
    if (!data) return;
    await downloadAnalyticsExport(
      data,
      {
        restaurantName: activeRestaurant?.name ?? "restaurant",
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        period: dateRange.period,
      },
      t,
      feedbackData ?? null,
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-panel border-destructive/20 text-destructive p-8 rounded-lg text-center">
        <p className="font-display font-bold text-xl mb-2">
          {t("analytics.loadingFailed")}
        </p>
        <p className="text-sm opacity-70">{t("analytics.checkConnection")}</p>
      </div>
    );
  }

  if (!data || !insights) return null;

  const comparisonLabel =
    data.prevPeriodStart && data.prevPeriodEnd
      ? `${formatDate(data.prevPeriodStart.slice(0, 10))} - ${formatDate(data.prevPeriodEnd.slice(0, 10))}`
      : t("analytics.vsLastPeriod", "vs previous period");

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <DateRangeFilter
          period={dateRange.period}
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          label={dateRange.label}
          title={t("analytics.deepTitle", "Performance Analytics")}
          subtitle={`${dateRange.label} - ${t("analytics.deepSubtitle", "Deep revenue, demand, menu, table, and guest intelligence")}`}
          onPeriodChange={dateRange.setPeriod}
          onCustomRange={dateRange.setCustomRange}
        />
        <button
          onClick={handleExport}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-foreground text-background text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
        >
          <Download className="w-4 h-4" />
          {t("analytics.exportLabel", "Export")}
        </button>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <MetricCard
          label={t("analytics.totalRevenue", "Revenue")}
          value={formatEuro(data.totalRevenue)}
          change={data.comparison.revenueChange}
          comparisonLabel={comparisonLabel}
          Icon={Wallet}
        />
        <MetricCard
          label={t("analytics.totalOrders", "Orders")}
          value={numberFormat.format(data.totalOrders)}
          change={data.comparison.ordersChange}
          comparisonLabel={comparisonLabel}
          Icon={ReceiptText}
        />
        <MetricCard
          label={t("analytics.avgOrderValue", "Avg. order")}
          value={formatEuro(data.avgOrderValue)}
          change={data.comparison.avgOrderValueChange}
          comparisonLabel={comparisonLabel}
          Icon={Target}
        />
        <MetricCard
          label={t("analytics.activeCustomers", "Active customers")}
          value={numberFormat.format(data.newCustomers)}
          change={data.comparison.newCustomersChange}
          comparisonLabel={comparisonLabel}
          Icon={Users}
        />
        <MetricCard
          label={t("analytics.completionRate", "Completion rate")}
          value={formatPercent(data.completionRate)}
          detail={t("analytics.servedCompleted", { count: insights.completed })}
          Icon={CheckCircle2}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-5">
        <RevenueReconciliation
          ordered={data.totalRevenue}
          collected={data.collectedRevenue}
          refunded={data.refundedAmount}
        />
        <PaymentMethods
          methods={data.paymentsByMethod ?? []}
          collected={data.collectedRevenue}
        />
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <InsightCard
          label={t("analytics.revenueLeader", "Revenue leader")}
          value={insights.bestDay ? formatDate(insights.bestDay.date) : "-"}
          detail={
            insights.bestDay
              ? t("analytics.revenueLeaderDetail", {
                  revenue: formatEuro(insights.bestDay.revenue),
                  orders: insights.bestDay.orders,
                })
              : t("analytics.noData")
          }
          Icon={TrendingUp}
        />
        <InsightCard
          label={t("analytics.peakWindow", "Peak window")}
          value={insights.busiestWindow?.label ?? "-"}
          detail={t("analytics.peakWindowDetail", {
            orders: insights.busiestWindow?.orders ?? 0,
          })}
          Icon={Clock3}
        />
        <InsightCard
          label={t("analytics.menuConcentration", "Top 3 menu share")}
          value={formatPercent(insights.topThreeShare)}
          detail={
            insights.heroItem
              ? t("analytics.menuConcentrationDetail", {
                  name: insights.heroItem.name,
                  share: formatPercent(insights.topItemShare),
                })
              : t("analytics.noItemData")
          }
          Icon={Utensils}
        />
        <InsightCard
          label={t("analytics.tableChampion", "Best table")}
          value={insights.bestTable?.table ?? "-"}
          detail={
            insights.bestTable
              ? t("analytics.tableChampionDetail", {
                  revenue: formatEuro(insights.bestTable.revenue),
                  orders: insights.bestTable.orders,
                })
              : t("analytics.noTableData")
          }
          Icon={Table2}
        />
        <InsightCard
          label={t("analytics.repeatCustomers", "Repeat guests")}
          value={formatPercent(data.repeatCustomerRate)}
          detail={t(
            "analytics.repeatCustomersDetail",
            "Share of guests with 2+ orders",
          )}
          Icon={Users}
        />
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.55fr_1fr] gap-5">
        <Panel
          title={t("analytics.revenueCommand", "Revenue command center")}
          eyebrow={t("analytics.financialTrend", "Financial trend")}
          action={`${t("analytics.dailyAverage", "Daily avg")} ${formatEuro(insights.averageDailyRevenue)}`}
        >
          {data.revenueTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={330}>
              <AreaChart
                data={data.revenueTrend}
                margin={{ top: 10, right: 12, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient
                    id="analyticsRevenue"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--color-primary))"
                      stopOpacity={0.32}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--color-primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="currentColor"
                  className="text-border"
                  vertical={false}
                  opacity={0.45}
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatDate}
                  tick={{
                    fontSize: 11,
                    fill: "hsl(var(--color-muted-foreground))",
                  }}
                  axisLine={false}
                  tickLine={false}
                  dy={10}
                />
                <YAxis
                  tickFormatter={(value) => formatEuro(Number(value))}
                  tick={{
                    fontSize: 11,
                    fill: "hsl(var(--color-muted-foreground))",
                  }}
                  axisLine={false}
                  tickLine={false}
                  width={68}
                />
                <Tooltip content={<CustomTooltip currency />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name={t("analytics.revenue", "Revenue")}
                  stroke="hsl(var(--color-primary))"
                  strokeWidth={3}
                  fill="url(#analyticsRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              message={t(
                "analytics.noRevenue",
                "No revenue data for this period",
              )}
            />
          )}
        </Panel>

        <Panel
          title={t("analytics.actionableSignals", "Actionable signals")}
          eyebrow={t("analytics.operatorNotes", "Operator notes")}
        >
          <div className="space-y-3">
            <SignalRow
              Icon={Sparkles}
              label={t("analytics.protectRush", "Protect the rush")}
              value={
                insights.busiestWindow
                  ? t("analytics.protectRushDetail", {
                      window: insights.busiestWindow.label,
                    })
                  : t("analytics.noRushYet")
              }
            />
            <SignalRow
              Icon={Award}
              label={t("analytics.pushHero", "Push the hero")}
              value={
                insights.heroItem
                  ? t("analytics.pushHeroDetail", {
                      name: insights.heroItem.name,
                    })
                  : t("analytics.noItemData")
              }
            />
            <SignalRow
              Icon={TrendingDown}
              label={t("analytics.watchCancellations", "Watch cancellations")}
              value={t("analytics.watchCancellationsDetail", {
                rate: formatPercent(insights.cancelRate),
                count: insights.canceled,
              })}
            />
            <SignalRow
              Icon={Lightbulb}
              label={t("analytics.lowDemand", "Lift quiet days")}
              value={
                insights.quietDay
                  ? t("analytics.lowDemandDetail", {
                      date: formatDate(insights.quietDay.date),
                      orders: insights.quietDay.orders,
                    })
                  : t("analytics.noData")
              }
            />
          </div>
        </Panel>
      </section>

      {!canFullAnalytics && (
        <div className="glass-panel p-6 rounded-lg border-primary/20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Lock className="w-5 h-5 text-primary flex-shrink-0" />
            <div>
              <p className="text-sm font-black uppercase tracking-widest text-foreground">
                {t("tierLocked.analyticsTitle", "Full Analytics locked")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t(
                  "tierLocked.analyticsDesc",
                  "Deep menu, table, demand, and guest analytics require Professional plan.",
                )}
              </p>
            </div>
          </div>
          <a
            href="/pricing"
            className="px-4 py-2 brand-cta text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap flex-shrink-0"
          >
            {t("tierLocked.upgrade", "Upgrade")}
          </a>
        </div>
      )}

      {canFullAnalytics && (
        <section className="grid grid-cols-1 gap-5">
          <Panel
            title={t("analytics.demandMap", "Demand map")}
            eyebrow={t("analytics.peakHours", "Peak hours")}
            action={
              insights.peakHour
                ? `${t("analytics.peakHour", "Peak")} ${insights.peakHour.label}`
                : undefined
            }
          >
            <HourlyDemand hours={insights.peakHours} />
            {insights.peakRevenueHour &&
              (insights.peakRevenueHour.revenue ?? 0) > 0 && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {t("analytics.peakRevenueHour", "Top revenue hour")}:{" "}
                  <span className="font-bold text-foreground">
                    {insights.peakRevenueHour.label}
                  </span>{" "}
                  ({formatEuro(insights.peakRevenueHour.revenue)})
                </p>
              )}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              {insights.dayPartTotals.map((part) => (
                <div
                  key={part.label}
                  className="rounded-lg border border-border bg-secondary/20 p-3"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {t(dayPartKeyMap[part.id])}
                  </p>
                  <p className="text-lg font-display font-black text-foreground mt-1">
                    {numberFormat.format(part.orders)}
                  </p>
                  <div className="mt-2 h-1.5 rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(100, part.share)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </section>
      )}

      {canFullAnalytics && (
        <section className="grid grid-cols-1 gap-5">
          <Panel
            title={t("analytics.menuEngineering", "Menu engineering")}
            eyebrow={t("analytics.popularSelections", "Popular selections")}
            action={`${t("analytics.topRevenueTracked", "Tracked top items")} ${formatEuro(insights.topItemRevenue)}`}
          >
            <MenuEngineering
              items={insights.topItems}
              totalRevenue={data.totalRevenue}
            />
          </Panel>
        </section>
      )}

      {canFullAnalytics && (
        <section className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-5">
          <Panel
            title={t("analytics.categoryMix", "Category mix")}
            eyebrow={t("analytics.categoryBreakdown", "Category breakdown")}
          >
            <CategoryMix categories={data.categoryBreakdown ?? []} />
          </Panel>

          <Panel
            title={t("analytics.tableYield", "Table yield")}
            eyebrow={t("analytics.topTables", "Top tables by revenue")}
          >
            <TableYield tables={insights.tables} />
          </Panel>
        </section>
      )}

      {canFullAnalytics && (
        <section className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-5">
          <Panel
            title={t("analytics.orderFlow", "Order flow")}
            eyebrow={t("analytics.operations", "Operations")}
          >
            <OrderFlow
              statuses={insights.statuses}
              totalOrders={data.totalOrders}
            />
          </Panel>

          <Panel
            title={t("analytics.guestVoice", "Guest voice")}
            eyebrow={t("analytics.guestSatisfaction", "Guest satisfaction")}
          >
            <GuestSatisfaction feedbackData={feedbackData} />
          </Panel>
        </section>
      )}
    </div>
  );
};

const RevenueReconciliation = ({
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
  const uncollected = Math.round(Math.max(0, ordered - collected) * 100) / 100;
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
          ? `${formatPercent(refundRate)} ${t("analytics.ofCollected", "of collected")}`
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
        uncollected > 0
          ? `${t("analytics.recoUncollected", "Uncollected")} ${formatEuro(uncollected)}`
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
          "analytics.recoExplainer",
          "Ordered counts every placed order; collected counts recorded payments. They differ for cash orders not closed through the POS and for refunds.",
        )}
      </p>
    </Panel>
  );
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  STRIPE: "Card · Stripe",
  MYPOS: "Card · myPOS",
  BORICA: "Card · BORICA",
  EPAY: "ePay.bg",
  CASH: "Cash",
};

const PaymentMethods = ({
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
                    {PAYMENT_METHOD_LABELS[m.method] ?? m.method}
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

const MetricCard = ({
  label,
  value,
  change,
  comparisonLabel,
  detail,
  Icon,
}: {
  label: string;
  value: string;
  change?: number;
  comparisonLabel?: string;
  detail?: string;
  Icon: typeof Wallet;
}) => {
  const changeCopy = getChangeCopy(change);

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <p className="mt-4 text-2xl font-display font-black text-foreground">
        {value}
      </p>
      {changeCopy ? (
        <div className="mt-3 flex items-center gap-2 text-[11px] font-bold">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${changeCopy.isUp ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}
          >
            {changeCopy.isUp ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : (
              <ArrowDownRight className="w-3 h-3" />
            )}
            {changeCopy.label}
          </span>
          <span className="text-muted-foreground truncate">
            {comparisonLabel}
          </span>
        </div>
      ) : (
        <p className="mt-3 text-[11px] font-bold text-muted-foreground">
          {detail}
        </p>
      )}
    </div>
  );
};

const InsightCard = ({
  label,
  value,
  detail,
  Icon,
}: {
  label: string;
  value: string;
  detail: string;
  Icon: typeof Wallet;
}) => (
  <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
    <div className="flex items-center gap-2 text-primary">
      <Icon className="w-4 h-4" />
      <p className="text-[10px] font-black uppercase tracking-widest">
        {label}
      </p>
    </div>
    <p className="mt-3 text-xl font-display font-black text-foreground">
      {value}
    </p>
    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
      {detail}
    </p>
  </div>
);

const Panel = ({
  title,
  eyebrow,
  action,
  children,
}: {
  title: string;
  eyebrow: string;
  action?: string;
  children: React.ReactNode;
}) => (
  <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
    <div className="mb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-primary">
          {eyebrow}
        </p>
        <h3 className="mt-1 text-lg font-display font-black text-foreground">
          {title}
        </h3>
      </div>
      {action && (
        <span className="rounded-md bg-secondary px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
          {action}
        </span>
      )}
    </div>
    {children}
  </div>
);

const SignalRow = ({
  Icon,
  label,
  value,
}: {
  Icon: typeof Wallet;
  label: string;
  value: string;
}) => (
  <div className="rounded-lg border border-border bg-secondary/20 p-3">
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-primary" />
      <p className="text-xs font-black uppercase tracking-widest text-foreground">
        {label}
      </p>
    </div>
    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
      {value}
    </p>
  </div>
);

const HourlyDemand = ({
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
          className="relative flex h-full items-end gap-1.5 overflow-x-auto pb-10 sm:gap-2"
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
                className={`relative flex h-full min-w-[34px] flex-1 cursor-pointer flex-col items-center justify-end rounded-md px-0.5 outline-none transition ${
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
                  className={`w-full max-w-[34px] rounded-t-lg transition-all duration-300 ${
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

const MenuEngineering = ({
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
            key={item.name}
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
                {formatPercent(share)} {t("analytics.ofRevenue")}
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

const CategoryMix = ({
  categories,
}: {
  categories: Array<{ category: string; revenue: number }>;
}) => {
  const { t } = useTranslation();
  const total = categories.reduce((sum, category) => sum + category.revenue, 0);

  if (categories.length === 0)
    return <EmptyState message={t("analytics.noCategoryData")} />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[210px_1fr] gap-5 items-center">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={categories}
            dataKey="revenue"
            nameKey="category"
            innerRadius={58}
            outerRadius={92}
            paddingAngle={3}
            stroke="none"
          >
            {categories.map((_, index) => (
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
        {categories.slice(0, 6).map((category, index) => (
          <div
            key={category.category}
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

const TableYield = ({
  tables,
}: {
  tables: Array<{ table: string; orders: number; revenue: number }>;
}) => {
  const { t } = useTranslation();
  if (tables.length === 0)
    return <EmptyState message={t("analytics.noTableYieldData")} />;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={tables.slice(0, 10)}
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
          fill="hsl(var(--color-primary))"
          radius={[6, 6, 0, 0]}
          barSize={26}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

const OrderFlow = ({
  statuses,
  totalOrders,
}: {
  statuses: Array<{ status: string; count: number }>;
  totalOrders: number;
}) => {
  const { t } = useTranslation();
  if (statuses.length === 0)
    return <EmptyState message={t("analytics.noOrderStatusData")} />;

  return (
    <div className="space-y-3">
      {statuses.map((status) => {
        const share = safePercent(status.count, totalOrders);
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

const GuestSatisfaction = ({ feedbackData }: { feedbackData: any }) => {
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

const CustomTooltip = ({ active, payload, label, currency = false }: any) => {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value ?? 0);

  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-xl">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-base font-display font-black text-foreground">
        {currency ? formatEuro(value) : numberFormat.format(value)}
      </p>
    </div>
  );
};

const EmptyState = ({ message }: { message: string }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <BarChart3 className="h-10 w-10 text-muted-foreground/45 mb-4" />
      <p className="text-sm font-bold text-foreground">{message}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {t("analytics.dataAppearsHere")}
      </p>
    </div>
  );
};

export default AnalyticsView;
