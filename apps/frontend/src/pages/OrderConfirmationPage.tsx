import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";
import { Star, ChefHat, CheckCircle2, Clock, XCircle } from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { useTranslation } from "react-i18next";

const STATUS_STEP: Record<string, number> = {
  NEW: 1,
  IN_PROGRESS: 2,
  SERVED: 3,
  COMPLETED: 3,
};

type StatusKey = "NEW" | "IN_PROGRESS" | "SERVED" | "COMPLETED" | "CANCELED";

const STATUS_STYLE: Record<
  StatusKey,
  {
    icon: React.ElementType;
    color: string;
    bg: string;
    border: string;
    dot: string;
    titleKey: string;
    subtitleKey: string;
  }
> = {
  NEW: {
    icon: Clock,
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    dot: "bg-primary animate-pulse",
    titleKey: "orderConfirmation.status.new.title",
    subtitleKey: "orderConfirmation.status.new.subtitle",
  },
  IN_PROGRESS: {
    icon: ChefHat,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    border: "border-orange-400/20",
    dot: "bg-orange-400 animate-pulse",
    titleKey: "orderConfirmation.status.inProgress.title",
    subtitleKey: "orderConfirmation.status.inProgress.subtitle",
  },
  SERVED: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
    dot: "bg-emerald-400 animate-pulse",
    titleKey: "orderConfirmation.status.served.title",
    subtitleKey: "orderConfirmation.status.served.subtitle",
  },
  COMPLETED: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/20",
    dot: "bg-emerald-400",
    titleKey: "orderConfirmation.status.completed.title",
    subtitleKey: "orderConfirmation.status.completed.subtitle",
  },
  CANCELED: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/20",
    dot: "bg-red-400",
    titleKey: "orderConfirmation.status.canceled.title",
    subtitleKey: "orderConfirmation.status.canceled.subtitle",
  },
};

function OrderProgressStepper({
  status,
  t,
}: {
  status: string;
  t: (k: string) => string;
}) {
  if (status === "CANCELED") return null;
  const steps = [
    t("orderConfirmation.steps.placed"),
    t("orderConfirmation.steps.inKitchen"),
    t("orderConfirmation.steps.onWay"),
  ];
  const active = STATUS_STEP[status] ?? 1;
  const allDone = active >= steps.length;
  return (
    <div className="glass-panel rounded-[2rem] p-5">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">
        {t("orderConfirmation.orderProgress")}
      </p>
      <div className="flex items-center">
        {steps.map((label, idx) => {
          const done = allDone || idx < active;
          const current = !allDone && idx === active;
          return (
            <div
              key={label}
              className="flex-1 flex flex-col items-center relative"
            >
              {idx < steps.length - 1 && (
                <div
                  className={`absolute top-3.5 left-1/2 w-full h-0.5 transition-colors duration-500 ${
                    done ? "bg-emerald-400" : "bg-border"
                  }`}
                />
              )}
              <div
                className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-500 border-2 ${
                  done
                    ? "bg-emerald-400 border-emerald-400"
                    : current
                      ? "bg-primary border-primary animate-pulse"
                      : "bg-background border-border"
                }`}
              >
                {done ? (
                  <svg
                    className="w-3.5 h-3.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <span
                    className={`text-[10px] font-black ${current ? "text-white" : "text-muted-foreground"}`}
                  >
                    {idx + 1}
                  </span>
                )}
              </div>
              <span
                className={`mt-2 text-[10px] font-bold text-center leading-tight ${current ? "text-foreground" : done ? "text-emerald-400" : "text-muted-foreground"}`}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const OrderConfirmationPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const orderNumber = location.state?.orderNumber || "";
  const restaurantId = location.state?.restaurantId || "";
  const orderId = location.state?.orderId || "";
  const orderTrackToken = location.state?.orderTrackToken || "";
  const tableNumber = location.state?.tableNumber || "";
  const menuReturnUrl =
    location.state?.menuReturnUrl ||
    `/menu/public/${restaurantId}${tableNumber ? `?table=${encodeURIComponent(tableNumber)}` : ""}`;
  const tier = (location.state?.tier as string) || "FREE";

  const [orderStatus, setOrderStatus] = useState<StatusKey>("NEW");
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected || !orderId || !orderTrackToken) return;
    socket.emit("joinOrderRoom", { orderId, token: orderTrackToken });
    const handleStatusChanged = (updatedOrder: any) => {
      setOrderStatus(updatedOrder.status);
    };
    socket.on("orderStatusChanged", handleStatusChanged);
    return () => {
      socket.off("orderStatusChanged", handleStatusChanged);
    };
  }, [socket, isConnected, orderId, orderTrackToken]);

  const cfg = STATUS_STYLE[orderStatus] ?? STATUS_STYLE.NEW;
  const StatusIcon = cfg.icon;

  return (
    <div
      className="min-h-screen premium-bg flex flex-col items-center justify-start px-4 pt-12"
      style={{
        paddingBottom:
          "max(3rem, calc(env(safe-area-inset-bottom, 0px) + 2rem))",
      }}
    >
      <div className="w-full max-w-md space-y-5 animate-in fade-in slide-in-from-bottom-8 duration-700">
        {/* Status card */}
        <div
          className={`glass-panel rounded-[2rem] p-6 ${cfg.bg} border ${cfg.border}`}
        >
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-2xl ${cfg.bg} border ${cfg.border} flex items-center justify-center flex-shrink-0`}
            >
              <StatusIcon className={`w-6 h-6 ${cfg.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {t("orderConfirmation.liveStatus")}
                </span>
              </div>
              <h1 className={`text-xl font-black tracking-tight ${cfg.color}`}>
                {t(cfg.titleKey)}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {t(cfg.subtitleKey)}
              </p>
            </div>
          </div>
        </div>

        {/* Progress stepper — hidden on FREE (no orders:receive) */}
        {tier !== "FREE" && <OrderProgressStepper status={orderStatus} t={t} />}

        {/* Order reference */}
        {orderNumber && (
          <div className="glass-panel rounded-[2rem] p-5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                {t("orderConfirmation.orderRef")}
              </p>
              <p className="font-mono text-sm font-bold text-foreground truncate max-w-[200px]">
                #{orderNumber.slice(-8).toUpperCase()}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-primary" />
            </div>
          </div>
        )}

        {/* Feedback CTA */}
        {orderNumber && restaurantId && (
          <div className="glass-panel rounded-[2rem] p-5 border border-amber-400/20 bg-amber-400/5">
            <div className="flex items-center gap-1.5 mb-3">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className="h-4 w-4 fill-amber-400 text-amber-400"
                />
              ))}
            </div>
            <p className="font-bold text-foreground mb-1 text-sm">
              {t("orderConfirmation.enjoyingVisit")}
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              {t("orderConfirmation.feedbackHelps")}
            </p>
            <button
              onClick={() =>
                navigate(
                  `/feedback/${restaurantId}?orderId=${orderNumber}&returnUrl=${encodeURIComponent(menuReturnUrl)}`,
                )
              }
              className="w-full py-3 px-4 rounded-xl bg-amber-400/15 border border-amber-400/30 text-amber-600 dark:text-amber-400 font-black text-xs uppercase tracking-widest hover:bg-amber-400/25 transition-colors active:scale-95"
            >
              {t("orderConfirmation.rateExperience")}
            </button>
          </div>
        )}

        {/* Navigation */}
        <button
          onClick={() => navigate(menuReturnUrl)}
          className="w-full bg-foreground text-background font-black uppercase tracking-widest py-4 px-6 rounded-2xl shadow-xl transition-all active:scale-95 text-xs hover:opacity-90"
        >
          {t("orderConfirmation.continueBrowsing")}
        </button>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;
