import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import RestaurantContext from "../../context/RestaurantContext";
import { useOrders } from "../../context/OrderContext";
import { useFeature } from "../../hooks/useFeature";
import { useAnalytics } from "../../hooks/useAnalytics";
import { useSummaryDateRange } from "../../hooks/useSummaryDateRange";
import { usePaymentSummary } from "../../hooks/usePaymentSummary";
import { getLoyaltyAnalytics, getOrders, getTableStatuses } from "../../lib/api";
import { formatEuro } from "../../lib/currency";
import { TrendingUp, ShoppingCart, BarChart2, CreditCard, Users } from "lucide-react";
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

const UpgradeBanner = ({ feature }: { feature: string }) => (
  <div className="glass-panel rounded-[1.5rem] p-8 flex flex-col items-center justify-center gap-3 text-center">
    <Lock className="w-8 h-8 text-muted-foreground/50" />
    <p className="text-sm font-bold text-muted-foreground">Upgrade to access {feature}</p>
    <p className="text-xs text-muted-foreground/70">Available on PRO plan and above</p>
  </div>
);

const SummaryView = () => {
  const { activeRestaurant } = useContext(RestaurantContext) as any;
  const { t } = useTranslation();
  const restaurantId = activeRestaurant?.id;
  const { orders } = useOrders();

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

  // FREE tier: compute basic KPIs from orders context
  const totalRevenue = orders
    .filter((o: any) => o.status !== "CANCELED")
    .reduce((sum: number, o: any) => sum + o.totalPrice, 0);
  const totalOrders = orders.filter((o: any) => o.status !== "CANCELED").length;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const freeKpis = [
    { label: t("dashboard.totalOrders", "Total Orders"), value: totalOrders.toLocaleString('en-US'), Icon: BarChart2 },
    { label: t("dashboard.totalRevenue", "Total Revenue"), value: formatEuro(totalRevenue), Icon: TrendingUp },
    { label: "Orders (QR)", value: totalOrders.toLocaleString('en-US'), Icon: ShoppingCart },
    { label: t("dashboard.avgOrderValue", "Avg Order"), value: formatEuro(avgOrderValue), Icon: CreditCard },
    { label: "New Customers", value: "—", Icon: Users },
  ];

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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {freeKpis.map((kpi) => (
            <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} Icon={kpi.Icon} />
          ))}
        </div>
      )}

      {/* Row 2: Chart + Recent Orders + Live Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1.2fr_1fr] gap-5">
        {!canFull ? (
          <UpgradeBanner feature="Orders Chart" />
        ) : analytics ? (
          <OrdersOverviewChart data={analytics.revenueTrend} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-5 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Loading chart…</p>
          </div>
        )}
        {!canOrders ? (
          <UpgradeBanner feature="Recent Orders" />
        ) : (
          <RecentOrdersTable orders={Array.isArray(recentOrders) ? recentOrders : (recentOrders as any)?.data ?? []} />
        )}
        {!canOrders ? (
          <UpgradeBanner feature="Live Tables" />
        ) : tables ? (
          <LiveTablesGrid tables={tables} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-5 flex items-center justify-center">
            <p className="text-xs text-muted-foreground">Loading tables…</p>
          </div>
        )}
      </div>

      {/* Row 3: Top Dishes + Payments + Loyalty */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1.2fr_1fr] gap-5">
        {!canFull ? (
          <UpgradeBanner feature="Top Dishes" />
        ) : analytics ? (
          <TopDishesTable items={analytics.topItems} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-5">
            <h3 className="text-sm font-display font-bold text-foreground mb-4">Top Dishes</h3>
            <p className="text-xs text-muted-foreground text-center py-8">{t('dashboard.noData', 'No data for this period')}</p>
          </div>
        )}
        {!canPayments ? (
          <UpgradeBanner feature="Payment Summary" />
        ) : paymentSummary && paymentSummary.totalCollected > 0 ? (
          <PaymentsSummaryCard data={paymentSummary} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-5">
            <h3 className="text-sm font-display font-bold text-foreground mb-4">Payments</h3>
            <p className="text-xs text-muted-foreground text-center py-8">No payments in this period</p>
          </div>
        )}
        {!canLoyalty ? (
          <UpgradeBanner feature="Loyalty & Retention" />
        ) : loyalty ? (
          <LoyaltyRetentionCard data={loyalty} />
        ) : (
          <div className="glass-panel rounded-[1.5rem] p-5">
            <h3 className="text-sm font-display font-bold text-foreground mb-4">Loyalty & Retention</h3>
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
