import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useOrders, OrderStatus } from "../../context/OrderContext";
import { useSocket } from "../../context/SocketContext";
import { useFeature } from "../../hooks/useFeature";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { AlertTriangle, RefreshCw } from "lucide-react";
import RestaurantContext from "../../context/RestaurantContext";

function elapsedMinutes(createdAt: string, now = Date.now()): number {
  const diff = now - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(diff / 60000));
}

function KitchenClock() {
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());

  useEffect(() => {
    const interval = setInterval(
      () => setClock(new Date().toLocaleTimeString()),
      1000,
    );
    return () => clearInterval(interval);
  }, []);

  return <div className="text-sm text-gray-500">{clock}</div>;
}

const COLUMNS: {
  status: OrderStatus;
  labelKey: string;
  fallback: string;
  color: string;
}[] = [
  {
    status: "PENDING_PAYMENT",
    labelKey: "orders.tabs.pendingPayment",
    fallback: "Awaiting Payment",
    color: "border-t-violet-500",
  },
  {
    status: "NEW",
    labelKey: "orders.tabs.new",
    fallback: "New",
    color: "border-t-blue-500",
  },
  {
    status: "IN_PROGRESS",
    labelKey: "orders.tabs.inProgress",
    fallback: "In Progress",
    color: "border-t-amber-500",
  },
  {
    status: "SERVED",
    labelKey: "orders.tabs.served",
    fallback: "Ready",
    color: "border-t-emerald-500",
  },
];

const HISTORY_HOURS = 24;

interface KdsOrderLocation {
  tableId?: string | null;
  tableName?: string | null;
  servicePointType?: string | null;
  servicePointLabel?: string | null;
}

interface FailedStatusUpdate {
  fromStatus: OrderStatus;
}

function withLocationPrefix(raw: string, prefix: string, english: string) {
  const normalized = raw.toLocaleLowerCase();
  const translatedPrefix = prefix.toLocaleLowerCase();
  if (
    normalized === translatedPrefix ||
    normalized.startsWith(`${translatedPrefix} `) ||
    normalized === english ||
    normalized.startsWith(`${english} `)
  ) {
    return raw;
  }
  return `${prefix} ${raw}`;
}

function getKdsLocationLabel(order: KdsOrderLocation, t: TFunction) {
  const raw = String(
    order.servicePointLabel ?? order.tableName ?? order.tableId ?? "—",
  ).trim();

  if (order.servicePointType === "ROOM") {
    return withLocationPrefix(
      raw,
      t("servicePoints.types.room", "Room"),
      "room",
    );
  }
  if (order.servicePointType === "PICKUP") {
    return withLocationPrefix(
      raw,
      t("servicePoints.types.pickup", "Pickup"),
      "pickup",
    );
  }
  if (order.servicePointType === "OTHER") {
    return withLocationPrefix(
      raw,
      t("servicePoints.types.location", "Location"),
      "location",
    );
  }
  return withLocationPrefix(raw, t("auto.table", "Table"), "table");
}

export default function KitchenPage() {
  const { t } = useTranslation();
  const { orders, updateOrderStatus } = useOrders();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const canKds = useFeature("kds");
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [failedUpdates, setFailedUpdates] = useState<
    Record<string, FailedStatusUpdate>
  >({});

  useEffect(() => {
    if (activeRestaurant && !canKds) {
      navigate("/dashboard", { replace: true });
    }
  }, [activeRestaurant, canKds, navigate]);

  // Audio alert on new order
  useEffect(() => {
    if (!canKds || !socket) return;
    const handler = () => {
      try {
        new Audio("/notification.mp3").play().catch(() => {});
      } catch {}
    };
    socket.on("newOrder", handler);
    return () => {
      socket.off("newOrder", handler);
    };
  }, [canKds, socket]);

  const [elapsedClock, setElapsedClock] = useState(() => Date.now());

  // Tick elapsed counters every 10s
  useEffect(() => {
    const interval = setInterval(() => setElapsedClock(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  const handleCycle = useCallback(
    async (orderId: string, current: OrderStatus) => {
      if (current === "PENDING_PAYMENT") return;
      const next: Record<
        Exclude<OrderStatus, "PENDING_PAYMENT">,
        OrderStatus
      > = {
        NEW: "IN_PROGRESS",
        IN_PROGRESS: "SERVED",
        SERVED: "COMPLETED",
        CANCELED: "NEW",
        COMPLETED: "NEW",
      };
      setFailedUpdates((previous) => {
        if (!(orderId in previous)) return previous;
        const nextFailures = { ...previous };
        delete nextFailures[orderId];
        return nextFailures;
      });
      try {
        await updateOrderStatus(orderId, next[current]);
      } catch {
        setFailedUpdates((previous) => ({
          ...previous,
          [orderId]: { fromStatus: current },
        }));
      }
    },
    [updateOrderStatus],
  );

  useEffect(() => {
    setFailedUpdates((previous) => {
      let nextFailures = previous;
      for (const [orderId, failure] of Object.entries(previous)) {
        const currentOrder = orders.find((order) => order.id === orderId);
        if (!currentOrder || currentOrder.status !== failure.fromStatus) {
          if (nextFailures === previous) nextFailures = { ...previous };
          delete nextFailures[orderId];
        }
      }
      return nextFailures;
    });
  }, [orders]);

  const getElapsed = (_id: string, createdAt: string) =>
    elapsedMinutes(createdAt, elapsedClock);

  // Active orders: exclude COMPLETED and CANCELED from kanban
  const activeOrders = orders.filter(
    (o) => o.status !== "COMPLETED" && o.status !== "CANCELED",
  );

  // History: COMPLETED orders from last 24h
  const now = Date.now();
  const completedOrders = orders
    .filter((o) => o.status === "COMPLETED")
    .filter(
      (o) => now - new Date(o.createdAt).getTime() < HISTORY_HOURS * 3600000,
    )
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );

  if (activeRestaurant && !canKds) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-2">
        <h1 className="text-3xl font-black tracking-tight">
          {t("auto.kITCHEN", "KITCHEN")}
          <span className="text-blue-400">{t("auto.dISPLAY", "DISPLAY")}</span>
        </h1>
        <div className="flex items-center gap-4">
          <KitchenClock />
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-xl border transition ${
              showHistory
                ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                : "bg-gray-800 text-gray-500 border-gray-700 hover:text-gray-300"
            }`}
          >
            {t("auto.history", "History")}
            {completedOrders.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-400 text-[10px]">
                {completedOrders.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="mb-4 bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-t-4 border-t-gray-500 bg-gray-900/80 backdrop-blur flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-widest text-gray-400">
              {t("auto.historyLast", "History — Last")}
              {HISTORY_HOURS}h
            </span>
            <button
              onClick={() => setShowHistory(false)}
              className="text-gray-600 hover:text-gray-400 text-lg leading-none"
            >
              {t("auto.Times", "&times;")}
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-3">
            {completedOrders.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-gray-700 text-xs uppercase tracking-widest">
                {t("auto.noCompletedOrders", "No completed orders")}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {completedOrders.map((order) => {
                  const completedAt = order.updatedAt
                    ? new Date(order.updatedAt).toLocaleTimeString()
                    : "—";
                  return (
                    <div
                      key={order.id}
                      className="bg-gray-800 rounded-xl p-3 border border-gray-700/50 opacity-60"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-700 text-gray-500">
                          #{order.id.slice(-8)}
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {completedAt}
                        </span>
                      </div>
                      <ul className="space-y-1 mb-1">
                        {order.items.map((item) => (
                          <li
                            key={item.id}
                            className="text-xs text-gray-400 flex justify-between"
                          >
                            <span>
                              {item.quantity}x{" "}
                              {item.menuItem?.name ?? item.itemName ?? "Item"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-gray-600">
                        {getKdsLocationLabel(order, t)}
                        {order.customerName ? ` — ${order.customerName}` : ""}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {Object.keys(failedUpdates).length > 0 && (
        <div className="mb-4 space-y-2" aria-live="assertive">
          {Object.keys(failedUpdates).map((orderId) => {
            const order = orders.find((candidate) => candidate.id === orderId);
            if (!order) return null;
            return (
              <div
                key={orderId}
                role="alert"
                className="flex items-center justify-between gap-4 rounded-lg border border-red-500/40 bg-red-950/60 px-4 py-3 text-red-100"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AlertTriangle
                    className="h-5 w-5 shrink-0 text-red-400"
                    aria-hidden="true"
                  />
                  <p className="text-sm">
                    <span className="font-bold">
                      {t("kitchen.statusUpdateFailed", "Status update failed.")}
                    </span>{" "}
                    {t(
                      "kitchen.statusUnchanged",
                      "The order kept its current status.",
                    )}{" "}
                    <span className="text-red-300">#{order.id.slice(-8)}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCycle(order.id, order.status)}
                  className="inline-flex shrink-0 items-center gap-2 rounded-md border border-red-400/50 px-3 py-2 text-sm font-bold text-red-100 hover:bg-red-900/70 focus:outline-none focus:ring-2 focus:ring-red-300"
                >
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  {t("common.retry", "Retry")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Kanban columns */}
      <div
        className="grid grid-cols-4 gap-4"
        style={{
          height: showHistory ? "calc(100vh - 22rem)" : "calc(100vh - 5rem)",
        }}
      >
        {COLUMNS.map((col) => {
          const colOrders = activeOrders.filter((o) => o.status === col.status);
          return (
            <div
              key={col.status}
              className="flex flex-col bg-gray-900 rounded-2xl overflow-hidden border border-gray-800"
            >
              {/* Column header */}
              <div
                className={`px-4 py-3 border-t-4 ${col.color} bg-gray-900/80 backdrop-blur`}
              >
                <span className="text-sm font-bold uppercase tracking-widest">
                  {t(col.labelKey, col.fallback)}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  ({colOrders.length})
                </span>
              </div>

              {/* Column body */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {colOrders.map((order) => {
                  const minutes = getElapsed(order.id, order.createdAt);
                  const urgent = minutes > 15;
                  const locationLabel = getKdsLocationLabel(order, t);

                  return (
                    <button
                      key={order.id}
                      disabled={order.status === "PENDING_PAYMENT"}
                      onClick={() => void handleCycle(order.id, order.status)}
                      className={`w-full text-left bg-gray-800 rounded-xl p-4 border transition-all ${
                        order.status === "PENDING_PAYMENT"
                          ? "cursor-default opacity-80"
                          : "active:scale-[0.98] hover:bg-gray-750"
                      } ${
                        urgent && col.status === "NEW"
                          ? "border-red-500/50 ring-1 ring-red-500/20"
                          : "border-gray-700/50"
                      }`}
                    >
                      {/* Card header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
                            #{order.id.slice(-8)}
                          </span>
                          <span className="text-sm font-bold text-gray-300">
                            {locationLabel}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-bold tabular-nums ${
                            urgent && col.status === "NEW"
                              ? "text-red-400"
                              : "text-gray-500"
                          }`}
                        >
                          {minutes}m
                        </span>
                      </div>

                      {/* Items */}
                      <ul className="space-y-1.5 mb-2">
                        {order.items.map((item) => (
                          <li
                            key={item.id}
                            className="text-sm flex justify-between"
                          >
                            <span className="text-gray-200 font-medium">
                              {item.quantity}x{" "}
                              {item.menuItem?.name ?? item.itemName ?? "Item"}
                            </span>
                          </li>
                        ))}
                      </ul>

                      {/* Special requests */}
                      {order.specialRequests && (
                        <div className="mt-2 pt-2 border-t border-gray-700/50">
                          <p className="text-xs text-amber-400 font-bold uppercase tracking-wide">
                            {order.specialRequests}
                          </p>
                        </div>
                      )}

                      {/* Customer name */}
                      {order.customerName && (
                        <p className="text-xs text-gray-500 mt-1">
                          {order.customerName}
                        </p>
                      )}
                    </button>
                  );
                })}

                {colOrders.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-gray-700 text-xs uppercase tracking-widest">
                    {t("auto.noOrders", "No orders")}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
