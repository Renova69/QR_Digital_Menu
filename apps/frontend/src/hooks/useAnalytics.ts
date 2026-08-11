import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getAnalytics, getDailyTarget } from "../lib/api";

export interface RevenueTrendPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopItem {
  name: string;
  quantity: number;
  revenue: number;
}

export interface PeakHour {
  hour: number;
  label: string;
  orders: number;
  revenue: number;
}

export interface PaymentMethodTotal {
  method: string;
  amount: number;
}

export interface OrderStatusBreakdown {
  status: string;
  count: number;
}

export interface CategoryBreakdown {
  category: string;
  categoryType?: "CATEGORY" | "HISTORICAL_MENU" | "UNCATEGORIZED";
  revenue: number;
}

export interface TableMetric {
  table: string;
  orders: number;
  revenue: number;
}

// ── New analytics types (Phase B) ──────────────────────────────────────────

export interface MenuProfitabilityItem {
  menuItemId: string;
  name: string;
  quantity: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number;
  quadrant: "Star" | "Plowhorse" | "Puzzle" | "Dog";
}

export interface MenuProfitabilitySummary {
  totalCost: number;
  totalProfit: number;
  overallMargin: number;
  missingCostItems: number;
}

export interface StaffPerformanceRow {
  staffUserId: string;
  staffName: string;
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  posOrders: number;
  qrOrders: number;
}

export interface CustomerMetric {
  customerPhone: string;
  customerName: string;
  totalSpend: number;
  visitCount: number;
  avgSpendPerVisit: number;
  daysSinceLastVisit: number;
}

export interface CustomerMetricsData {
  topCustomers: CustomerMetric[];
  churnRiskCount: number;
  churnRiskBreakdown: { "30d": number; "60d": number; "90d+": number };
  averageClv: number;
}

export interface KitchenHourlyAvg {
  hour: number;
  label: string;
  avgPrepMinutes: number;
  orderCount: number;
}

export interface KitchenZoneAvg {
  zone: string;
  avgPrepMinutes: number;
  orderCount: number;
}

export interface KitchenEfficiencyData {
  overallAvgPrepMinutes: number;
  totalCompletedOrders: number;
  hourlyAverages: KitchenHourlyAvg[];
  zoneAverages: KitchenZoneAvg[];
}

export interface CancelItemRow {
  menuItemId: string;
  itemName: string;
  totalQty: number;
  canceledQty: number;
  cancelRate: number;
}

export interface CancelHourRow {
  hour: number;
  label: string;
  totalOrders: number;
  canceledOrders: number;
  cancelRate: number;
}

export interface CancelAnalyticsData {
  totalCanceledOrders: number;
  revenueLost: number;
  cancelRateByItem: CancelItemRow[];
  cancelRateByHour: CancelHourRow[];
}

export interface TableTurnoverRow {
  tableId: string;
  tableName: string;
  sessionCount: number;
  avgDurationMinutes: number;
  estimatedTurnsPer24Hours: number;
  totalRevenue: number;
  revenuePerOccupiedHour: number;
}

export interface GrossProfitData {
  netSales: number;
  estimatedCOGS: number;
  grossProfit: number;
  grossMargin: number;
  missingCostItems: number;
}

export interface DailyTargetData {
  target: number;
  actual: number;
}

export interface CloseoutReport {
  date: string;
  revenueByMethod: { method: string; amount: number }[];
  totalCollected: number;
  totalTips: number;
  orderedRevenue: number;
  discountPointsRedeemed: number;
  refundedAmount: number;
  canceledRevenue: number;
  netRevenue: number;
  totalOrderCount: number;
  canceledOrderCount: number;
}

export interface AnalyticsData {
  period: number;
  revenueTrend: RevenueTrendPoint[];
  topItems: TopItem[];
  peakHours: PeakHour[];
  totalRevenue: number;
  collectedRevenue: number;
  refundedAmount: number;
  paymentsByMethod: PaymentMethodTotal[];
  totalOrders: number;
  activeCustomers: number;
  avgOrderValue: number;
  completionRate: number;
  repeatCustomerRate: number;
  ordersByStatus: OrderStatusBreakdown[];
  categoryBreakdown: CategoryBreakdown[];
  ordersByTable: TableMetric[];
  comparison: {
    revenueChange: number;
    ordersChange: number;
    activeCustomersChange: number;
    avgOrderValueChange: number;
  };
  prevPeriodStart?: string;
  prevPeriodEnd?: string;
  periodStart?: string;
  periodEnd?: string;
  // Phase B: new analytics features (PRO+)
  staffPerformance?: StaffPerformanceRow[];
  customerMetrics?: CustomerMetricsData;
  kitchenEfficiency?: KitchenEfficiencyData;
  cancelAnalytics?: CancelAnalyticsData;
  tableTurnover?: TableTurnoverRow[];
  menuProfitability?: {
    items: MenuProfitabilityItem[];
    summary: MenuProfitabilitySummary;
  };
  grossProfit?: GrossProfitData;
}

export const useAnalytics = (
  restaurantId: string | undefined,
  period: number,
  startDate?: string,
  endDate?: string,
  enabled = true,
  scope: "basic" | "full" = "full",
) => {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage ?? i18n.language ?? "en")
    .toLowerCase()
    .split("-")[0];

  return useQuery<AnalyticsData>({
    queryKey: [
      "analytics",
      restaurantId,
      period,
      startDate,
      endDate,
      scope,
      language,
    ],
    queryFn: () =>
      getAnalytics(restaurantId!, period, startDate, endDate, language),
    enabled: !!restaurantId && enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
};

/**
 * Today's revenue goal vs. non-canceled ordered revenue. Backend computes both
 * server-side ({ target, actual }) so the card is self-contained. Gated at
 * ANALYTICS_BASIC (all tiers) — same tier as the summary KPIs it sits beside.
 */
export const useDailyTarget = (
  restaurantId: string | undefined,
  enabled = true,
) => {
  return useQuery<DailyTargetData>({
    queryKey: ["dailyTarget", restaurantId],
    queryFn: () => getDailyTarget(restaurantId!),
    enabled: !!restaurantId && enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
  });
};
