import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocket } from "../../context/SocketContext";
import { listReservations, reservationAction } from "../../lib/api";
import type {
  ReservationAction,
  StaffReservation,
} from "../../types/reservations";
import { AnalyticsPanel } from "./AnalyticsPanel";
import { ManualBookingForm } from "./ManualBookingForm";
import { ReservationCard } from "./ReservationCard";
import { UpcomingSummary } from "./UpcomingSummary";
import { todayISO } from "./shared";

export interface ReservationListProps {
  restaurantId: string;
  canCreate: boolean;
}

export function ReservationList({
  restaurantId,
  canCreate,
}: ReservationListProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayISO());
  const [status, setStatus] = useState("");
  const [showManual, setShowManual] = useState(false);

  const { data: reservations = [], isLoading } = useQuery({
    queryKey: ["reservations", restaurantId, date, status],
    queryFn: () =>
      listReservations(restaurantId, {
        date: date || undefined,
        status: status || undefined,
      }),
    refetchInterval: 15000,
    enabled: !!restaurantId,
  });

  const actionMutation = useMutation({
    mutationFn: (v: { id: string; action: ReservationAction }) =>
      reservationAction(v.id, restaurantId, v.action),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["reservations", restaurantId] }),
  });

  // Live refresh: the backend emits to the private restaurant room the socket
  // already joins. Invalidate on create/update so a new request or a status
  // change appears instantly (the 15s poll above is just a fallback).
  const { socket, isConnected } = useSocket();
  useEffect(() => {
    if (!socket || !isConnected || !restaurantId) return;
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ["reservations", restaurantId] });
      qc.invalidateQueries({
        queryKey: ["reservations-upcoming", restaurantId],
      });
      qc.invalidateQueries({
        queryKey: ["reservation-analytics", restaurantId],
      });
    };
    socket.on("reservation:created", refresh);
    socket.on("reservation:updated", refresh);
    return () => {
      socket.off("reservation:created", refresh);
      socket.off("reservation:updated", refresh);
    };
  }, [socket, isConnected, restaurantId, qc]);

  return (
    <div className="lg:grid lg:grid-cols-3 lg:gap-4">
      <div className="lg:col-span-2 space-y-3">
        {canCreate && <AnalyticsPanel restaurantId={restaurantId} />}
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          >
            <option value="">
              {t("reservations.allStatuses", "All statuses")}
            </option>
            {[
              "PENDING",
              "CONFIRMED",
              "ARRIVED",
              "NO_SHOW",
              "DECLINED",
              "CANCELLED",
            ].map((s) => (
              <option key={s} value={s}>
                {t(`reservations.status.${s}`, s)}
              </option>
            ))}
          </select>
          {canCreate && (
            <button
              onClick={() => setShowManual((v) => !v)}
              className="ml-auto text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium"
            >
              {showManual
                ? t("reservations.close", "Close")
                : t("reservations.newBooking", "+ New booking")}
            </button>
          )}
        </div>

        {canCreate && showManual && (
          <ManualBookingForm
            restaurantId={restaurantId}
            onDone={() => {
              setShowManual(false);
              qc.invalidateQueries({
                queryKey: ["reservations", restaurantId],
              });
              qc.invalidateQueries({
                queryKey: ["reservations-upcoming", restaurantId],
              });
            }}
          />
        )}

        {isLoading ? (
          <p className="text-gray-400 text-sm">
            {t("reservations.loading", "Loading…")}
          </p>
        ) : reservations.length === 0 ? (
          <p className="text-gray-400 text-sm">
            {t("reservations.empty", "No reservations for this filter.")}
          </p>
        ) : (
          <div className="space-y-2">
            {(reservations as StaffReservation[]).map((r) => (
              <ReservationCard
                key={r.id}
                reservation={r}
                restaurantId={restaurantId}
                onAction={(action) =>
                  actionMutation.mutate({ id: r.id, action })
                }
                busy={actionMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 lg:mt-0 lg:col-span-1">
        <UpcomingSummary
          restaurantId={restaurantId}
          onPick={(d) => {
            setDate(d);
            setStatus("");
          }}
        />
      </div>
    </div>
  );
}
