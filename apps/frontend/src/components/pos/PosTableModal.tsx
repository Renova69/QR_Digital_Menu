import { useState, useEffect, useContext, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { getTableStatuses, getZones, getOrCreateSession, forceOpenSession, getSessionBill } from "../../lib/api";
import type { TableZone } from "../../lib/api";
import { usePos } from "../../context/PosContext";
import RestaurantContext from "../../context/RestaurantContext";
import { useSocket } from "../../context/SocketContext";
import ZoneSelector from "./ZoneSelector";

interface TableStatus {
  id: string;
  name: string;
  status: "empty" | "occupied" | "paid";
  sessionId: string | null;
  orderCount: number;
  totalAmount: number;
  customerNames: string[];
  sessionStatus: string | null;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  empty: "bg-[rgba(52,211,153,0.08)] border-emerald-300/40 text-[#7C7892]",
  occupied: "bg-[rgba(239,68,68,0.11)] border-red-300/40 text-[#7C7892]",
  paid: "bg-[rgba(167,139,250,0.1)] border-violet-300/40 text-[#7C7892]",
};

export default function PosTableModal() {
  const { t } = useTranslation();
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const restaurantLoading = restaurantCtx?.loading ?? false;
  const { session, setSession, setHistoryItems, resetCart } = usePos();
  const { socket } = useSocket();

  const [tables, setTables] = useState<TableStatus[]>([]);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const fetchTables = useCallback(
    (zoneId?: string | null) => {
      if (!activeRestaurant) return;
      setError(null);
      getTableStatuses(activeRestaurant.id, zoneId ?? undefined)
        .then(setTables)
        .catch(() =>
          setError(t("pos.failedLoadTables", "Failed to load tables. Check your connection.")),
        );
    },
    [activeRestaurant],
  );

  const fetchZones = useCallback(() => {
    if (!activeRestaurant) return;
    getZones(activeRestaurant.id)
      .then(setZones)
      .catch((err) => console.error('Failed to fetch zones:', err));
  }, [activeRestaurant]);

  useEffect(() => {
    if (!session) {
      setOpen(true);
    }
  }, [session]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("pos:open-table-modal", handler);
    return () => window.removeEventListener("pos:open-table-modal", handler);
  }, []);

  useEffect(() => {
    if (open && activeRestaurant) {
      setLoading(true);
      Promise.all([
        getTableStatuses(activeRestaurant.id),
        getZones(activeRestaurant.id),
      ])
        .then(([tableData, zoneData]) => {
          setTables(tableData);
          setZones(zoneData);
          if (zoneData.length > 1 && !selectedZoneId) {
            setSelectedZoneId(zoneData[0].id);
          }
        })
        .catch(() =>
          setError(t("pos.failedLoadTables", "Failed to load tables. Check your connection.")),
        )
        .finally(() => setLoading(false));
    }
  }, [open, activeRestaurant]);

  // Refetch tables when zone changes
  useEffect(() => {
    if (open && activeRestaurant) {
      fetchTables(selectedZoneId);
    }
  }, [selectedZoneId, open, activeRestaurant, fetchTables]);

  // Auto-refresh when table status, creation, deletion, or zone changes
  useEffect(() => {
    if (!socket || !open) return;
    const refresh = () => fetchTables(selectedZoneId);
    const refreshZones = () => fetchZones();
    socket.on("table:status-changed", refresh);
    socket.on("table:created", refresh);
    socket.on("table:deleted", refresh);
    const onZoneChanged = () => {
      refreshZones();
      refresh();
    };
    socket.on("zone:changed", onZoneChanged);
    return () => {
      socket.off("table:status-changed", refresh);
      socket.off("table:created", refresh);
      socket.off("table:deleted", refresh);
      socket.off("zone:changed", onZoneChanged);
    };
  }, [socket, open, fetchTables, fetchZones, selectedZoneId]);

  const handleSelect = async (table: TableStatus) => {
    if (!activeRestaurant) return;
    setActionError(null);
    try {
      const result = await getOrCreateSession(table.id, activeRestaurant.id);
      // Clear previous table's cart before loading new session
      resetCart();
      setSession({
        tableId: table.id,
        tableName: table.name,
        sessionToken: result.token,
        sessionId: result.session.id,
      });

      // Always load existing orders as history — don't trust orderCount
      // from getTableStatuses (can be stale or mismatched session)
      try {
        const bill = await getSessionBill(result.token);
        const historyItems = bill.orders.flatMap((order: any) =>
          (order.items ?? []).map((oi: any, idx: number) => ({
            cartId: `${order.id}-${idx}`,
            menuItemId: "",
            name: oi.name ?? "Unknown item",
            price: oi.unitPrice ?? 0,
            quantity: oi.quantity,
            selectedOptions: (oi.selectedOptions ?? []) as Array<{
              optionId: string;
              optionName: string;
              choiceName: string;
              priceModifier: number;
            }>,
            seatNumber: "Shared",
            itemNote: "",
            submitted: true,
          }))
        );
        if (historyItems.length > 0) {
          setHistoryItems(historyItems);
        }
      } catch {
        // History load is best-effort; don't block session open
      }

      setOpen(false);
    } catch {
      setActionError(t("pos.failedOpenSession", "Failed to open session. Try again or use Force Open."));
    }
  };

  const handleForceOpen = async (table: TableStatus) => {
    if (!activeRestaurant) return;
    setActionError(null);
    try {
      const result = await forceOpenSession(table.id, activeRestaurant.id);
      resetCart();
      setSession({
        tableId: table.id,
        tableName: table.name,
        sessionToken: result.token,
        sessionId: result.session.id,
      });
      setOpen(false);
    } catch {
      setActionError(t("pos.failedForceOpen", "Failed to force open session. Check your connection."));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen && !session) {
      setOpen(true);
      return;
    }
    if (session && !isOpen) return;
    setOpen(isOpen);
  };

  if (!activeRestaurant) {
    return (
      <div className="flex items-center justify-center h-dvh text-muted-foreground">
        {restaurantLoading ? t("pos.loadingRestaurant", "Loading restaurant...") : t("pos.noRestaurant", "No restaurant selected.")}
      </div>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 w-full max-h-[85dvh] overflow-y-auto rounded-t-xl bg-background p-6 pt-safe md:inset-auto md:top-1/2 md:left-1/2 md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:bottom-auto">
          <Dialog.Title className="text-lg font-semibold mb-1">
            Select Table
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mb-3">
            Choose a table to start taking orders.
          </Dialog.Description>

          <ZoneSelector
            zones={zones}
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
          />

          {session && (
            <button
              type="button"
              className="w-full mb-4 py-2 px-4 rounded-lg brand-cta text-white font-medium min-h-[44px]"
              onClick={() => setOpen(false)}
            >
              Back to POS — {session.tableName}
            </button>
          )}

          {actionError && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-3 p-2 rounded bg-red-50 dark:bg-red-900/20">
              {actionError}
            </p>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-8">
              <p className="text-center text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  getTableStatuses(activeRestaurant.id)
                    .then(setTables)
                    .catch(() => setError(t("pos.failedLoadTables", "Failed to load tables. Check your connection.")))
                    .finally(() => setLoading(false));
                }}
                className="px-4 py-2 rounded-lg brand-cta text-white text-sm min-h-[44px]"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
            <div className="min-h-[50vh] max-h-[50vh] md:min-h-[400px] md:max-h-[400px] overflow-y-auto custom-scrollbar pr-1 -mr-1 content-start">
              <div className="grid grid-cols-3 gap-3">
                {tables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => handleSelect(table)}
                    className={`relative flex flex-col items-center justify-center p-4 rounded-lg border-2 min-h-[80px] transition-none ${STATUS_COLORS[table.status]}`}
                  >
                    <span className="text-lg font-extrabold">{table.name}</span>
                    <span className="text-sm font-semibold capitalize">{table.status}</span>
                    {table.sessionStatus === "OPEN" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleForceOpen(table);
                        }}
                        className="mt-2 text-xs underline opacity-70 hover:opacity-100 min-h-[44px] flex items-center"
                      >
                        Force Open
                      </button>
                    )}
                  </button>
                ))}
              </div>
              {tables.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  No tables found. Create tables in the dashboard first.
                </p>
              )}
            </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
