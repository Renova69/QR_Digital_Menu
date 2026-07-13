import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addReservationBlackout,
  listReservationBlackouts,
  removeReservationBlackout,
} from "../../lib/api";
import { todayISO } from "./shared";

export interface BlackoutEditorProps {
  restaurantId: string;
}

export function BlackoutEditor({ restaurantId }: BlackoutEditorProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const key = ["reservation-blackouts", restaurantId];
  const { data: blackouts = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listReservationBlackouts(restaurantId),
    enabled: !!restaurantId,
  });

  const add = useMutation({
    mutationFn: () => addReservationBlackout(restaurantId, date, reason),
    onSuccess: () => {
      setDate("");
      setReason("");
      setError(null);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message ?? "Could not add closed day"),
  });

  const remove = useMutation({
    mutationFn: (d: string) => removeReservationBlackout(restaurantId, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  // Prevent selecting a past date in the picker (local date, not UTC).
  const today = todayISO();

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-1.5">
        {isLoading && (
          <span className="text-xs text-gray-400">
            {t("reservations.loading", "Loading…")}
          </span>
        )}
        {!isLoading && blackouts.length === 0 && (
          <span className="text-xs text-gray-400">
            {t("reservations.noBlackouts", "No closed days set.")}
          </span>
        )}
        {blackouts.map((b: { date: string; reason?: string | null }) => (
          <div
            key={b.date}
            className="flex items-center justify-between rounded-lg border px-3 py-1.5"
          >
            <span className="text-sm">
              <strong className="font-medium">{b.date}</strong>
              {b.reason && <span className="text-gray-500"> — {b.reason}</span>}
            </span>
            <button
              onClick={() => remove.mutate(b.date)}
              disabled={remove.isPending}
              className="text-red-400 hover:text-red-700 text-sm"
              aria-label={t("reservations.remove", "Remove")}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          placeholder={t(
            "reservations.blackoutReasonPlaceholder",
            "Reason (optional)",
          )}
          className="flex-1 min-w-[8rem] border rounded-lg px-3 py-1.5 text-sm"
        />
        <button
          onClick={() => date && add.mutate()}
          disabled={!date || add.isPending}
          className="text-sm px-3 py-1.5 rounded-lg bg-white border font-medium disabled:opacity-50"
        >
          {t("reservations.add", "Add")}
        </button>
      </div>
    </div>
  );
}
