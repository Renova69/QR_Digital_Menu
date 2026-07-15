import { useContext, useMemo, useRef, useState } from "react";
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
import {
  downloadAnalyticsExport,
  exportCloseoutXlsx,
} from "../../lib/analyticsExport";
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
import {
  CancelAnalysisPanel,
  CustomerKitchenPanels,
  StaffPerformancePanel,
  TableTurnoverPanel,
} from "./analytics/advancedPanels";
import DateRangeFilter from "./summary/DateRangeFilter";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../../lib/dateLocales";

function formatISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const AnalyticsView = () => {
  const { activeRestaurant }: any = useContext(RestaurantContext);
  const { t, i18n } = useTranslation();
  const canFullAnalytics = useFeature("analytics:full");
  const dateRange = useSummaryDateRange();
  const [closeoutDate, setCloseoutDate] = useState<Date>(new Date());

  const { data, isLoading, isPlaceholderData, error } = useAnalytics(
    activeRestaurant?.id,
    dateRange.period,
    dateRange.startDate,
    dateRange.endDate,
  );

  const { data: feedbackData } = useQuery({
    queryKey: [
      "feedbackSummary",
      activeRestaurant?.id,
      data?.periodStart,
      data?.periodEnd,
    ],
    queryFn: () =>
      getFeedbackSummary(
        activeRestaurant!.id,
        data?.periodStart,
        data?.periodEnd,
      ),
    enabled:
      !!activeRestaurant?.id &&
      canFullAnalytics &&
      !!data?.periodStart &&
      !!data?.periodEnd,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const insights = useMemo(() => computeInsights(data), [data]);

  const handleExport = async () => {
    if (!data || isPlaceholderData) return;
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
            disabled={isPlaceholderData}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-foreground text-background text-xs font-bold shadow-sm hover:opacity-90 transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
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
          value={numberFormat.format(data.activeCustomers)}
          change={data.comparison.activeCustomersChange}
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
              totalRevenue={insights.itemRevenueTotal}
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
          <StaffPerformancePanel rows={data.staffPerformance} />
        )}

      {/* ── Customer Insights ──────────────────────────────────────────── */}
      {canFullAnalytics && data.customerMetrics && (
        <CustomerKitchenPanels
          customerMetrics={data.customerMetrics}
          kitchenEfficiency={data.kitchenEfficiency}
        />
      )}

      {/* ── Cancel Analysis ────────────────────────────────────────────── */}
      {canFullAnalytics &&
        data.cancelAnalytics &&
        data.cancelAnalytics.totalCanceledOrders > 0 && (
          <CancelAnalysisPanel cancelAnalytics={data.cancelAnalytics} />
        )}

      {/* ── Table Turnover ─────────────────────────────────────────────── */}
      {canFullAnalytics &&
        data.tableTurnover &&
        data.tableTurnover.length > 0 && (
          <TableTurnoverPanel tables={data.tableTurnover} />
        )}

      {/* ── Menu Profitability ─────────────────────────────────────────── */}
      {canFullAnalytics &&
        data.menuProfitability &&
        (data.menuProfitability.items.length > 0 ||
          data.menuProfitability.summary.missingCostItems > 0) && (
          <MenuProfitabilityPanel data={data.menuProfitability} />
        )}

      {/* ── Gross Profit ───────────────────────────────────────────────── */}
      {canFullAnalytics && data.grossProfit && (
        <section className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {data.grossProfit.missingCostItems > 0 && (
            <p className="sm:col-span-4 text-xs text-amber-700 dark:text-amber-300">
              {t("analytics.profitCostWarning", {
                count: data.grossProfit.missingCostItems,
                defaultValue:
                  "{{count}} sold item(s) have no usable cost. Profit excludes those costs.",
              })}
            </p>
          )}
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
              {formatEuro(data.grossProfit.netSales)}
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
              <DatePicker
                selected={closeoutDate}
                onChange={(d: Date | null) => d && setCloseoutDate(d)}
                locale={i18n.language}
                dateFormat="P"
                className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-mono w-[110px]"
              />
              <button
                className="rounded-lg bg-foreground text-background px-4 py-2 text-xs font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
                onClick={async () => {
                  const date = formatISO(closeoutDate);
                  const { getDailyCloseout } = await import("../../lib/api");
                  const closeout = await getDailyCloseout(
                    activeRestaurant?.id!,
                    date,
                  );
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
