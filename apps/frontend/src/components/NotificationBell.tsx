import { useState, useRef, useEffect } from "react";
import { Bell, CreditCard } from "lucide-react";
import { useNotifications } from "../context/NotificationContext";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useNavigate } from "react-router-dom";

export const formatNotificationTimeAgo = (
  t: TFunction,
  timestamp: number,
  now = Date.now(),
) => {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return t("auto.justNow", "just now");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return t("auto.minutesAgo", "{{count}}m ago", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("auto.hoursAgo", "{{hours}} hours ago", { hours });
  return t("auto.daysAgo", "{{count}}d ago", {
    count: Math.floor(hours / 24),
  });
};

const NotificationBell = () => {
  const { t } = useTranslation();
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleToggle = () => {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && unreadCount > 0) {
      void markAllRead();
    }
  };

  const handleNotificationClick = (paymentId: string) => {
    setIsOpen(false);
    navigate(
      `/dashboard?tab=payments&paymentId=${encodeURIComponent(paymentId)}`,
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-3 rounded-2xl hover:bg-secondary/80 transition-colors"
        aria-label={t(
          "auto.paymentNotificationsAriaLabel",
          "Payment notifications",
        )}
      >
        <Bell className="w-6 h-6 text-muted-foreground" />
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 text-white text-[9px] font-black min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 shadow-lg"
            style={{ background: "var(--gradient-brand)" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="glass-panel absolute right-0 top-full z-50 mt-2 max-h-96 w-[min(20rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-white/10 shadow-2xl">
          <div className="p-4 border-b border-border/40 flex items-center justify-between">
            <h3 className="font-black text-xs uppercase tracking-widest text-foreground">
              {t("auto.paymentNotifications", "Payment Notifications")}
            </h3>
            <span className="text-[10px] text-muted-foreground font-bold">
              {notifications.length} {t("auto.total", "total")}
            </span>
          </div>

          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <CreditCard className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground font-bold">
                {t("auto.noPaymentsYet", "No payments yet")}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/20">
              {notifications.map((n) => (
                <button
                  type="button"
                  key={n.id}
                  onClick={() => handleNotificationClick(n.paymentId)}
                  className={`w-full p-4 text-left transition-colors hover:bg-secondary/40 ${!n.read ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span
                        className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${
                          n.kind === "PAYMENT_REFUNDED"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200"
                        }`}
                      >
                        {n.kind === "PAYMENT_REFUNDED"
                          ? t("payments.refunded", "Refunded")
                          : t("payments.paymentReceived", "Payment received")}
                      </span>
                      <p className="text-sm font-bold text-foreground">
                        {n.tableNumber ??
                          t("payments.unknownTable", "Unknown table")}
                        {n.customerName && (
                          <span className="text-muted-foreground font-normal">
                            {" "}
                            — {n.customerName}
                          </span>
                        )}
                      </p>
                      <p className="text-lg font-black text-foreground mt-0.5">
                        {new Intl.NumberFormat(undefined, {
                          style: "currency",
                          currency: n.currency,
                        }).format(n.amount)}
                      </p>
                      <p className="mt-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        {n.provider}
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-bold whitespace-nowrap">
                      {formatNotificationTimeAgo(t, n.timestamp)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
