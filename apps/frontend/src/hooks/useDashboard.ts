import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { Order } from '../types';

interface DashboardSummary {
  ordersToday: number;
  totalRevenue: number;
  openAssistanceRequests: number;
  recentOrders: Order[];
}

const fetchDashboardSummary = async (restaurantId: string): Promise<DashboardSummary> => {
  const { data } = await api.get<DashboardSummary>(`/dashboard/summary?restaurantId=${restaurantId}`);
  return data;
};

export const useDashboard = (restaurantId: string | undefined) => {
  return useQuery({
    queryKey: ['dashboardSummary', restaurantId],
    queryFn: () => fetchDashboardSummary(restaurantId!),
    enabled: !!restaurantId,
  });
};
