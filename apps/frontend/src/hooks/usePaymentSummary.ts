import { useQuery } from "@tanstack/react-query";
import { getPaymentSummary } from "../lib/api";

export const usePaymentSummary = (
  restaurantId: string | undefined,
  startDate?: string,
  endDate?: string,
  enabled = true,
) => {
  return useQuery({
    queryKey: ["paymentSummary", restaurantId, startDate, endDate],
    queryFn: () => getPaymentSummary(restaurantId!, startDate, endDate),
    enabled: !!restaurantId && enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
};
