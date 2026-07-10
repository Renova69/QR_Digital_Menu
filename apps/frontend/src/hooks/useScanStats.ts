import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import RestaurantContext, {
  type RestaurantContextType,
} from "../context/RestaurantContext";
import { getScanStats, type ScanStats } from "../lib/api";

export function useScanStats(): {
  data: ScanStats | undefined;
  isLoading: boolean;
} {
  const ctx = useContext(RestaurantContext) as
    | RestaurantContextType
    | undefined;
  const restaurantId = ctx?.activeRestaurant?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["scan-stats", restaurantId],
    queryFn: () => getScanStats(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });

  return { data, isLoading };
}
