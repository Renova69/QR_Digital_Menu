import { useEffect } from "react";
import { CheckCircle2, RotateCcw, X } from "lucide-react";
import { useNotifications } from "../context/NotificationContext";
import { useTranslation } from "react-i18next";

const PaymentToast = () => {
  const { t } = useTranslation();
  const { showToast, dismissToast } = useNotifications();

  useEffect(() => {
    if (!showToast) return;
    const timer = setTimeout(dismissToast, 8000);
    return () => clearTimeout(timer);
  }, [showToast, dismissToast]);

  if (!showToast) return null;

  const isRefund = showToast.kind === "PAYMENT_REFUNDED";
  const tableLabel =
    showToast.tableNumber ?? t("payments.unknownTable", "Unknown table");
  const customerLabel = showToast.customerName
    ? ` — ${showToast.customerName}`
    : "";
  const amountLabel = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: showToast.currency,
  }).format(showToast.amount);
  const tipLabel = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: showToast.currency,
  }).format(showToast.tipAmount);

  return (
    <div
      className="fixed bottom-6 right-6 z-50 max-w-sm animate-in slide-in-from-right-8 fade-in duration-300"
      role="alert"
    >
      <div
        className={`glass-panel rounded-2xl border p-4 shadow-2xl ${
          isRefund
            ? "border-amber-400/30 bg-amber-400/10"
            : "border-emerald-400/30 bg-emerald-400/10"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${
              isRefund
                ? "border-amber-400/30 bg-amber-400/20"
                : "border-emerald-400/30 bg-emerald-400/20"
            }`}
          >
            {isRefund ? (
              <RotateCcw className="h-5 w-5 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className={`mb-0.5 text-xs font-black uppercase tracking-widest ${
                isRefund ? "text-amber-400" : "text-emerald-400"
              }`}
            >
              {isRefund
                ? t("payments.refunded", "Refunded")
                : t("auto.paymentReceived", "Payment Received")}
            </p>
            <p className="text-sm font-bold text-foreground">
              {tableLabel}
              {customerLabel}
            </p>
            <p className="text-lg font-black text-foreground mt-0.5">
              {amountLabel}
              {showToast.tipAmount > 0 && (
                <span className="text-xs text-muted-foreground font-normal ml-1">
                  + {tipLabel} {t("auto.tip", "tip")}
                </span>
              )}
            </p>
          </div>
          <button
            onClick={dismissToast}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentToast;
