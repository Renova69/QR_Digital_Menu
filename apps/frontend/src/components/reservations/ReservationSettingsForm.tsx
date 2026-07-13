import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getReservationSettings,
  setReservationServiceHours,
  updateReservationSettings,
} from "../../lib/api";
import { BlackoutEditor } from "./BlackoutEditor";
import { CustomPreferencesEditor } from "./CustomPreferencesEditor";
import { ServiceHoursEditor } from "./ServiceHoursEditor";
import { NumInput, ToggleRow, toHHMM } from "./shared";

export interface ReservationSettingsFormProps {
  restaurantId: string;
}

export function ReservationSettingsForm({
  restaurantId,
}: ReservationSettingsFormProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["reservation-settings", restaurantId],
    queryFn: () => getReservationSettings(restaurantId),
    enabled: !!restaurantId,
  });

  const settings = data?.settings ?? null;
  const serviceHours = useMemo(() => data?.serviceHours ?? [], [data]);
  const [error, setError] = useState<string | null>(null);

  const saveSettings = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      updateReservationSettings(restaurantId, patch),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["reservation-settings", restaurantId],
      }),
    onError: (e: any) =>
      setError(e?.response?.data?.message ?? "Could not save settings"),
  });

  const saveHours = useMutation({
    mutationFn: (
      rows: { weekday: number; openMinute: number; lastSlotMinute: number }[],
    ) => setReservationServiceHours(restaurantId, rows),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["reservation-settings", restaurantId],
      }),
  });

  if (isLoading) {
    return (
      <p className="text-gray-400 text-sm">
        {t("reservations.loading", "Loading…")}
      </p>
    );
  }

  const hoursByDay = new Map<number, { open: string; last: string }>(
    serviceHours.map((h: any) => [
      h.weekday,
      { open: toHHMM(h.openMinute), last: toHHMM(h.lastSlotMinute) },
    ]),
  );

  return (
    <div className="max-w-2xl space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <ToggleRow
          label={t("reservations.enable", "Accept online reservations")}
          checked={!!settings?.enabled}
          onChange={(v) => {
            setError(null);
            saveSettings.mutate({ enabled: v });
          }}
        />
        <p className="text-xs text-gray-500">
          {t("reservations.bookingUrl", "Public booking link")}:{" "}
          <code>/book/{restaurantId}</code>
        </p>
        <ToggleRow
          label={t("reservations.autoConfirm", "Auto-confirm requests")}
          checked={!!settings?.autoConfirm}
          onChange={(v) => saveSettings.mutate({ autoConfirm: v })}
        />
        <ToggleRow
          label={t(
            "reservations.allergenSection",
            "Show menu allergen section",
          )}
          checked={settings?.allergenSectionEnabled ?? true}
          onChange={(v) => saveSettings.mutate({ allergenSectionEnabled: v })}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumInput
            label={t("reservations.maxGuests", "Max total guests")}
            value={settings?.maxTotalGuests ?? 12}
            onCommit={(v) => saveSettings.mutate({ maxTotalGuests: v })}
          />
          <NumInput
            label={t("reservations.leadMinutes", "Min lead (minutes)")}
            value={settings?.minLeadMinutes ?? 60}
            onCommit={(v) => saveSettings.mutate({ minLeadMinutes: v })}
          />
          <NumInput
            label={t("reservations.horizonDays", "Booking horizon (days)")}
            value={settings?.bookingHorizonDays ?? 60}
            onCommit={(v) => saveSettings.mutate({ bookingHorizonDays: v })}
          />
          <NumInput
            label={t("reservations.slotInterval", "Slot interval (min)")}
            value={settings?.slotIntervalMinutes ?? 30}
            onCommit={(v) => saveSettings.mutate({ slotIntervalMinutes: v })}
          />
        </div>

        <div className="pt-2">
          <p className="text-xs font-medium text-gray-600 mb-2">
            {t("reservations.turnoverTitle", "Dining duration (turnover)")}
          </p>
          <div className="grid grid-cols-3 gap-3">
            <NumInput
              label={t("reservations.durationBase", "Base (min)")}
              value={settings?.diningDurationMinutes ?? 90}
              onCommit={(v) =>
                saveSettings.mutate({ diningDurationMinutes: v })
              }
            />
            <NumInput
              label={t("reservations.largeThreshold", "Large party ≥")}
              value={settings?.largePartyThreshold ?? 5}
              onCommit={(v) => saveSettings.mutate({ largePartyThreshold: v })}
            />
            <NumInput
              label={t("reservations.largeDuration", "Large (min)")}
              value={settings?.largePartyDurationMinutes ?? 150}
              onCommit={(v) =>
                saveSettings.mutate({ largePartyDurationMinutes: v })
              }
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {t(
              "reservations.turnoverHelp",
              "Used to show staff when each table is expected to free up.",
            )}
          </p>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h3 className="font-semibold text-sm">
          {t("reservations.serviceHours", "Service hours")}
        </h3>
        <p className="text-xs text-gray-500">
          {t(
            "reservations.serviceHoursHelp",
            "Set opening and last-slot time per day. Leave a day empty to close it.",
          )}
        </p>
        <ServiceHoursEditor
          initial={hoursByDay}
          onSave={(rows) => saveHours.mutate(rows)}
          saving={saveHours.isPending}
        />
      </section>

      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h3 className="font-semibold text-sm">
          {t("reservations.customPrefsTitle", "Custom preference chips")}
        </h3>
        <p className="text-xs text-gray-500">
          {t(
            "reservations.customPrefsHelp",
            "Extra options guests can pick on the booking form (e.g. Swimming pool, Terrace, Kids area).",
          )}
        </p>
        <CustomPreferencesEditor
          initial={settings?.customPreferences ?? []}
          onSave={(labels) =>
            saveSettings.mutate({ customPreferences: labels })
          }
          saving={saveSettings.isPending}
        />
      </section>

      <section className="bg-white rounded-xl shadow-sm p-4 space-y-3">
        <h3 className="font-semibold text-sm">
          {t("reservations.blackoutTitle", "Closed days")}
        </h3>
        <p className="text-xs text-gray-500">
          {t(
            "reservations.blackoutHelp",
            "Block specific dates (holidays, private events). No slots are offered on a closed day.",
          )}
        </p>
        <BlackoutEditor restaurantId={restaurantId} />
      </section>
    </div>
  );
}
