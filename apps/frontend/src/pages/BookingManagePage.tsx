import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getManageReservation,
  getReservationConfig,
  getReservationAvailability,
  cancelManageReservation,
  modifyManageReservation,
} from "../lib/api";
import { getApiError } from "../lib/apiError";
import type {
  AvailabilitySlot,
  ReservationPublicConfig,
} from "../types/reservations";
import {
  getStoredPublicTheme,
  hexToRgba,
  PublicBrandMode,
  resolvePublicPalette,
} from "../lib/publicTheme";
import { useReservationRealtime } from "../hooks/useReservationRealtime";

interface ManageReservation {
  referenceCode: string;
  status: string;
  startsAt: string;
  guestName: string;
  adultsCount: number;
  childrenCount: number;
  totalGuests: number;
  preferredZone: string | null;
  canModify: boolean;
  canCancel: boolean;
  policy: {
    maxTotalGuests: number;
    slotIntervalMinutes: number;
    minLeadMinutes: number;
    bookingHorizonDays: number;
  };
}

function localDateISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const BookingManagePage = () => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const restaurantId = params.get("r") ?? "";
  const requestedLanguage = params.get("lang")?.split(/[-_]/)[0] ?? "";
  const tokenFromUrl = hashParams.get("token") ?? params.get("token") ?? "";
  // Capture token ONCE on mount (useState initializer runs only on the first
  // render). sessionStorage is already scoped to the browser tab/session and
  // auto-clears on close, so manual cleanup is unnecessary and would break
  // page refreshes or React re-mounts (StrictMode, router transitions, etc.).
  const [token] = useState(
    () => tokenFromUrl || sessionStorage.getItem("manage_token") || "",
  );

  const [config, setConfig] = useState<ReservationPublicConfig | null>(null);
  const [theme, setTheme] = useState<PublicBrandMode>("light");
  const [reservation, setReservation] = useState<ManageReservation | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modify state
  const [editing, setEditing] = useState(false);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [date, setDate] = useState(localDateISO());
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const total = adults + children;
  const maxParty = reservation?.policy?.maxTotalGuests ?? 12;

  useEffect(() => {
    if (!tokenFromUrl) return;
    sessionStorage.setItem("manage_token", tokenFromUrl);
    const cleanSearch = new URLSearchParams(location.search);
    cleanSearch.delete("token");
    const search = cleanSearch.toString();

    const cleanHash = new URLSearchParams(location.hash.slice(1));
    cleanHash.delete("token");
    const hash = cleanHash.toString();

    void navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
        hash: hash ? `#${hash}` : "",
      },
      { replace: true },
    );
  }, [
    location.pathname,
    location.search,
    location.hash,
    navigate,
    tokenFromUrl,
  ]);

  useEffect(() => {
    if (requestedLanguage) {
      void i18n.changeLanguage(requestedLanguage);
    }
  }, [i18n, requestedLanguage]);

  const loadReservation = async () => {
    if (!restaurantId || !token) {
      setError(t("manage.invalidLink", "This link is invalid or incomplete."));
      setLoading(false);
      return;
    }
    try {
      const data: ManageReservation = await getManageReservation(
        restaurantId,
        token,
      );
      setReservation(data);
      setAdults(Math.max(1, data.adultsCount));
      setChildren(data.childrenCount);
      setDate(localDateISO(new Date(data.startsAt)));
    } catch (e: any) {
      setError(t(getApiError(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    getReservationConfig(restaurantId)
      .then((d: ReservationPublicConfig) => {
        if (cancelled) return;
        setConfig(d);
        setTheme(
          getStoredPublicTheme(
            restaurantId,
            (d?.restaurant?.defaultTheme as PublicBrandMode) || "light",
          ),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  useEffect(() => {
    void loadReservation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, token]);

  useReservationRealtime(restaurantId, token, (update) => {
    // Paint the new state immediately, then refetch the authoritative public
    // view so action availability and any concurrently changed fields agree.
    setReservation((current) => {
      if (!current) return current;
      const canManage =
        (update.status === "PENDING" || update.status === "CONFIRMED") &&
        new Date(current.startsAt).getTime() > Date.now();
      return {
        ...current,
        status: update.status,
        canModify: canManage,
        canCancel: canManage,
      };
    });
    void loadReservation();
  });

  // Fetch availability while the guest is editing.
  useEffect(() => {
    if (!editing || !restaurantId) return;
    let cancelled = false;
    setSlotsLoading(true);
    setSelectedSlot(null);
    getReservationAvailability(restaurantId, date, adults, children)
      .then((d: { slots: AvailabilitySlot[] }) => {
        if (!cancelled) setSlots(d.slots ?? []);
      })
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setSlotsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [editing, restaurantId, date, adults, children]);

  const palette = resolvePublicPalette(config?.restaurant, theme);
  const isDark = theme === "dark";
  const rootStyle = {
    "--bg": palette.bg,
    "--text": palette.text,
    "--card": palette.card,
    "--accent": palette.accent,
    "--muted": hexToRgba(palette.text, 0.6),
    "--border": hexToRgba(palette.text, isDark ? 0.16 : 0.1),
    background: "var(--bg)",
    color: "var(--text)",
  } as CSSProperties;

  const doCancel = async () => {
    setCancelling(true);
    setError(null);
    try {
      await cancelManageReservation(restaurantId, token);
      setNotice(t("manage.cancelled", "Your reservation has been cancelled."));
      setConfirmCancel(false);
      await loadReservation();
    } catch (e: any) {
      setError(t(getApiError(e)));
    } finally {
      setCancelling(false);
    }
  };

  const doSave = async () => {
    if (!selectedSlot) return;
    setSaving(true);
    setError(null);
    try {
      await modifyManageReservation(restaurantId, token, {
        startsAt: selectedSlot,
        adultsCount: adults,
        childrenCount: children,
      });
      setNotice(t("manage.saved", "Your reservation has been updated."));
      setEditing(false);
      await loadReservation();
    } catch (e: any) {
      setError(t(getApiError(e)));
    } finally {
      setSaving(false);
    }
  };

  const whenLabel = useMemo(() => {
    if (!reservation) return "";
    return new Date(reservation.startsAt).toLocaleString(
      i18n.language || undefined,
      {
        // Show the restaurant's local time, not the guest's browser tz.
        timeZone: config?.restaurant?.timezone ?? undefined,
        weekday: "long",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      },
    );
  }, [reservation, config]);

  const partyValid = total >= 1 && total <= maxParty;
  const maxDate = localDateISO(
    new Date(
      Date.now() +
        (reservation?.policy?.bookingHorizonDays ?? 60) * 24 * 3600 * 1000,
    ),
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "CONFIRMED":
      case "ARRIVED":
        return "#16a34a";
      case "PENDING":
        return "#f97316";
      case "CANCELLED":
      case "DECLINED":
      case "NO_SHOW":
        return "#ef4444";
      default:
        return "var(--muted)";
    }
  };

  return (
    <div
      style={rootStyle}
      className="min-h-screen flex items-center justify-center p-4"
    >
      <div
        className="max-w-md w-full rounded-2xl shadow-sm p-6 space-y-4"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
      >
        {config?.restaurant?.logoUrl && (
          <img
            src={config.restaurant.logoUrl}
            alt={config.restaurant.name}
            className="h-16 w-16 rounded-full object-cover mx-auto"
            style={{ boxShadow: "0 0 0 1px var(--border)" }}
          />
        )}
        <h1 className="text-xl font-bold text-center">
          {t("manage.title", "Manage your reservation")}
        </h1>

        {loading ? (
          <p className="text-center" style={{ color: "var(--muted)" }}>
            {t("booking.loading", "Loading…")}
          </p>
        ) : error && !reservation ? (
          <p className="text-center text-sm" style={{ color: "#ef4444" }}>
            {error}
          </p>
        ) : reservation ? (
          <>
            <div className="text-center">
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {t("booking.reference", "Reference")}
              </p>
              <p className="text-2xl font-mono font-bold tracking-widest">
                {reservation.referenceCode}
              </p>
            </div>

            <div
              className="rounded-xl px-4 py-3 text-sm text-center"
              style={{
                background: hexToRgba(palette.accent, isDark ? 0.14 : 0.08),
                border: "1px solid var(--border)",
              }}
            >
              <div className="font-medium">{whenLabel}</div>
              <div style={{ color: "var(--muted)" }}>
                {t("manage.party", "Party of {{n}}", {
                  n: reservation.totalGuests,
                })}
                {reservation.preferredZone
                  ? ` · ${t(`zones.${reservation.preferredZone}`, reservation.preferredZone)}`
                  : ""}
              </div>
              <div
                className="mt-1 text-xs font-bold uppercase tracking-wide"
                style={{ color: getStatusColor(reservation.status) }}
              >
                {t(
                  `reservations.status.${reservation.status}`,
                  reservation.status,
                )}
              </div>
            </div>

            {notice && (
              <p
                className="text-sm text-center"
                style={{ color: palette.accent }}
              >
                {notice}
              </p>
            )}
            {error && (
              <p className="text-sm text-center" style={{ color: "#ef4444" }}>
                {error}
              </p>
            )}

            {!reservation.canModify && !reservation.canCancel && (
              <p
                className="text-sm text-center"
                style={{ color: "var(--muted)" }}
              >
                {t(
                  "manage.locked",
                  "This reservation can no longer be changed online. Please contact the restaurant.",
                )}
                {config?.restaurant?.contactInfo && (
                  <>
                    {" "}
                    <a
                      href={`tel:${config.restaurant.contactInfo.replace(/[^\d+]/g, "")}`}
                      className="font-semibold underline"
                      style={{ color: palette.accent }}
                    >
                      {config.restaurant.contactInfo}
                    </a>
                  </>
                )}
              </p>
            )}

            {/* Modify panel */}
            {editing && reservation.canModify && (
              <div
                className="space-y-3 rounded-xl p-3"
                style={{ border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-4">
                  <Stepper
                    label={t("booking.adults", "Adults")}
                    value={adults}
                    min={1}
                    max={maxParty}
                    onChange={setAdults}
                  />
                  <Stepper
                    label={t("booking.children", "Children")}
                    value={children}
                    min={0}
                    max={maxParty}
                    onChange={setChildren}
                  />
                </div>
                {!partyValid && (
                  <p className="text-xs" style={{ color: "#ef4444" }}>
                    {t("manage.partyMax", "Max {{n}} guests.", { n: maxParty })}
                  </p>
                )}
                <label className="block text-sm">
                  <span style={{ color: "var(--muted)" }}>
                    {t("booking.date", "Date")}
                  </span>
                  <input
                    type="date"
                    value={date}
                    min={localDateISO()}
                    max={maxDate}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-1 w-full rounded-lg px-3 py-2"
                    style={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                    }}
                  />
                </label>

                <div>
                  <span className="text-sm" style={{ color: "var(--muted)" }}>
                    {t("booking.pickTime", "Pick a time")}
                  </span>
                  {slotsLoading ? (
                    <p
                      className="text-sm mt-1"
                      style={{ color: "var(--muted)" }}
                    >
                      {t("booking.loading", "Loading…")}
                    </p>
                  ) : slots.length === 0 ? (
                    <p
                      className="text-sm mt-1"
                      style={{ color: "var(--muted)" }}
                    >
                      {t("booking.noSlots", "No times available for this day.")}
                    </p>
                  ) : (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {slots.map((s) => {
                        const isSelected = selectedSlot === s.startsAt;
                        const isCurrent =
                          new Date(s.startsAt).getTime() ===
                          new Date(reservation.startsAt).getTime();
                        return (
                          <button
                            key={s.startsAt}
                            type="button"
                            disabled={isCurrent}
                            onClick={() => setSelectedSlot(s.startsAt)}
                            className="text-sm rounded-full px-3 py-1.5 transition"
                            style={
                              isSelected
                                ? {
                                    background: palette.accent,
                                    color: "#fff",
                                  }
                                : isCurrent
                                  ? {
                                      background: hexToRgba(
                                        palette.text,
                                        isDark ? 0.32 : 0.16,
                                      ),
                                      border: "1px solid var(--border)",
                                      color: "var(--text)",
                                      fontWeight: 600,
                                      cursor: "not-allowed",
                                    }
                                  : {
                                      background: "transparent",
                                      border: "1px solid var(--border)",
                                      color: "var(--text)",
                                    }
                            }
                          >
                            {s.label}
                            {isCurrent
                              ? ` (${t("manage.currentTime", "current")})`
                              : ""}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={doSave}
                    disabled={!selectedSlot || !partyValid || saving}
                    className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: palette.accent }}
                  >
                    {saving
                      ? t("booking.saving", "Saving…")
                      : t("manage.saveChanges", "Save changes")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="rounded-lg px-4 py-2 text-sm font-medium"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    {t("manage.discard", "Discard")}
                  </button>
                </div>
              </div>
            )}

            {/* Primary actions */}
            {!editing && (
              <div className="flex flex-col gap-2">
                {reservation.canModify && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="rounded-lg py-2 text-sm font-semibold text-white"
                    style={{ background: palette.accent }}
                  >
                    {t("manage.change", "Change time or party size")}
                  </button>
                )}
                {reservation.canCancel &&
                  (confirmCancel ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={doCancel}
                        disabled={cancelling}
                        className="flex-1 rounded-lg py-2 text-sm font-semibold text-white disabled:opacity-50"
                        style={{ background: "#ef4444" }}
                      >
                        {cancelling
                          ? t("manage.cancelling", "Cancelling…")
                          : t("manage.confirmCancel", "Yes, cancel it")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(false)}
                        className="rounded-lg px-4 py-2 text-sm font-medium"
                        style={{ border: "1px solid var(--border)" }}
                      >
                        {t("manage.keep", "Keep it")}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(true)}
                      className="rounded-lg py-2 text-sm font-medium"
                      style={{ border: "1px solid #ef4444", color: "#ef4444" }}
                    >
                      {t("manage.cancel", "Cancel reservation")}
                    </button>
                  ))}
              </div>
            )}
          </>
        ) : null}

        {restaurantId && (
          <div className="text-center">
            <Link
              to={`/menu/public/${restaurantId}`}
              className="inline-block text-sm font-medium underline"
              style={{ color: "var(--accent)" }}
            >
              {t("booking.backToMenu", "Back to menu")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex-1">
      <div className="text-xs mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div
        className="flex items-center justify-between rounded-lg px-2 py-1"
        style={{ border: "1px solid var(--border)" }}
      >
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-7 w-7 rounded-md text-lg leading-none"
          style={{ border: "1px solid var(--border)" }}
          aria-label="decrease"
        >
          −
        </button>
        <span className="font-semibold">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-7 w-7 rounded-md text-lg leading-none"
          style={{ border: "1px solid var(--border)" }}
          aria-label="increase"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default BookingManagePage;
