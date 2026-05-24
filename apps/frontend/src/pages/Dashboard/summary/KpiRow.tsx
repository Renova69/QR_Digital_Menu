import { TrendingUp, DollarSign, QrCode, ShoppingCart, Users } from "lucide-react";
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

  const kpis = [
    {
      label: "Total Orders",
      value: data.totalOrders.toLocaleString('en-US'),
      Icon: ShoppingCart,
      change: showTrends ? data.comparison.ordersChange : null,
    },
    {
      label: "Revenue",
      value: formatEuro(data.totalRevenue),
      Icon: DollarSign,
      change: showTrends ? data.comparison.revenueChange : null,
    },
    {
      label: "QR Scans",
      value: data.totalOrders.toLocaleString('en-US'),
      Icon: QrCode,
      change: null,
    },
    {
      label: "Average Order Value",
      value: formatEuro(data.avgOrderValue),
      Icon: TrendingUp,
      change: showTrends ? data.comparison.avgOrderValueChange ?? null : null,
    },
    {
      label: "New Customers",
      value: data.newCustomers.toLocaleString('en-US'),
      Icon: Users,
      change: showTrends ? data.comparison.newCustomersChange : null,
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
          comparisonLabel={comparisonLabel}
        />
      ))}
    </div>
  );
};

export default KpiRow;
