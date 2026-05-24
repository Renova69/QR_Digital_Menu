import { TrendingUp, TrendingDown, ShoppingCart, Users, Clock } from "lucide-react";
import KpiCard from "../../../components/dashboard/KpiCard";
import type { AnalyticsData } from "../../../hooks/useAnalytics";
import { formatEuro } from "../../../lib/currency";

interface KpiRowProps {
  data: AnalyticsData;
  showTrends: boolean;
}

const formatDateShort = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatComparisonLabel = (data: AnalyticsData) => {
  if (data.prevPeriodStart && data.prevPeriodEnd) {
    return `${formatDateShort(data.prevPeriodStart)} – ${formatDateShort(data.prevPeriodEnd)}`;
  }
  return "prev period";
};

const KpiRow = ({ data, showTrends }: KpiRowProps) => {
  const comparisonLabel = showTrends ? formatComparisonLabel(data) : undefined;

  const peakHour = data.peakHours.length > 0
    ? data.peakHours.reduce((max, h) => h.orders > max.orders ? h : max)
    : null;

  const kpis = [
    {
      label: "Total Orders",
      value: data.totalOrders.toLocaleString('en-US'),
      Icon: ShoppingCart,
      change: showTrends ? data.comparison.ordersChange : null,
      detail: undefined as string | undefined,
    },
    {
      label: "Revenue",
      value: formatEuro(data.totalRevenue),
      Icon: TrendingUp,
      change: showTrends ? data.comparison.revenueChange : null,
      detail: undefined as string | undefined,
    },
    {
      label: "Avg Order Value",
      value: formatEuro(data.avgOrderValue),
      Icon: TrendingDown,
      change: showTrends ? data.comparison.avgOrderValueChange ?? null : null,
      detail: undefined as string | undefined,
    },
    {
      label: "Active Customers",
      value: data.newCustomers.toLocaleString('en-US'),
      Icon: Users,
      change: showTrends ? data.comparison.newCustomersChange : null,
      detail: undefined as string | undefined,
    },
    {
      label: "Peak Hour",
      value: peakHour?.label ?? '—',
      Icon: Clock,
      change: null,
      detail: peakHour ? `${peakHour.orders} orders` : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {kpis.map((kpi) => (
        <KpiCard
          key={kpi.label}
          label={kpi.label}
          value={kpi.value}
          Icon={kpi.Icon}
          change={kpi.change}
          comparisonLabel={kpi.change != null ? comparisonLabel : undefined}
          detail={kpi.detail}
        />
      ))}
    </div>
  );
};

export default KpiRow;
