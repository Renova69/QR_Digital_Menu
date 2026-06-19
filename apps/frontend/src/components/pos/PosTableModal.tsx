import { useState, useEffect, useContext, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslation } from "react-i18next";
import { getTableStatuses, getZones, forceOpenSession, getSessionBill } from "../../lib/api";
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
  sessionToken: string | null;
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
  const { session, setSession, setHistoryItems, resetCart, setHistoryLoading, setHistoryError } = usePos();
  const { socket } = useSocket();

  const [tables, setTables] = useState<TableStatus[]>([]);
  const [zones, setZones] = useState<TableZone[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [forceOpenTarget, setForceOpenTarget] = useState<TableStatus | null>(null);

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

  // Load zones on open. Tables are owned by the selectedZoneId effect below
  // (which also fires on open) — avoids the double table fetch (M4).
  useEffect(() => {
    if (open && activeRestaurant) {
      setLoading(true);
      getZones(activeRestaurant.id)
        .then((zoneData) => setZones(zoneData))
        .catch(() =>
          setError(t("pos.failedLoadTables", "Failed to load tables. Check your connection.")),
        )
        .finally(() => setLoading(false));
    }
  }, [open, activeRestaurant]);

  // Refetch tables when zone changes. Ignore-flag prevents stale
  // responses from overwriting newer data during rapid zone switches.
  useEffect(() => {
    if (!open || !activeRestaurant) return;
    let ignore = false;
    setError(null);
    getTableStatuses(activeRestaurant.id, selectedZoneId ?? undefined)
      .then((data) => { if (!ignore) setTables(data); })
      .catch((err) => {
        if (ignore) return;
        setError(t("pos.failedLoadTables", "Failed to load tables. Check your connection."));
      });
    return () => { ignore = true; };
  }, [selectedZoneId, open, activeRestaurant, t]);

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

    // Clear previous table's cart before switching.
    resetCart();

    // Empty/paid table: select client-side ONLY. No session is created here, so a
    // mis-tap leaves no orphan open table. The session is minted lazily on the
    // first order submit (PosCartDrawer.handleSubmit) — that's when the table
    // actually becomes "occupied".
    if (table.status !== "occupied" || !table.sessionToken) {
      setSession({
        tableId: table.id,
        tableName: table.name,
        sessionToken: null,
        sessionId: null,
      });
      setOpen(false);
      return;
    }

    // Occupied table: adopt the existing OPEN session and load its history.
    setSession({
      tableId: table.id,
      tableName: table.name,
      sessionToken: table.sessionToken,
      sessionId: table.sessionId,
    });

    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const bill = await getSessionBill(table.sessionToken);
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
      setHistoryError(
        t(
          "pos.failedLoadHistory",
          "Could not load previous orders. Check connection and refresh.",
        ),
      );
    } finally {
      setHistoryLoading(false);
    }

    setOpen(false);
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
            {t('auto.selectTable', 'Select Table')}</Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mb-3">
            {t('auto.chooseATableToStartTaking', 'Choose a table to start taking orders.')}</Dialog.Description>

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
              {t('auto.backToPOS', 'Back to POS —')}{session.tableName}
            </button>
          )}

          {actionError && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-3 p-2 rounded bg-red-50 dark:bg-red-900/20">
              {actionError}
            </p>
          )}

          {forceOpenTarget && (
            <div className="mb-4 p-4 rounded-lg border border-destructive/30 bg-destructive/10">
              <p className="text-sm font-semibold text-foreground mb-2">
                {t('auto.forceOpenConfirmTitle', 'Force open table {{name}}?', { name: forceOpenTarget.name })}
              </p>
              <p className="text-xs text-muted-foreground mb-3">
                {t(
                  'auto.forceOpenConfirmDesc',
                  'The current session will be closed without payment. This cannot be undone.',
                )}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const target = forceOpenTarget;
                    setForceOpenTarget(null);
                    await handleForceOpen(target);
                  }}
                  className="flex-1 py-2.5 rounded-lg bg-destructive text-white font-semibold text-sm min-h-[44px]"
                >
                  {t('auto.confirmForceOpen', 'Yes, Force Open')}
                </button>
                <button
                  type="button"
                  onClick={() => setForceOpenTarget(null)}
                  className="flex-1 py-2.5 rounded-lg bg-card border border-border text-foreground font-medium text-sm min-h-[44px]"
                >
                  {t('auto.cancel', 'Cancel')}
                </button>
              </div>
            </div>
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
                {t('auto.retry', 'Retry')}</button>
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
                          setForceOpenTarget(table);
                        }}
                        className="mt-2 text-xs underline opacity-70 hover:opacity-100 min-h-[44px] flex items-center"
                      >
                        {t('auto.forceOpen', 'Force Open')}</button>
                    )}
                  </button>
                ))}
              </div>
              {tables.length === 0 && (
                <p className="text-center text-muted-foreground py-8">
                  {t('auto.noTablesFoundCreateTables', 'No tables found. Create tables in the dashboard first.')}</p>
              )}
            </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
