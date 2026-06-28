import { useState, useEffect, useRef, useCallback, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useOrders, OrderStatus } from "../../context/OrderContext";
import { useSocket } from "../../context/SocketContext";
import { useFeature } from "../../hooks/useFeature";
import { useTranslation } from "react-i18next";
import RestaurantContext from "../../context/RestaurantContext";

function elapsedMinutes(createdAt: string): number {
  const diff = Date.now() - new Date(createdAt).getTime();
  return Math.floor(diff / 60000);
}

const COLUMNS: { status: OrderStatus; label: string; color: string }[] = [
  { status: "NEW", label: "New", color: "border-t-blue-500" },
  { status: "IN_PROGRESS", label: "In Progress", color: "border-t-amber-500" },
  { status: "SERVED", label: "Ready", color: "border-t-emerald-500" },
];

const HISTORY_HOURS = 24;

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

  useEffect(() => {
    if (activeRestaurant && !canKds) {
      navigate("/dashboard", { replace: true });
    }
  }, [activeRestaurant, canKds, navigate]);

  // Audio alert on new order
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      try {
        new Audio("/notification.mp3").play().catch(() => {});
      } catch {}
    };
    socket.on("newOrder", handler);
    return () => {
      socket.off("newOrder", handler);
    };
  }, [socket]);

  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());
  const [elapsed, setElapsed] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setInterval(
      () => setClock(new Date().toLocaleTimeString()),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  // Tick elapsed counters every 10s
  useEffect(() => {
    const tick = () => {
      const next: Record<string, number> = {};
      for (const o of orders) {
        next[o.id] = elapsedMinutes(o.createdAt);
      }
      setElapsed(next);
    };
    tick();
    const interval = setInterval(tick, 10000);
    return () => clearInterval(interval);
  }, [orders]);

  const handleCycle = useCallback(
    async (orderId: string, current: OrderStatus) => {
      const next: Record<OrderStatus, OrderStatus> = {
        NEW: "IN_PROGRESS",
        IN_PROGRESS: "SERVED",
        SERVED: "COMPLETED",
        CANCELED: "NEW",
        COMPLETED: "NEW",
      };
      try {
        await updateOrderStatus(orderId, next[current]);
      } catch {}
    },
    [updateOrderStatus],
  );

  const getElapsed = (id: string, createdAt: string) => {
    if (elapsed[id] !== undefined) return elapsed[id];
    return elapsedMinutes(createdAt);
  };

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

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 px-2">
        <h1 className="text-3xl font-black tracking-tight">
          {t("auto.kITCHEN", "KITCHEN")}
          <span className="text-blue-400">{t("auto.dISPLAY", "DISPLAY")}</span>
        </h1>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">{clock}</div>
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
                        {order.items.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-gray-400 flex justify-between"
                          >
                            <span>
                              {item.quantity}x {item.menuItem?.name ?? "Item"}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <p className="text-[10px] text-gray-600">
                        {t("auto.table", "Table")}
                        {order.tableName || order.tableId || "—"}
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

      {/* Kanban columns */}
      <div
        className="grid grid-cols-3 gap-4"
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
                  {col.label}
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
                  const tableNum = order.tableName || order.tableId || "—";

                  return (
                    <button
                      key={order.id}
                      onClick={() => handleCycle(order.id, order.status)}
                      className={`w-full text-left bg-gray-800 rounded-xl p-4 border transition-all active:scale-[0.98] hover:bg-gray-750 ${
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
                            {t("auto.table", "Table")}
                            {tableNum}
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
                        {order.items.map((item, idx) => (
                          <li
                            key={idx}
                            className="text-sm flex justify-between"
                          >
                            <span className="text-gray-200 font-medium">
                              {item.quantity}x {item.menuItem?.name ?? "Item"}
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
