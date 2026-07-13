import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useRestaurantContext } from "../../context/RestaurantContext";
import { listReservations } from "../../lib/api";
import type { StaffReservation } from "../../types/reservations";
import { Users } from "lucide-react";
import { dayInputValue, dayKey, statusDotClass, time24 } from "./shared";

export interface UpcomingSummaryProps {
  restaurantId: string;
  onPick: (dateInputValue: string) => void;
}

export function UpcomingSummary({
  restaurantId,
  onPick,
}: UpcomingSummaryProps) {
  const { t, i18n } = useTranslation();
  const { activeRestaurant } = useRestaurantContext();
  const tz = activeRestaurant?.timezone;
  const [showAll, setShowAll] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["reservations-upcoming", restaurantId, showAll],
    // "showAll" drops the upcoming filter → every reservation (incl. past,
    // declined, cancelled), ordered by time.
    queryFn: () =>
      listReservations(restaurantId, showAll ? {} : { upcoming: "true" }),
    refetchInterval: 15000,
    enabled: !!restaurantId,
  });

  const groups = useMemo(() => {
    const map = new Map<string, { input: string; rows: StaffReservation[] }>();
    for (const r of data as StaffReservation[]) {
      const key = dayKey(r.startsAt, tz, i18n.language);
      if (!map.has(key))
        map.set(key, { input: dayInputValue(r.startsAt, tz), rows: [] });
      map.get(key)!.rows.push(r);
    }
    return [...map.entries()];
  }, [data, tz, i18n.language]);

  return (
    <div className="bg-white rounded-xl shadow-sm border p-3 lg:sticky lg:top-4">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold">
          {showAll
            ? t("reservations.allBookings", "All bookings")
            : t("reservations.upcoming", "Upcoming")}
        </h3>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-indigo-600 hover:underline"
        >
          {showAll
            ? t("reservations.showUpcoming", "Upcoming only")
            : t("reservations.showAll", "Show all")}
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-3">
        {showAll
          ? t(
              "reservations.allHelp",
              "Every reservation incl. past, declined and cancelled.",
            )
          : t(
              "reservations.upcomingHelp",
              "Pending, confirmed & arrived, from today, by day.",
            )}
      </p>

      {isLoading ? (
        <p className="text-xs text-gray-400">
          {t("reservations.loading", "Loading…")}
        </p>
      ) : groups.length === 0 ? (
        <p className="text-xs text-gray-400">
          {showAll
            ? t("reservations.noBookings", "No reservations yet.")
            : t("reservations.noUpcoming", "No upcoming reservations.")}
        </p>
      ) : (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          {groups.map(([label, { input, rows }]) => (
            <div key={label}>
              <button
                onClick={() => onPick(input)}
                className="w-full text-left text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 hover:text-indigo-600"
              >
                {label} · {rows.length}
              </button>
              <div className="divide-y">
                {rows.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onPick(input)}
                    className="w-full flex items-center gap-2 py-1.5 text-left hover:bg-gray-50 rounded"
                  >
                    <span className="text-xs font-mono w-10 shrink-0">
                      {time24(r.startsAt, tz)}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass(
                        r.status,
                      )}`}
                      title={t(`reservations.status.${r.status}`, r.status)}
                    />
                    <span
                      className={`text-sm truncate flex-1 ${
                        r.status === "DECLINED" ||
                        r.status === "CANCELLED" ||
                        r.status === "NO_SHOW"
                          ? "text-gray-400 line-through"
                          : ""
                      }`}
                    >
                      {r.guestName}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0 flex items-center gap-0.5">
                      {r.totalGuests}
                      <Users className="w-3 h-3" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
