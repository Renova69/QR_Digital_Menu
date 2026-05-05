import { useQuery } from '@tanstack/react-query';
import { getAnalytics } from '../lib/api';

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
}

export interface OrderStatusBreakdown {
  status: string;
  count: number;
}

export interface CategoryBreakdown {
  category: string;
  revenue: number;
}

export interface TableMetric {
  table: string;
  orders: number;
  revenue: number;
}

export interface AnalyticsData {
  period: number;
  revenueTrend: RevenueTrendPoint[];
  topItems: TopItem[];
  peakHours: PeakHour[];
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  servedRate: number;
  ordersByStatus: OrderStatusBreakdown[];
  categoryBreakdown: CategoryBreakdown[];
  ordersByTable: TableMetric[];
  comparison: {
    revenueChange: number;
    ordersChange: number;
  };
}

export const useAnalytics = (restaurantId: string | undefined, period: number, startDate?: string, endDate?: string) => {
  return useQuery<AnalyticsData>({
    queryKey: ['analytics', restaurantId, period, startDate, endDate],
    queryFn: () => getAnalytics(restaurantId!, period, startDate, endDate),
    enabled: !!restaurantId,
    staleTime: 0,
    refetchInterval: 30000,   // Silent background polling every 30s
    refetchOnWindowFocus: false,
  });
};
