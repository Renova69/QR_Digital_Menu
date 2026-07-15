import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Users,
  Clock,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import KpiCard from "../../../components/dashboard/KpiCard";
import type { AnalyticsData } from "../../../hooks/useAnalytics";
import { formatEuro } from "../../../lib/currency";

interface KpiRowProps {
  data: AnalyticsData;
  showTrends: boolean;
}

const formatDateShort = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
  });

const formatComparisonLabel = (
  data: AnalyticsData,
  fallback: string,
  locale: string,
) => {
  if (data.prevPeriodStart && data.prevPeriodEnd) {
    return `${formatDateShort(data.prevPeriodStart, locale)} - ${formatDateShort(data.prevPeriodEnd, locale)}`;
  }
  return fallback;
};

const KpiRow = ({ data, showTrends }: KpiRowProps) => {
  const { t, i18n } = useTranslation();
  const comparisonLabel = showTrends
    ? formatComparisonLabel(data, t("dashboard.prevPeriod"), i18n.language)
    : undefined;
  const peakHours = data.peakHours ?? [];
  const peakHour =
    peakHours.length > 0
      ? peakHours.reduce((max, hour) => (hour.orders > max.orders ? hour : max))
      : null;

  const kpis = [
    {
      label: t("dashboard.totalOrders"),
      value: data.totalOrders.toLocaleString(i18n.language),
      Icon: ShoppingCart,
      change: showTrends ? data.comparison.ordersChange : null,
      detail: undefined as string | undefined,
    },
    {
      label: t("dashboard.totalRevenue"),
      value: formatEuro(data.totalRevenue),
      Icon: TrendingUp,
      change: showTrends ? data.comparison.revenueChange : null,
      detail: undefined as string | undefined,
    },
    {
      label: t("dashboard.avgOrderValue"),
      value: formatEuro(data.avgOrderValue),
      Icon: TrendingDown,
      change: showTrends ? (data.comparison.avgOrderValueChange ?? null) : null,
      detail: undefined as string | undefined,
    },
    {
      label: t("dashboard.activeCustomers"),
      value: data.activeCustomers.toLocaleString(i18n.language),
      Icon: Users,
      change: showTrends ? data.comparison.activeCustomersChange : null,
      detail: undefined as string | undefined,
    },
  ];

  if (showTrends) {
    kpis.push({
      label: t("dashboard.peakHour"),
      value: peakHour?.label ?? t("dashboard.notAvailable", "--"),
      Icon: Clock,
      change: null,
      detail: peakHour
        ? t("dashboard.ordersCount", { count: peakHour.orders })
        : undefined,
    });
  }

  return (
    <div
      className={`grid grid-cols-2 gap-4 ${showTrends ? "lg:grid-cols-5" : "lg:grid-cols-4"}`}
    >
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
