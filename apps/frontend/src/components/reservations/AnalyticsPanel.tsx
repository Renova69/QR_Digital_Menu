import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getReservationAnalytics } from "../../lib/api";
import { StatCard } from "./shared";

export interface ReservationAnalytics {
  windowDays: number;
  total: number;
  thisWeek: number;
  noShows: number;
  avgPartySize: number;
  statusCounts: Record<string, number>;
  popularHours: { hour: number; label: string; count: number }[];
}

export interface AnalyticsPanelProps {
  restaurantId: string;
}

export function AnalyticsPanel({ restaurantId }: AnalyticsPanelProps) {
  const { t } = useTranslation();
  const { data } = useQuery<ReservationAnalytics>({
    queryKey: ["reservation-analytics", restaurantId],
    queryFn: () => getReservationAnalytics(restaurantId),
    enabled: !!restaurantId,
    refetchInterval: 60000,
  });
  if (!data) return null;

  const popular =
    data.popularHours.length > 0
      ? data.popularHours.map((h) => h.label).join(", ")
      : "—";

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <StatCard
        label={t("reservations.statThisWeek", "This week")}
        value={String(data.thisWeek)}
      />
      <StatCard
        label={t("reservations.stat30d", "Last 30 days")}
        value={String(data.total)}
      />
      <StatCard
        label={t("reservations.statNoShows", "No-shows (30d)")}
        value={String(data.noShows)}
        tone={data.noShows > 0 ? "red" : "default"}
      />
      <StatCard
        label={t("reservations.statAvgParty", "Avg party")}
        value={data.avgPartySize ? data.avgPartySize.toFixed(1) : "—"}
      />
      <div className="col-span-2 sm:col-span-4 rounded-xl bg-white border shadow-sm px-3 py-2 text-xs text-gray-600">
        <span className="font-medium text-gray-700">
          {t("reservations.statPopular", "Busiest times")}:
        </span>{" "}
        {popular}
      </div>
    </div>
  );
}
