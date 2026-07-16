import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, QrCode, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import RestaurantContext from "../../context/RestaurantContext";
import { useFeature } from "../../hooks/useFeature";
import { useAnalytics } from "../../hooks/useAnalytics";
import { useSummaryDateRange } from "../../hooks/useSummaryDateRange";
import { usePaymentSummary } from "../../hooks/usePaymentSummary";
import { useScanStats } from "../../hooks/useScanStats";
import {
  getLoyaltyAnalytics,
  getOrders,
  getTableStatuses,
} from "../../lib/api";
import DateRangeFilter from "./summary/DateRangeFilter";
import KpiRow from "./summary/KpiRow";
import OrdersOverviewChart from "./summary/OrdersOverviewChart";
import RecentOrdersTable from "./summary/RecentOrdersTable";
import LiveTablesGrid from "./summary/LiveTablesGrid";
import TopDishesTable from "./summary/TopDishesTable";
import PaymentsSummaryCard from "./summary/PaymentsSummaryCard";
import DailyTargetCard from "./summary/DailyTargetCard";
import LoyaltyRetentionCard from "./summary/LoyaltyRetentionCard";
import QuickActionsRow from "./summary/QuickActionsRow";

const UpgradeBanner = ({ feature }: { feature: string }) => {
  const { t } = useTranslation();
  return (
    <div className="glass-panel rounded-[1.5rem] p-8 flex flex-col items-center justify-center gap-3 text-center">
      <Lock className="w-8 h-8 text-muted-foreground/50" />
      <p className="text-sm font-bold text-muted-foreground">
        {t("dashboard.upgradeToAccess", { feature })}
      </p>
      <p className="text-xs text-muted-foreground/70">
        {t("dashboard.availableOnPro")}
      </p>
    </div>
  );
};

const SummaryView = () => {
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const { t, i18n } = useTranslation();
  const restaurantId = activeRestaurant?.id;
  const canBasic = useFeature("analytics:basic");
  const canFull = useFeature("analytics:full");
  const canOrders = useFeature("orders:receive");
  const canPayments = useFeature("payments:stripe");
  const canLoyalty = useFeature("loyalty");

  const dateRange = useSummaryDateRange();
  const { data: analytics } = useAnalytics(
    restaurantId,
    dateRange.period,
    dateRange.startDate,
    dateRange.endDate,
    canBasic,
    canFull ? "full" : "basic",
  );

  const { data: paymentSummary } = usePaymentSummary(
    restaurantId,
    dateRange.period,
    dateRange.startDate,
    dateRange.endDate,
    canPayments,
  );

  const { data: loyalty } = useQuery({
    queryKey: ["loyaltyAnalytics", restaurantId],
    queryFn: () => getLoyaltyAnalytics(restaurantId!),
    enabled: !!restaurantId && canLoyalty && activeRestaurant?.isLoyaltyEnabled,
    staleTime: 60_000,
  });

  const { data: recentOrders } = useQuery({
    queryKey: [
      "recentOrders",
      restaurantId,
      dateRange.period,
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () =>
      getOrders({
        restaurantId: restaurantId!,
        ...(!dateRange.startDate && !dateRange.endDate
          ? { period: dateRange.period }
          : {}),
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        limit: 50,
      }),
    enabled: !!restaurantId && canOrders,
    staleTime: 30_000,
  });

  const { data: tables } = useQuery({
    queryKey: ["tableStatuses", restaurantId],
    queryFn: () => getTableStatuses(restaurantId!),
    enabled: !!restaurantId && canOrders,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: scanStats, isLoading: scanLoading } = useScanStats(
    dateRange.period,
    dateRange.startDate,
    dateRange.endDate,
  );

  return (
    <div className="space-y-5 md:space-y-6">
      <DateRangeFilter
        period={dateRange.period}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        label={dateRange.label}
        onPeriodChange={dateRange.setPeriod}
        onCustomRange={dateRange.setCustomRange}
      />

      {/* Reach metrics + per-table breakdown */}
      {(() => {
        const hasPerTable =
          !scanLoading && !!scanStats && scanStats.perTable.length > 0;
        return (
          <div
            className={
              hasPerTable
                ? "grid grid-cols-2 gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_3fr]"
                : "grid grid-cols-1 sm:grid-cols-2 gap-4"
            }
          >
            <div className="kpi-tile p-4 md:p-5 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {t("dashboard.menuViews")}
                </p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/15">
                  <QrCode className="w-3.5 h-3.5 text-primary" />
                </div>
              </div>
              <p className="text-[1.65rem] font-display font-bold text-foreground leading-none">
                {scanLoading
                  ? "..."
                  : (scanStats?.totalViews ?? 0).toLocaleString(i18n.language)}
              </p>
            </div>
            <div className="kpi-tile p-4 md:p-5 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {t("dashboard.uniqueVisitors")}
                </p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-primary/10 border border-primary/15">
                  <User className="w-3.5 h-3.5 text-primary" />
                </div>
              </div>
              <p className="text-[1.65rem] font-display font-bold text-foreground leading-none">
                {scanLoading
                  ? "..."
                  : (scanStats?.uniqueVisitors ?? 0).toLocaleString(
                      i18n.language,
                    )}
              </p>
            </div>
            {hasPerTable && (
              <div className="glass-panel rounded-[1.5rem] p-4 md:p-5 col-span-2 lg:col-span-1">
                <p className="text-sm font-display font-bold text-foreground mb-3">
                  {t("dashboard.perTableViews")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2">
                  {scanStats!.perTable.slice(0, 12).map((row) => (
                    <div
                      key={row.tableName}
                      className="flex items-center justify-between gap-3 sm:grid sm:grid-cols-[auto_1fr] sm:items-center sm:gap-x-4 sm:gap-y-1 border-b border-border/20 last:border-b-0 py-2.5 sm:py-3"
                    >
                      {/* Tablet+: large table number */}
                      <span className="text-sm text-muted-foreground font-medium tabular-nums shrink-0 min-w-[1.5rem] sm:text-xl sm:font-display sm:font-bold sm:text-foreground sm:min-w-[2.5rem] sm:text-center sm:leading-none sm:row-span-2">
                        {row.tableName ||
                          t("dashboard.unknownTable", "Unknown table")}
                      </span>

                      {/* Tablet+: stacked stats */}
                      <div className="hidden sm:flex sm:flex-col sm:gap-1">
                        <span className="text-xs text-foreground font-semibold tabular-nums leading-tight">
                          {t("dashboard.perTableViewsViews", {
                            count: row.views,
                          })}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums leading-tight">
                          {t("dashboard.perTableViewsUnique", {
                            count: row.uniqueVisitors,
                          })}
                        </span>
                      </div>

                      {/* Mobile: single line */}
                      <span className="text-xs font-semibold text-foreground tabular-nums sm:hidden">
                        {t("dashboard.perTableViewsViews", {
                          count: row.views,
                        })}{" "}
                        ·{" "}
                        {t("dashboard.perTableViewsUnique", {
                          count: row.uniqueVisitors,
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Revenue / order KPIs — paid tiers (STARTER+) only */}
      {canBasic && analytics && (
        <KpiRow data={analytics} showTrends={canFull} />
      )}

      {/* Daily revenue target + progress — paid tiers (STARTER+) only */}
      {canBasic && <DailyTargetCard restaurantId={restaurantId} />}

      {/* Upsell banner — FREE tier only */}
      {!canBasic && (
        <div className="glass-panel rounded-[1.5rem] p-5 md:p-6 flex flex-col items-center gap-3 text-center border border-primary/20 bg-primary/5">
          <p className="text-sm font-bold text-foreground">
            {t("dashboard.scanUpsellTitle")}
          </p>
          <p className="text-xs text-muted-foreground max-w-md">
            {t("dashboard.scanUpsellBody", {
              count: scanStats?.totalViews ?? 0,
              period: dateRange.label.toLocaleLowerCase(i18n.language),
            })}
          </p>
          <a
            href="/pricing"
            className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--brand)" }}
          >
            {t("tierLocked.upgrade", "Upgrade")}
          </a>
        </div>
      )}

      {/* Row 2: Chart + Payments | Live Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-5">
        <div className="flex flex-col gap-5">
          {!canFull ? (
            <UpgradeBanner feature={t("dashboard.ordersOverview")} />
          ) : analytics ? (
            <OrdersOverviewChart data={analytics.revenueTrend} />
          ) : (
            <div className="glass-panel rounded-[1.5rem] p-4 md:p-5 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">
                {t("dashboard.loadingChart")}
              </p>
            </div>
          )}
          {!canPayments ? (
            <UpgradeBanner feature={t("dashboard.payments")} />
          ) : paymentSummary &&
            (paymentSummary.totalCollected > 0 ||
              paymentSummary.refundAmount > 0) ? (
            <PaymentsSummaryCard data={paymentSummary} />
          ) : (
            <div className="glass-panel rounded-[1.5rem] p-4 md:p-5">
              <h3 className="text-sm font-display font-bold text-foreground mb-4">
                {t("dashboard.payments")}
              </h3>
              <p className="text-xs text-muted-foreground text-center py-8">
                {t("dashboard.noPaymentsPeriod")}
              </p>
            </div>
          )}
        </div>
        {!canOrders ? (
          <UpgradeBanner feature={t("dashboard.liveTables")} />
        ) : tables ? (
          <LiveTablesGrid tables={tables} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-4 md:p-5 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">
              {t("dashboard.loadingTables")}
            </p>
          </div>
        )}
      </div>

      {/* Row 3: Top Dishes + Loyalty + Last 50 Orders */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {!canFull ? (
          <UpgradeBanner feature={t("dashboard.topDishes")} />
        ) : analytics ? (
          <TopDishesTable items={analytics.topItems} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-4 md:p-5">
            <h3 className="text-sm font-display font-bold text-foreground mb-4">
              {t("dashboard.topDishes")}
            </h3>
            <p className="text-xs text-muted-foreground text-center py-8">
              {t("dashboard.noData", "No data for this period")}
            </p>
          </div>
        )}
        {!canLoyalty ? (
          <UpgradeBanner feature={t("dashboard.loyaltyRetention")} />
        ) : loyalty ? (
          <LoyaltyRetentionCard data={loyalty} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-4 md:p-5">
            <h3 className="text-sm font-display font-bold text-foreground mb-4">
              {t("dashboard.loyaltyRetention")}
            </h3>
            <p className="text-xs text-muted-foreground text-center py-8">
              {activeRestaurant?.isLoyaltyEnabled
                ? t("dashboard.noLoyaltyData", "No loyalty data yet")
                : t(
                    "dashboard.loyaltyDisabled",
                    "Loyalty program is disabled — enable it in Settings",
                  )}
            </p>
          </div>
        )}
        <div className="xl:col-span-2">
          {!canOrders ? (
            <UpgradeBanner feature={t("dashboard.recentOrders")} />
          ) : (
            <RecentOrdersTable
              orders={
                Array.isArray(recentOrders)
                  ? recentOrders
                  : ((recentOrders as any)?.data ?? [])
              }
            />
          )}
        </div>
      </div>

      {/* Quick Actions */}
      {restaurantId && <QuickActionsRow restaurantId={restaurantId} />}
    </div>
  );
};

export default SummaryView;
