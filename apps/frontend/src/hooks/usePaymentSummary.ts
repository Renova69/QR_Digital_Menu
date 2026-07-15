import { useQuery } from "@tanstack/react-query";
import { getPaymentSummary } from "../lib/api";

export const usePaymentSummary = (
  restaurantId: string | undefined,
  period: number,
  startDate?: string,
  endDate?: string,
  enabled = true,
) => {
  return useQuery({
    queryKey: ["paymentSummary", restaurantId, period, startDate, endDate],
    queryFn: () => getPaymentSummary(restaurantId!, period, startDate, endDate),
    enabled: !!restaurantId && enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
};
