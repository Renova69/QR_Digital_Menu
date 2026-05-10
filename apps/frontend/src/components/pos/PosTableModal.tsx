import { useState, useEffect, useContext } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { getTableStatuses, getOrCreateSession, forceOpenSession, getSessionBill } from "../../lib/api";
import { usePos } from "../../context/PosContext";
import RestaurantContext from "../../context/RestaurantContext";

interface TableStatus {
  id: string;
  name: string;
  status: "empty" | "occupied" | "paid" | "waiting";
  sessionId: string | null;
  orderCount: number;
  totalAmount: number;
  customerNames: string[];
  sessionStatus: string | null;
  updatedAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  empty: "bg-green-100 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-700 dark:text-green-400",
  occupied: "bg-red-100 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-700 dark:text-red-400",
  paid: "bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/30 dark:border-blue-700 dark:text-blue-400",
  waiting: "bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-400",
};

export default function PosTableModal() {
  const restaurantCtx = useContext(RestaurantContext);
  const activeRestaurant = restaurantCtx?.activeRestaurant ?? null;
  const { session, setSession, setHistoryItems, resetCart } = usePos();

  const [tables, setTables] = useState<TableStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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
      setError(null);
      getTableStatuses(activeRestaurant.id)
        .then(setTables)
        .catch(() => setError("Failed to load tables. Check your connection."))
        .finally(() => setLoading(false));
    }
  }, [open, activeRestaurant]);

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
          (order.items ?? []).map((oi: any) => ({
            cartId: oi.id,
            menuItemId: oi.menuItemId ?? "",
            name: oi.menuItem?.name ?? "Unknown item",
            price: oi.menuItem?.price ?? 0,
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
      setActionError("Failed to open session. Try again or use Force Open.");
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
      setActionError("Failed to force open session. Check your connection.");
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
        No restaurant selected.
      </div>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-50" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-xl bg-background p-6 pt-safe md:inset-auto md:top-1/2 md:left-1/2 md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-xl md:bottom-auto">
          <Dialog.Title className="text-lg font-semibold mb-1">
            Select Table
          </Dialog.Title>
          <Dialog.Description className="text-sm text-muted-foreground mb-4">
            Choose a table to start taking orders.
          </Dialog.Description>

          {session && (
            <button
              type="button"
              className="w-full mb-4 py-2 px-4 rounded-lg bg-accent text-accent-foreground font-medium min-h-[44px]"
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
              <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
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
                    .catch(() => setError("Failed to load tables. Check your connection."))
                    .finally(() => setLoading(false));
                }}
                className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm min-h-[44px]"
              >
                Retry
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {tables.map((table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => handleSelect(table)}
                    className={`relative flex flex-col items-center justify-center p-4 rounded-lg border-2 min-h-[80px] transition-none ${STATUS_COLORS[table.status]}`}
                  >
                    <span className="text-lg font-bold">{table.name}</span>
                    <span className="text-xs capitalize">{table.status}</span>
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
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
