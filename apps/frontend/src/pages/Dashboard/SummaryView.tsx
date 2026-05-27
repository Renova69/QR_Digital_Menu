import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, Lock, Users2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import RestaurantContext from "../../context/RestaurantContext";
import { useFeature } from "../../hooks/useFeature";
import { useAnalytics } from "../../hooks/useAnalytics";
import { useSummaryDateRange } from "../../hooks/useSummaryDateRange";
import { usePaymentSummary } from "../../hooks/usePaymentSummary";
import { useScanStats } from "../../hooks/useScanStats";
import { getLoyaltyAnalytics, getOrders, getTableStatuses } from "../../lib/api";
import KpiCard from "../../components/dashboard/KpiCard";
import DateRangeFilter from "./summary/DateRangeFilter";
import KpiRow from "./summary/KpiRow";
import OrdersOverviewChart from "./summary/OrdersOverviewChart";
import RecentOrdersTable from "./summary/RecentOrdersTable";
import LiveTablesGrid from "./summary/LiveTablesGrid";
import TopDishesTable from "./summary/TopDishesTable";
import PaymentsSummaryCard from "./summary/PaymentsSummaryCard";
import LoyaltyRetentionCard from "./summary/LoyaltyRetentionCard";
import QuickActionsRow from "./summary/QuickActionsRow";

const UpgradeBanner = ({ feature }: { feature: string }) => {
  const { t } = useTranslation();
  return (
    <div className="glass-panel rounded-[1.5rem] p-8 flex flex-col items-center justify-center gap-3 text-center">
      <Lock className="w-8 h-8 text-muted-foreground/50" />
      <p className="text-sm font-bold text-muted-foreground">{t('dashboard.upgradeToAccess', { feature })}</p>
      <p className="text-xs text-muted-foreground/70">{t('dashboard.availableOnPro')}</p>
    </div>
  );
};

const SummaryView = () => {
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const { t } = useTranslation();
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
    canFull,
  );

  const { data: paymentSummary } = usePaymentSummary(
    restaurantId,
    dateRange.startDate,
    dateRange.endDate,
    canPayments,
  );

  const { data: loyalty } = useQuery({
    queryKey: ['loyaltyAnalytics', restaurantId],
    queryFn: () => getLoyaltyAnalytics(restaurantId!),
    enabled: !!restaurantId && canLoyalty && activeRestaurant?.isLoyaltyEnabled,
    staleTime: 60_000,
  });

  const { data: recentOrders } = useQuery({
    queryKey: ['recentOrders', restaurantId, dateRange.startDate, dateRange.endDate],
    queryFn: () => getOrders({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      limit: 50,
    }),
    enabled: !!restaurantId && canOrders,
    staleTime: 30_000,
  });

  const { data: tables } = useQuery({
    queryKey: ['tableStatuses', restaurantId],
    queryFn: () => getTableStatuses(restaurantId!),
    enabled: !!restaurantId && canOrders,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: scanStats, isLoading: scanLoading } = useScanStats();

  return (
    <div className="space-y-6">
      <DateRangeFilter
        period={dateRange.period}
        startDate={dateRange.startDate}
        endDate={dateRange.endDate}
        label={dateRange.label}
        onPeriodChange={dateRange.setPeriod}
        onCustomRange={dateRange.setCustomRange}
      />

      {/* KPI Row */}
      {canBasic && analytics ? (
        <KpiRow data={analytics} showTrends={canFull} />
      ) : (
        <div className="space-y-4">
          {/* Scan metrics — FREE tier */}
          <div className="grid grid-cols-2 gap-4">
            <KpiCard
              label={t("dashboard.menuViews")}
              value={scanLoading ? "..." : (scanStats?.totalViews ?? 0).toLocaleString('en-US')}
              Icon={Eye}
            />
            <KpiCard
              label={t("dashboard.uniqueVisitors")}
              value={scanLoading ? "..." : (scanStats?.uniqueVisitors ?? 0).toLocaleString('en-US')}
              Icon={Users2}
            />
          </div>

          {/* Per-table breakdown */}
          {!scanLoading && scanStats && scanStats.perTable.length > 0 && (
            <div className="glass-panel rounded-[1.5rem] p-5">
              <p className="text-sm font-display font-bold text-foreground mb-3">
                {t("dashboard.perTableViews")}
              </p>
              <div className="space-y-2">
                {scanStats.perTable.slice(0, 10).map((row) => (
                  <div key={row.tableName} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{row.tableName}</span>
                    <span className="font-semibold text-foreground">{t("dashboard.perTableViewsCount", { views: row.views, unique: row.uniqueVisitors })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upsell banner */}
          <div className="glass-panel rounded-[1.5rem] p-6 flex flex-col items-center gap-3 text-center border border-primary/20 bg-primary/5">
            <p className="text-sm font-bold text-foreground">
              {t("dashboard.scanUpsellTitle")}
            </p>
            <p className="text-xs text-muted-foreground max-w-md">
              {t("dashboard.scanUpsellBody", { count: scanStats?.totalViews ?? 0 })}
            </p>
            <a
              href="/pricing"
              className="mt-1 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--brand)' }}
            >
              {t("tierLocked.upgrade", "Upgrade")}
            </a>
          </div>
        </div>
      )}

      {/* Row 2: Chart + Recent Orders + Live Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1.2fr_1fr] gap-5">
        {!canFull ? (
          <UpgradeBanner feature={t('dashboard.ordersOverview')} />
        ) : analytics ? (
          <OrdersOverviewChart data={analytics.revenueTrend} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-5 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">{t('dashboard.loadingChart')}</p>
          </div>
        )}
        {!canOrders ? (
          <UpgradeBanner feature={t('dashboard.recentOrders')} />
        ) : (
          <RecentOrdersTable orders={Array.isArray(recentOrders) ? recentOrders : (recentOrders as any)?.data ?? []} />
        )}
        {!canOrders ? (
          <UpgradeBanner feature={t('dashboard.liveTables')} />
        ) : tables ? (
          <LiveTablesGrid tables={tables} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-5 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">{t('dashboard.loadingTables')}</p>
          </div>
        )}
      </div>

      {/* Row 3: Top Dishes + Payments + Loyalty */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.2fr_1fr] gap-5">
        {!canFull ? (
          <UpgradeBanner feature={t('dashboard.topDishes')} />
        ) : analytics ? (
          <TopDishesTable items={analytics.topItems} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-5">
            <h3 className="text-sm font-display font-bold text-foreground mb-4">{t('dashboard.topDishes')}</h3>
            <p className="text-xs text-muted-foreground text-center py-8">{t('dashboard.noData', 'No data for this period')}</p>
          </div>
        )}
        {!canPayments ? (
          <UpgradeBanner feature={t('dashboard.payments')} />
        ) : paymentSummary && paymentSummary.totalCollected > 0 ? (
          <PaymentsSummaryCard data={paymentSummary} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-5">
            <h3 className="text-sm font-display font-bold text-foreground mb-4">{t('dashboard.payments')}</h3>
            <p className="text-xs text-muted-foreground text-center py-8">{t('dashboard.noPaymentsPeriod')}</p>
          </div>
        )}
        {!canLoyalty ? (
          <UpgradeBanner feature={t('dashboard.loyaltyRetention')} />
        ) : loyalty ? (
          <LoyaltyRetentionCard data={loyalty} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-5">
            <h3 className="text-sm font-display font-bold text-foreground mb-4">{t('dashboard.loyaltyRetention')}</h3>
            <p className="text-xs text-muted-foreground text-center py-8">
              {activeRestaurant?.isLoyaltyEnabled
                ? t('dashboard.noLoyaltyData', 'No loyalty data yet')
                : t('dashboard.loyaltyDisabled', 'Loyalty program is disabled — enable it in Settings')}
            </p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <QuickActionsRow restaurantId={restaurantId} />
    </div>
  );
};

export default SummaryView;
