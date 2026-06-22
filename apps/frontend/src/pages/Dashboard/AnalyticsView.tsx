import { useContext, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Award,
  CheckCircle2,
  Clock3,
  Download,
  Lightbulb,
  Lock,
  ReceiptText,
  Sparkles,
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
import { Panel } from "./analytics/Panel";
import MenuProfitabilityPanel from "./analytics/MenuProfitabilityPanel";
import AnalyticsSkeleton from "./analytics/AnalyticsSkeleton";
import { computeInsights } from "./analytics/insights";
import {
  dayPartKeyMap,
  formatDate,
  formatPercent,
  numberFormat,
} from "./analytics/shared";
import {
  CustomTooltip,
  EmptyState,
  InsightCard,
  MetricCard,
  SignalRow,
} from "./analytics/primitives";
import {
  CategoryMix,
  GuestSatisfaction,
  HourlyDemand,
  MenuEngineering,
  OrderFlow,
  PaymentMethods,
  RevenueReconciliation,
  TableYield,
} from "./analytics/panels";
import DateRangeFilter from "./summary/DateRangeFilter";

const AnalyticsView = () => {
  const { activeRestaurant }: any = useContext(RestaurantContext);
  const { t } = useTranslation();
  const canFullAnalytics = useFeature("analytics:full");
  const dateRange = useSummaryDateRange();
  const closeoutDateRef = useRef<HTMLInputElement | null>(null);

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

  const insights = useMemo(() => computeInsights(data), [data]);

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
    return <AnalyticsSkeleton />;
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
        {canFullAnalytics && (
          <button
            onClick={handleExport}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-foreground text-background text-xs font-bold shadow-sm hover:opacity-90 transition-opacity"
          >
            <Download className="w-4 h-4" />
            {t("analytics.exportLabel", "Export")}
          </button>
        )}
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

      {canFullAnalytics && (
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
      )}

      {canFullAnalytics && (
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
      )}

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

      {/* ── Staff Performance ──────────────────────────────────────────── */}
      {canFullAnalytics &&
        data.staffPerformance &&
        data.staffPerformance.length > 0 && (
          <section>
            <Panel
              title={t("analytics.staffPerformance", "Staff Performance")}
              eyebrow={t("analytics.teamMetrics", "Team metrics")}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground">
                      <th className="text-left py-2 pr-3 font-bold uppercase tracking-widest">
                        {t("analytics.staffName", "Staff")}
                      </th>
                      <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                        {t("analytics.orders", "Orders")}
                      </th>
                      <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                        {t("analytics.revenue", "Revenue")}
                      </th>
                      <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                        {t("analytics.avgOrder", "Avg Order")}
                      </th>
                      <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                        {t("analytics.posOrders", "POS")}
                      </th>
                      <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                        {t("analytics.qrOrders", "QR")}
                      </th>
                      <th className="text-right py-2 pl-2 font-bold uppercase tracking-widest">
                        {t("analytics.totalTips", "Tips")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.staffPerformance.map((s) => (
                      <tr
                        key={s.staffUserId}
                        className="border-b border-border/30 hover:bg-muted/40"
                      >
                        <td className="py-2 pr-3 font-semibold text-foreground">
                          {s.staffName}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums">
                          {s.totalOrders}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums font-mono">
                          {formatEuro(s.totalRevenue)}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums font-mono">
                          {formatEuro(s.avgOrderValue)}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums">
                          {s.posOrders}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums">
                          {s.qrOrders}
                        </td>
                        <td className="text-right py-2 pl-2 tabular-nums font-mono">
                          {formatEuro(s.totalTips)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>
        )}

      {/* ── Customer Insights ──────────────────────────────────────────── */}
      {canFullAnalytics && data.customerMetrics && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Panel
            title={t("analytics.topCustomers", "Top Customers")}
            eyebrow={t("analytics.customerInsights", "Customer insights")}
          >
            {data.customerMetrics.topCustomers.length > 0 ? (
              <div className="space-y-2">
                {data.customerMetrics.topCustomers.slice(0, 10).map((c, i) => (
                  <div
                    key={c.customerPhone}
                    className="flex items-center justify-between text-xs py-1.5 border-b border-border/20 last:border-0"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-black text-muted-foreground shrink-0">
                        {i + 1}
                      </span>
                      <span className="truncate font-semibold">
                        {c.customerName || c.customerPhone}
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="font-mono font-bold tabular-nums">
                        {formatEuro(c.totalSpend)}
                      </span>
                      <span className="text-muted-foreground ml-1.5">
                        {c.visitCount}×
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                message={t(
                  "analytics.noCustomerData",
                  "No customer data in this period",
                )}
              />
            )}
            {data.customerMetrics.churnRiskCount > 0 && (
              <div className="mt-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
                <span className="font-bold text-amber-800 dark:text-amber-200">
                  {t("analytics.churnRisk", "Churn risk")}:{" "}
                  {data.customerMetrics.churnRiskCount}
                </span>
                <span className="text-amber-700 dark:text-amber-300 ml-2">
                  ({data.customerMetrics.churnRiskBreakdown["30d"]}{" "}
                  {t("analytics.last30d", "30d")},{" "}
                  {data.customerMetrics.churnRiskBreakdown["60d"]}{" "}
                  {t("analytics.last60d", "60d")},{" "}
                  {data.customerMetrics.churnRiskBreakdown["90d+"]}{" "}
                  {t("analytics.last90d", "90d+")})
                </span>
              </div>
            )}
            <div className="mt-2 text-xs text-muted-foreground">
              {t("analytics.averageClv", "Avg CLV")}:{" "}
              <span className="font-mono font-bold text-foreground">
                {formatEuro(data.customerMetrics.averageClv)}
              </span>
            </div>
          </Panel>

          <Panel
            title={t("analytics.kitchenEfficiency", "Kitchen Efficiency")}
            eyebrow={t("analytics.prepTime", "Preparation time")}
          >
            {data.kitchenEfficiency ? (
              <>
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-3xl font-display font-black text-foreground tabular-nums">
                    {data.kitchenEfficiency.overallAvgPrepMinutes}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t("analytics.minutes", "min avg prep")}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-2">
                    ({data.kitchenEfficiency.totalCompletedOrders}{" "}
                    {t("analytics.ordersCompleted", "completed")})
                  </span>
                </div>
                <div className="space-y-1">
                  {data.kitchenEfficiency.hourlyAverages
                    .filter((h) => h.avgPrepMinutes > 0)
                    .map((h) => (
                      <div
                        key={h.hour}
                        className="flex items-center gap-2 text-[10px]"
                      >
                        <span className="w-10 text-right text-muted-foreground font-mono">
                          {h.label}
                        </span>
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rose-500/60 rounded-full"
                            style={{
                              width: `${Math.min(100, (h.avgPrepMinutes / (data.kitchenEfficiency?.overallAvgPrepMinutes || 1)) * 50)}%`,
                            }}
                          />
                        </div>
                        <span className="w-12 text-right font-mono font-bold tabular-nums">
                          {h.avgPrepMinutes}m
                        </span>
                      </div>
                    ))}
                </div>
              </>
            ) : (
              <EmptyState
                message={t(
                  "analytics.noKitchenData",
                  "No completed orders in this period",
                )}
              />
            )}
          </Panel>
        </section>
      )}

      {/* ── Cancel Analysis ────────────────────────────────────────────── */}
      {canFullAnalytics &&
        data.cancelAnalytics &&
        data.cancelAnalytics.totalCanceledOrders > 0 && (
          <section>
            <Panel
              title={t("analytics.cancelAnalysis", "Cancel Analysis")}
              eyebrow={t("analytics.orderIntegrity", "Order integrity")}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="rounded-lg bg-red-50 dark:bg-red-950/25 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-red-700 dark:text-red-300 mb-1">
                    {t("analytics.canceledOrders", "Canceled")}
                  </div>
                  <div className="text-2xl font-display font-black text-red-800 dark:text-red-200 tabular-nums">
                    {data.cancelAnalytics.totalCanceledOrders}
                  </div>
                </div>
                <div className="rounded-lg bg-red-50 dark:bg-red-950/25 p-4">
                  <div className="text-[10px] font-black uppercase tracking-widest text-red-700 dark:text-red-300 mb-1">
                    {t("analytics.revenueLost", "Revenue lost")}
                  </div>
                  <div className="text-2xl font-display font-black text-red-800 dark:text-red-200 tabular-nums font-mono">
                    {formatEuro(data.cancelAnalytics.revenueLost)}
                  </div>
                </div>
              </div>
              {data.cancelAnalytics.cancelRateByItem.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">
                    {t("analytics.cancelRateByItem", "Cancel rate by item")}
                  </div>
                  {data.cancelAnalytics.cancelRateByItem
                    .slice(0, 10)
                    .map((item) => (
                      <div
                        key={item.menuItemId}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span className="w-28 truncate font-semibold">
                          {item.itemName}
                        </span>
                        <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-400/60 rounded-full"
                            style={{
                              width: `${Math.min(100, item.cancelRate)}%`,
                            }}
                          />
                        </div>
                        <span className="w-12 text-right font-mono tabular-nums">
                          {item.cancelRate}%
                        </span>
                        <span className="text-muted-foreground">
                          ({item.canceledQty}/{item.totalQty})
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </Panel>
          </section>
        )}

      {/* ── Table Turnover ─────────────────────────────────────────────── */}
      {canFullAnalytics &&
        data.tableTurnover &&
        data.tableTurnover.length > 0 && (
          <section>
            <Panel
              title={t("analytics.tableTurnover", "Table Turnover")}
              eyebrow={t("analytics.floorEfficiency", "Floor efficiency")}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground">
                      <th className="text-left py-2 pr-3 font-bold uppercase tracking-widest">
                        {t("analytics.table", "Table")}
                      </th>
                      <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                        {t("analytics.sessions", "Sessions")}
                      </th>
                      <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                        {t("analytics.avgDuration", "Avg Duration")}
                      </th>
                      <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                        {t("analytics.turnsPerDay", "Est. Turns/Day")}
                      </th>
                      <th className="text-right py-2 px-2 font-bold uppercase tracking-widest">
                        {t("analytics.tableRevenue", "Revenue")}
                      </th>
                      <th className="text-right py-2 pl-2 font-bold uppercase tracking-widest">
                        {t("analytics.revPASH", "RevPASH")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tableTurnover.map((tbl) => (
                      <tr
                        key={tbl.tableId}
                        className="border-b border-border/30 hover:bg-muted/40"
                      >
                        <td className="py-2 pr-3 font-semibold text-foreground">
                          {tbl.tableName}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums">
                          {tbl.sessionCount}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums">
                          {tbl.avgDurationMinutes}m
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums">
                          {tbl.estimatedTurnsPerDay}
                        </td>
                        <td className="text-right py-2 px-2 tabular-nums font-mono">
                          {formatEuro(tbl.totalRevenue)}
                        </td>
                        <td className="text-right py-2 pl-2 tabular-nums font-mono font-bold">
                          {formatEuro(tbl.revPASH)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </section>
        )}

      {/* ── Menu Profitability ─────────────────────────────────────────── */}
      {canFullAnalytics &&
        data.menuProfitability &&
        data.menuProfitability.items.length > 0 && (
          <MenuProfitabilityPanel data={data.menuProfitability} />
        )}

      {/* ── Gross Profit ───────────────────────────────────────────────── */}
      {canFullAnalytics && data.grossProfit && (
        <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="rounded-xl bg-surface p-4 border border-border/60">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              {t("analytics.grossProfit", "Gross Profit")}
            </div>
            <div className="text-xl font-display font-black text-foreground font-mono">
              {formatEuro(data.grossProfit.grossProfit)}
            </div>
          </div>
          <div className="rounded-xl bg-surface p-4 border border-border/60">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              {t("analytics.grossMargin", "Gross Margin")}
            </div>
            <div className="text-xl font-display font-black text-emerald-600 dark:text-emerald-400">
              {data.grossProfit.grossMargin}%
            </div>
          </div>
          <div className="rounded-xl bg-surface p-4 border border-border/60">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              {t("analytics.netSales", "Net Sales")}
            </div>
            <div className="text-xl font-display font-black text-foreground font-mono">
              {formatEuro(data.grossProfit.collectedRevenue)}
            </div>
          </div>
          <div className="rounded-xl bg-surface p-4 border border-border/60">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
              {t("analytics.estimatedCOGS", "Est. COGS")}
            </div>
            <div className="text-xl font-display font-black text-foreground font-mono">
              {formatEuro(data.grossProfit.estimatedCOGS)}
            </div>
          </div>
        </section>
      )}

      {/* ── Daily Closeout Button ──────────────────────────────────────── */}
      {canFullAnalytics && (
        <section>
          <Panel
            title={t("analytics.closeoutReport", "Closeout Report")}
            eyebrow={t("analytics.accountantTools", "Accountant tools")}
          >
            <div className="flex items-center gap-3">
              <input
                ref={(el) => {
                  closeoutDateRef.current = el;
                  if (el && !el.value) {
                    el.value =
                      dateRange?.startDate?.split("T")[0] ??
                      new Date().toISOString().split("T")[0];
                  }
                }}
                type="date"
                className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-mono"
              />
              <button
                className="rounded-lg bg-foreground text-background px-4 py-2 text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
                onClick={async () => {
                  const date =
                    closeoutDateRef.current?.value ||
                    new Date().toISOString().split("T")[0];
                  const { getDailyCloseout } = await import("../../lib/api");
                  const closeout = await getDailyCloseout(
                    activeRestaurant?.id!,
                    date,
                  );
                  const { exportCloseoutXlsx } =
                    await import("../../lib/analyticsExport");
                  await exportCloseoutXlsx(closeout, t);
                }}
              >
                {t("analytics.generateCloseout", "Generate Closeout")}
              </button>
            </div>
          </Panel>
        </section>
      )}
    </div>
  );
};

export default AnalyticsView;
