import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getReservationStatus, getReservationConfig } from "../lib/api";
import type { ReservationPublicConfig } from "../types/reservations";
import {
  getStoredPublicTheme,
  hexToRgba,
  PublicBrandMode,
  resolvePublicPalette,
} from "../lib/publicTheme";

const STATUS_META: Record<
  string,
  { key: string; fallback: string; hue: string }
> = {
  PENDING: {
    key: "booking.statusPending",
    fallback: "Request received — awaiting the restaurant's confirmation.",
    hue: "#f59e0b",
  },
  CONFIRMED: {
    key: "booking.statusConfirmed",
    fallback: "Your reservation is confirmed. See you soon!",
    hue: "#22c55e",
  },
  ARRIVED: {
    key: "booking.statusConfirmed",
    fallback: "Your reservation is confirmed. See you soon!",
    hue: "#6366f1",
  },
  DECLINED: {
    key: "booking.statusDeclined",
    fallback: "Unfortunately this request could not be accepted.",
    hue: "#ef4444",
  },
  CANCELLED: {
    key: "booking.statusCancelled",
    fallback: "This reservation has been cancelled.",
    hue: "#6b7280",
  },
};

const BookingConfirmationPage = () => {
  const { t } = useTranslation();
  const params = new URLSearchParams(useLocation().search);
  const referenceCode = params.get("ref") ?? "";
  const restaurantId = params.get("r") ?? "";

  const [status, setStatus] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<ReservationPublicConfig | null>(null);
  const [theme, setTheme] = useState<PublicBrandMode>("light");

  // Load branding/theme so this page matches the booking page + public menu.
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
  }, [restaurantId]);

  // Poll status while still PENDING so the guest sees accept/decline live.
  useEffect(() => {
    if (!restaurantId || !referenceCode) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = () => {
      getReservationStatus(restaurantId, referenceCode)
        .then((data) => {
          if (cancelled) return;
          setStatus(data.status);
          setStartsAt(data.startsAt);
          if (data.status === "PENDING") {
            timer = setTimeout(poll, 12000);
          }
        })
        .catch(() => {})
        .finally(() => !cancelled && setLoading(false));
    };
    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [restaurantId, referenceCode]);

  const meta = STATUS_META[status ?? ""] ?? STATUS_META.PENDING;
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

  return (
    <div
      style={rootStyle}
      className="min-h-screen flex items-center justify-center p-4"
    >
      <div
        className="max-w-md w-full rounded-2xl shadow-sm p-6 text-center space-y-4"
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
        <h1 className="text-xl font-bold">
          {t("booking.confirmationTitle", "Reservation request")}
        </h1>

        {referenceCode && (
          <div>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {t("booking.reference", "Reference")}
            </p>
            <p className="text-2xl font-mono font-bold tracking-widest">
              {referenceCode}
            </p>
          </div>
        )}

        {loading ? (
          <p style={{ color: "var(--muted)" }}>
            {t("booking.loading", "Loading…")}
          </p>
        ) : (
          <>
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{
                color: meta.hue,
                background: hexToRgba(meta.hue, isDark ? 0.14 : 0.1),
                border: `1px solid ${hexToRgba(meta.hue, 0.4)}`,
              }}
            >
              {t(meta.key, meta.fallback)}
            </div>
            {startsAt && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                {new Date(startsAt).toLocaleString(undefined, {
                  weekday: "short",
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </p>
            )}
          </>
        )}

        {restaurantId && (
          <Link
            to={`/menu/public/${restaurantId}`}
            className="inline-block text-sm font-medium underline"
            style={{ color: "var(--accent)" }}
          >
            {t("booking.backToMenu", "Back to menu")}
          </Link>
        )}
      </div>
    </div>
  );
};

export default BookingConfirmationPage;
