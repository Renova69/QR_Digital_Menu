import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRestaurantContext } from "../../context/RestaurantContext";
import { useSocket } from "../../context/SocketContext";
import {
  listReservations,
  reservationAction,
  getReservationSettings,
  updateReservationSettings,
  setReservationServiceHours,
  createManualReservation,
  updateReservationInternal,
} from "../../lib/api";
import {
  STAFF_PATRON_TAGS,
  type ReservationAction,
  type StaffReservation,
} from "../../types/reservations";
import { Button } from "../../components/ui/button";

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-green-100 text-green-800",
  DECLINED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-600",
  NO_SHOW: "bg-red-100 text-red-700",
  ARRIVED: "bg-indigo-100 text-indigo-800",
};

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

// 24-hour time options every 15 minutes (00:00 … 23:45). Native <input
// type="time"> renders 12h/24h per OS locale, so use an explicit select.
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    out.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return out;
})();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function toHHMM(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function fromHHMM(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
// Always render in 24-hour format regardless of browser locale.
function format24h(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const ReservationsView = () => {
  const { t } = useTranslation();
  const { activeRestaurant } = useRestaurantContext();
  const restaurantId = activeRestaurant?.id ?? "";
  const [subTab, setSubTab] = useState<"list" | "settings">("list");

  return (
    <div className="p-4 space-y-4">
      <div className="flex gap-2">
        <TabButton
          active={subTab === "list"}
          onClick={() => setSubTab("list")}
          label={t("reservations.tabList", "Reservations")}
        />
        <TabButton
          active={subTab === "settings"}
          onClick={() => setSubTab("settings")}
          label={t("reservations.tabSettings", "Settings")}
        />
      </div>
      {!restaurantId ? null : subTab === "list" ? (
        <ReservationList restaurantId={restaurantId} />
      ) : (
        <ReservationSettingsForm restaurantId={restaurantId} />
      )}
    </div>
  );
};

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm rounded-lg font-medium ${
        active ? "bg-indigo-600 text-white" : "bg-white border text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

function ReservationList({ restaurantId }: { restaurantId: string }) {
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
                {s}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowManual((v) => !v)}
            className="ml-auto text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-medium"
          >
            {showManual
              ? t("reservations.close", "Close")
              : t("reservations.newBooking", "+ New booking")}
          </button>
        </div>

        {showManual && (
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

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}
function dayInputValue(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
function time24(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
function statusDotClass(status: string): string {
  switch (status) {
    case "CONFIRMED":
      return "bg-green-500";
    case "ARRIVED":
      return "bg-indigo-500";
    case "PENDING":
      return "bg-amber-500";
    default: // DECLINED / CANCELLED / NO_SHOW
      return "bg-gray-400";
  }
}

function UpcomingSummary({
  restaurantId,
  onPick,
}: {
  restaurantId: string;
  onPick: (dateInputValue: string) => void;
}) {
  const { t } = useTranslation();
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
      const key = dayKey(r.startsAt);
      if (!map.has(key))
        map.set(key, { input: dayInputValue(r.startsAt), rows: [] });
      map.get(key)!.rows.push(r);
    }
    return [...map.entries()];
  }, [data]);

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
                      {time24(r.startsAt)}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass(
                        r.status,
                      )}`}
                      title={r.status}
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
                    <span className="text-xs text-gray-400 shrink-0">
                      {r.totalGuests}👥
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

function ManualBookingForm({
  restaurantId,
  onDone,
}: {
  restaurantId: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [when, setWhen] = useState("");
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      createManualReservation(restaurantId, {
        guestName: name.trim(),
        guestPhone: phone.trim(),
        guestEmail: email.trim() || undefined,
        startsAt: new Date(when).toISOString(),
        adultsCount: adults,
        childrenCount: children,
        customerNotes: notes.trim() || undefined,
        staffTags: tags,
      }),
    onSuccess: onDone,
    onError: (e: any) =>
      setError(e?.response?.data?.message ?? "Could not create the booking"),
  });

  const canSubmit =
    name.trim().length > 0 && phone.trim().length > 0 && !!when && adults >= 1;

  return (
    <div className="bg-gray-50 border rounded-xl p-3 space-y-2">
      <p className="text-sm font-semibold">
        {t("reservations.manualTitle", "New manual booking")}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder={t("booking.name", "Name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        <input
          placeholder={t("booking.phone", "Mobile phone")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        <input
          placeholder={t("booking.email", "Email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm"
        />
        <label className="text-xs text-gray-600 flex items-center gap-2">
          {t("booking.adults", "Adults")}
          <input
            type="number"
            min={1}
            max={50}
            value={adults}
            onChange={(e) => setAdults(Number(e.target.value) || 1)}
            className="w-16 border rounded px-2 py-1"
          />
        </label>
        <label className="text-xs text-gray-600 flex items-center gap-2">
          {t("booking.children", "Children")}
          <input
            type="number"
            min={0}
            max={50}
            value={children}
            onChange={(e) => setChildren(Number(e.target.value) || 0)}
            className="w-16 border rounded px-2 py-1"
          />
        </label>
      </div>
      <textarea
        placeholder={t("booking.notes", "Notes")}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        className="w-full border rounded-lg px-3 py-1.5 text-sm"
      />
      <div className="flex flex-wrap gap-1.5">
        {STAFF_PATRON_TAGS.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() =>
              setTags((p) =>
                p.includes(tag) ? p.filter((x) => x !== tag) : [...p, tag],
              )
            }
            className={`text-xs rounded-full px-2.5 py-1 border ${
              tags.includes(tag)
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-700"
            }`}
          >
            {tag}
          </button>
        ))}
      </div>
      <Button
        onClick={() => {
          setError(null);
          create.mutate();
        }}
        disabled={!canSubmit || create.isPending}
      >
        {t("reservations.createBooking", "Create booking")}
      </Button>
    </div>
  );
}

function ReservationCard({
  reservation: r,
  restaurantId,
  onAction,
  busy,
}: {
  reservation: StaffReservation;
  restaurantId: string;
  onAction: (a: ReservationAction) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const started = new Date(r.startsAt).getTime() <= Date.now();
  const time = format24h(r.startsAt);

  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState<string[]>(r.staffTags ?? []);
  const [notes, setNotes] = useState(r.internalNotes ?? "");

  const saveInternal = useMutation({
    mutationFn: () =>
      updateReservationInternal(r.id, restaurantId, {
        internalNotes: notes,
        staffTags: tags,
      }),
    onSuccess: () => {
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["reservations", restaurantId] });
      qc.invalidateQueries({
        queryKey: ["reservations-upcoming", restaurantId],
      });
    },
  });

  const toggleTag = (tag: string) =>
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    );

  return (
    <div className="bg-white rounded-xl shadow-sm p-3 border">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{r.guestName}</p>
          <p className="text-xs text-gray-500">{time}</p>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[r.status] ?? ""}`}
        >
          {r.status}
        </span>
      </div>

      <div className="text-xs text-gray-600 mt-1 flex flex-wrap gap-x-3 gap-y-1">
        <span>
          👥 {r.adultsCount}
          {r.childrenCount > 0 ? ` + ${r.childrenCount} 🧒` : ""} (
          {r.totalGuests})
        </span>
        <a href={`tel:${r.guestPhone}`} className="text-indigo-600">
          📞 {r.guestPhone}
        </a>
        {r.guestEmail && <span>✉️ {r.guestEmail}</span>}
        <span className="font-mono text-gray-400">{r.referenceCode}</span>
      </div>

      {(r.customerPreferences.length > 0 ||
        r.allergyNotes ||
        r.staffTags.length > 0 ||
        r.marketingConsent) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {r.customerPreferences.map((p) => (
            <Badge key={p} tone="amber" label={p} />
          ))}
          {r.allergyNotes && <Badge tone="red" label={`⚠ ${r.allergyNotes}`} />}
          {r.staffTags.map((tag) => (
            <Badge key={tag} tone="indigo" label={tag} />
          ))}
          {r.marketingConsent && <Badge tone="green" label="📣 Marketing OK" />}
        </div>
      )}

      {r.customerNotes && (
        <p className="text-xs text-gray-600 mt-2 italic">“{r.customerNotes}”</p>
      )}
      {r.internalNotes && (
        <p className="text-xs text-gray-500 mt-1">🔒 {r.internalNotes}</p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        {r.status === "PENDING" && (
          <>
            <ActionBtn
              onClick={() => onAction("ACCEPT")}
              disabled={busy}
              label={t("reservations.accept", "Accept")}
              tone="primary"
            />
            <ActionBtn
              onClick={() => onAction("DECLINE")}
              disabled={busy}
              label={t("reservations.decline", "Decline")}
            />
          </>
        )}
        {r.status === "CONFIRMED" && (
          <>
            <ActionBtn
              onClick={() => onAction("ARRIVED")}
              disabled={busy}
              label={t("reservations.arrived", "Arrived")}
              tone="primary"
            />
            {started && (
              <ActionBtn
                onClick={() => onAction("NO_SHOW")}
                disabled={busy}
                label={t("reservations.noShow", "No-show")}
              />
            )}
            <ActionBtn
              onClick={() => onAction("CANCEL")}
              disabled={busy}
              label={t("reservations.cancel", "Cancel")}
            />
          </>
        )}
        <ActionBtn
          onClick={() => setEditing((v) => !v)}
          disabled={busy}
          label={
            editing
              ? t("reservations.close", "Close")
              : t("reservations.editTags", "Tags / notes")
          }
        />
      </div>

      {editing && (
        <div className="mt-3 border-t pt-3 space-y-2">
          <p className="text-xs font-medium text-gray-600">
            {t("reservations.patronTags", "Patron tags (staff only)")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STAFF_PATRON_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`text-xs rounded-full px-2.5 py-1 border ${
                  tags.includes(tag)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-700"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={t(
              "reservations.internalNotesPlaceholder",
              "Internal notes (not visible to the guest)",
            )}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
          <ActionBtn
            onClick={() => saveInternal.mutate()}
            disabled={saveInternal.isPending}
            label={t("reservations.save", "Save")}
            tone="primary"
          />
        </div>
      )}
    </div>
  );
}

function Badge({ tone, label }: { tone: string; label: string }) {
  const tones: Record<string, string> = {
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    indigo: "bg-indigo-100 text-indigo-800",
    green: "bg-green-100 text-green-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${tones[tone] ?? ""}`}>
      {label}
    </span>
  );
}

function ActionBtn({
  onClick,
  disabled,
  label,
  tone,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  tone?: "primary";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 ${
        tone === "primary"
          ? "bg-indigo-600 text-white"
          : "bg-white border text-gray-700"
      }`}
    >
      {label}
    </button>
  );
}

function ReservationSettingsForm({ restaurantId }: { restaurantId: string }) {
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
    </div>
  );
}

function CustomPreferencesEditor({
  initial,
  onSave,
  saving,
}: {
  initial: string[];
  onSave: (labels: string[]) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [labels, setLabels] = useState<string[]>(initial);
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (labels.some((l) => l.toLowerCase() === v.toLowerCase())) {
      setInput("");
      return;
    }
    setLabels((p) => [...p, v]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {labels.length === 0 && (
          <span className="text-xs text-gray-400">
            {t("reservations.noCustomPrefs", "No custom chips yet.")}
          </span>
        )}
        {labels.map((l) => (
          <span
            key={l}
            className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-1"
          >
            {l}
            <button
              onClick={() => setLabels((p) => p.filter((x) => x !== l))}
              className="text-indigo-400 hover:text-indigo-700"
              aria-label="remove"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          maxLength={40}
          placeholder={t("reservations.addChipPlaceholder", "Add a chip…")}
          className="flex-1 border rounded-lg px-3 py-1.5 text-sm"
        />
        <button
          onClick={add}
          className="text-sm px-3 py-1.5 rounded-lg bg-white border font-medium"
        >
          {t("reservations.add", "Add")}
        </button>
      </div>
      <Button onClick={() => onSave(labels)} disabled={saving} className="mt-1">
        {t("reservations.savePrefs", "Save chips")}
      </Button>
    </div>
  );
}

function ServiceHoursEditor({
  initial,
  onSave,
  saving,
}: {
  initial: Map<number, { open: string; last: string }>;
  onSave: (
    rows: { weekday: number; openMinute: number; lastSlotMinute: number }[],
  ) => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [rows, setRows] = useState<
    Record<number, { open: string; last: string }>
  >(() => {
    const r: Record<number, { open: string; last: string }> = {};
    for (const d of WEEKDAYS) r[d] = initial.get(d) ?? { open: "", last: "" };
    return r;
  });

  const save = () => {
    const payload = WEEKDAYS.filter((d) => rows[d].open && rows[d].last).map(
      (d) => ({
        weekday: d,
        openMinute: fromHHMM(rows[d].open),
        lastSlotMinute: fromHHMM(rows[d].last),
      }),
    );
    onSave(payload);
  };

  return (
    <div className="space-y-2">
      {WEEKDAYS.map((d) => (
        <div key={d} className="flex items-center gap-2 text-sm">
          <span className="w-10 text-gray-600">{dayNames[d]}</span>
          <TimeSelect
            value={rows[d].open}
            onChange={(v) =>
              setRows((p) => ({ ...p, [d]: { ...p[d], open: v } }))
            }
          />
          <span className="text-gray-400">→</span>
          <TimeSelect
            value={rows[d].last}
            onChange={(v) =>
              setRows((p) => ({ ...p, [d]: { ...p[d], last: v } }))
            }
          />
        </div>
      ))}
      <Button onClick={save} disabled={saving} className="mt-2">
        {t("reservations.saveHours", "Save service hours")}
      </Button>
    </div>
  );
}

function TimeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  // Include a non-standard stored value so it doesn't silently blank out.
  const options =
    value && !TIME_OPTIONS.includes(value)
      ? [value, ...TIME_OPTIONS]
      : TIME_OPTIONS;
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border rounded px-2 py-1"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between">
      <span className="text-sm">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}

function NumInput({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (v: number) => void;
}) {
  const [local, setLocal] = useState(String(value));
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = Number(local);
          if (Number.isFinite(n) && n !== value) onCommit(n);
        }}
        className="w-full border rounded-lg px-3 py-1.5 text-sm"
      />
    </div>
  );
}

export default ReservationsView;
