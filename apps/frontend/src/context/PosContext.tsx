import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import {
  createPosLocalSessionId,
  type QueuedPosOrder,
} from "../lib/posOfflineOrders";
import type { SessionBill } from "../lib/api";

const STORAGE_KEY = "posCartDraft";
const MAX_SPECIAL_REQUESTS_LEN = 2000;
const DEFAULT_ACTIVE_SEAT = "Shared";
const RESTORABLE_ACTIVE_SEATS = new Set(["Seat 2", "Seat 3", "Shared"]);

function generateId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function loadDraft(): {
  items: PosCartItem[];
  session: PosSession | null;
  activeSeat: string;
} | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (draft && Array.isArray(draft.items)) {
      if (draft.session && !draft.session.localSessionId) {
        draft.session.localSessionId =
          draft.session.sessionId ?? createPosLocalSessionId();
      }
      draft.activeSeat =
        typeof draft.activeSeat === "string" &&
        RESTORABLE_ACTIVE_SEATS.has(draft.activeSeat)
          ? draft.activeSeat
          : DEFAULT_ACTIVE_SEAT;
      return draft;
    }
    return null;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveDraft(
  items: PosCartItem[],
  session: PosSession | null,
  activeSeat: string,
) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items, session, activeSeat }),
    );
  } catch {
    /* quota exceeded — non-critical */
  }
}

function clearDraft() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export interface PosCartItem {
  cartId: string;
  menuItemId: string;
  serverOrderItemId?: string;
  name: string;
  price: number;
  quantity: number;
  paidQuantity?: number;
  remainingQuantity?: number;
  selectedOptions: Array<{
    optionId: string;
    optionName: string;
    choiceName: string;
    priceModifier: number;
  }>;
  seatNumber: string;
  itemNote: string;
  submitted: boolean;
  syncState?: "sent" | "queued" | "conflict";
  queuedOrderId?: string;
}

interface PosSession {
  tableId: string;
  tableName: string;
  sessionToken: string | null;
  sessionId: string | null;
  localSessionId: string;
}

type PosSessionInput = Omit<PosSession, "localSessionId"> & {
  localSessionId?: string;
};

interface PosContextType {
  items: PosCartItem[];
  addItem: (item: Omit<PosCartItem, "cartId" | "submitted">) => void;
  removeItem: (cartId: string) => void;
  updateQuantity: (cartId: string, qty: number) => void;
  updateNote: (cartId: string, note: string) => void;
  clearCart: () => void;
  resetCart: () => void;
  markAsSubmitted: (cartIds?: string[]) => void;
  markAsQueued: (clientOrderId: string, cartIds: string[]) => void;
  markQueuedAsSubmitted: (clientOrderId: string) => void;
  markQueuedAsConflict: (clientOrderId: string) => void;
  restoreQueuedOrder: (clientOrderId: string) => void;
  loadQueuedOrderForEdit: (order: QueuedPosOrder) => void;
  removeQueuedOrderItems: (clientOrderId: string) => void;
  setHistoryItems: (historyItems: PosCartItem[]) => void;
  sessionBill: SessionBill | null;
  setSessionBill: (bill: SessionBill | null) => void;
  session: PosSession | null;
  setSession: (s: PosSessionInput) => void;
  adoptServerSession: (
    localSessionId: string,
    sessionId: string,
    sessionToken: string | null,
  ) => void;
  clearSession: () => void;
  getTotal: () => number;
  getPendingTotal: () => number;
  activeSeat: string;
  setActiveSeat: (seat: string) => void;
  buildSpecialRequests: () => string;
  historyLoading: boolean;
  setHistoryLoading: (v: boolean) => void;
  historyError: string | null;
  setHistoryError: (v: string | null) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  categoryFilter: string | null;
  setCategoryFilter: (v: string | null) => void;
}

const PosContext = createContext<PosContextType | undefined>(undefined);

export function PosProvider({ children }: { children: ReactNode }) {
  // Lazy init reads sessionStorage on every mount — NOT a module-level const.
  // A frozen module snapshot meant SPA re-login never restored the draft and
  // refresh-restore was inconsistent (H2).
  const [items, setItems] = useState<PosCartItem[]>(
    () => loadDraft()?.items ?? [],
  );
  const [session, setSessionState] = useState<PosSession | null>(
    () => loadDraft()?.session ?? null,
  );
  const [activeSeat, setActiveSeat] = useState(
    () => loadDraft()?.activeSeat ?? DEFAULT_ACTIVE_SEAT,
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [sessionBill, setSessionBill] = useState<SessionBill | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  // Persist cart draft to sessionStorage so a refresh / idle-timeout
  // doesn't lose the waiter's work.
  useEffect(() => {
    if (items.length > 0 || session) {
      saveDraft(items, session, activeSeat);
    } else {
      clearDraft();
    }
  }, [items, session, activeSeat]);

  const clearSession = useCallback(() => {
    setSessionState(null);
    setItems([]);
    setActiveSeat(DEFAULT_ACTIVE_SEAT);
    setHistoryLoading(false);
    setHistoryError(null);
    setSessionBill(null);
    clearDraft();
  }, []);

  const addItem = useCallback(
    (item: Omit<PosCartItem, "cartId" | "submitted">) => {
      const cartId = generateId();
      setItems((prev) => [...prev, { ...item, cartId, submitted: false }]);
    },
    [],
  );

  const removeItem = useCallback((cartId: string) => {
    setItems((prev) => prev.filter((i) => i.cartId !== cartId));
  }, []);

  const updateQuantity = useCallback((cartId: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.cartId !== cartId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.cartId === cartId ? { ...i, quantity: qty } : i)),
    );
  }, []);

  const updateNote = useCallback((cartId: string, note: string) => {
    setItems((prev) =>
      prev.map((i) => (i.cartId === cartId ? { ...i, itemNote: note } : i)),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.submitted));
  }, []);

  const resetCart = useCallback(() => {
    setItems([]);
  }, []);

  const markAsSubmitted = useCallback((cartIds?: string[]) => {
    const selectedIds = cartIds ? new Set(cartIds) : null;
    setItems((prev) =>
      prev.map((item) =>
        !item.submitted && (!selectedIds || selectedIds.has(item.cartId))
          ? {
              ...item,
              submitted: true,
              syncState: "sent",
              queuedOrderId: undefined,
            }
          : item,
      ),
    );
  }, []);

  const markAsQueued = useCallback(
    (clientOrderId: string, cartIds: string[]) => {
      const selectedIds = new Set(cartIds);
      setItems((prev) =>
        prev.map((item) =>
          !item.submitted && selectedIds.has(item.cartId)
            ? {
                ...item,
                submitted: true,
                syncState: "queued",
                queuedOrderId: clientOrderId,
              }
            : item,
        ),
      );
    },
    [],
  );

  const markQueuedAsSubmitted = useCallback((clientOrderId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.queuedOrderId === clientOrderId
          ? {
              ...item,
              submitted: true,
              syncState: "sent",
              queuedOrderId: undefined,
            }
          : item,
      ),
    );
  }, []);

  const markQueuedAsConflict = useCallback((clientOrderId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.queuedOrderId === clientOrderId
          ? { ...item, syncState: "conflict" }
          : item,
      ),
    );
  }, []);

  const restoreQueuedOrder = useCallback((clientOrderId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.queuedOrderId === clientOrderId
          ? {
              ...item,
              submitted: false,
              syncState: undefined,
              queuedOrderId: undefined,
            }
          : item,
      ),
    );
  }, []);

  const loadQueuedOrderForEdit = useCallback(
    (order: QueuedPosOrder) => {
      const isCurrentSession = session?.localSessionId === order.localSessionId;
      setSessionState({
        tableId: order.tableId,
        tableName: order.tableName,
        sessionToken: null,
        sessionId: order.payload.posSubmission.expectedTableSessionId,
        localSessionId: order.localSessionId,
      });
      setItems((current) => {
        if (order.cartItems?.length) {
          const retained = isCurrentSession
            ? current.filter(
                (item) => item.queuedOrderId !== order.clientOrderId,
              )
            : [];
          const editable = order.cartItems.map((item) => ({
            ...item,
            submitted: false,
            syncState: undefined,
            queuedOrderId: undefined,
          }));
          return [...retained, ...editable];
        }
        if (!isCurrentSession) return [];
        return current.map((item) =>
          item.queuedOrderId === order.clientOrderId
            ? {
                ...item,
                submitted: false,
                syncState: undefined,
                queuedOrderId: undefined,
              }
            : item,
        );
      });
      setActiveSeat(DEFAULT_ACTIVE_SEAT);
      setHistoryLoading(false);
      setHistoryError(null);
      setSessionBill(null);
    },
    [session?.localSessionId],
  );

  const removeQueuedOrderItems = useCallback((clientOrderId: string) => {
    setItems((prev) =>
      prev.filter((item) => item.queuedOrderId !== clientOrderId),
    );
  }, []);

  const setHistoryItems = useCallback((historyItems: PosCartItem[]) => {
    setItems((prev) => {
      const pending = prev.filter((i) => !i.submitted);
      return [...historyItems, ...pending];
    });
  }, []);

  const setSession = useCallback((s: PosSessionInput) => {
    setSessionBill(null);
    setSessionState({
      ...s,
      localSessionId:
        s.localSessionId ?? s.sessionId ?? createPosLocalSessionId(),
    });
  }, []);

  const adoptServerSession = useCallback(
    (
      localSessionId: string,
      sessionId: string,
      sessionToken: string | null,
    ) => {
      setSessionBill(null);
      setSessionState((current) =>
        current?.localSessionId === localSessionId
          ? { ...current, sessionId, sessionToken }
          : current,
      );
    },
    [],
  );

  const getTotal = useCallback(() => {
    const total = items.reduce((sum, item) => {
      const optionsTotal = item.selectedOptions.reduce(
        (optSum, opt) => optSum + opt.priceModifier,
        0,
      );
      return sum + (item.price + optionsTotal) * item.quantity;
    }, 0);
    return Math.round(total * 100) / 100;
  }, [items]);

  const getPendingTotal = useCallback(() => {
    const total = items
      .filter((i) => !i.submitted)
      .reduce((sum, item) => {
        const optionsTotal = item.selectedOptions.reduce(
          (optSum, opt) => optSum + opt.priceModifier,
          0,
        );
        return sum + (item.price + optionsTotal) * item.quantity;
      }, 0);
    return Math.round(total * 100) / 100;
  }, [items]);

  const buildSpecialRequests = useCallback(() => {
    const grouped = new Map<string, string[]>();
    for (const item of items) {
      if (item.submitted) continue;
      const seat = item.seatNumber || "Shared";
      if (!grouped.has(seat)) grouped.set(seat, []);
      let entry = item.name;
      if (item.itemNote) entry += `: ${item.itemNote}`;
      if (item.quantity > 1) entry += ` x${item.quantity}`;
      grouped.get(seat)!.push(entry);
    }
    const out = Array.from(grouped.entries())
      .map(([seat, entries]) => `[${seat}] ${entries.join(", ")}`)
      .join(" | ");
    // Backend enforces @MaxLength(2000) on specialRequests. A large table can
    // overflow the auto-generated string — clamp so the order doesn't 400 (M1).
    return out.length > MAX_SPECIAL_REQUESTS_LEN
      ? out.slice(0, MAX_SPECIAL_REQUESTS_LEN)
      : out;
  }, [items]);

  // Memoized so POS consumers don't re-render on unrelated parent renders (#F4).
  const value: PosContextType = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      updateQuantity,
      updateNote,
      clearCart,
      resetCart,
      markAsSubmitted,
      markAsQueued,
      markQueuedAsSubmitted,
      markQueuedAsConflict,
      restoreQueuedOrder,
      loadQueuedOrderForEdit,
      removeQueuedOrderItems,
      setHistoryItems,
      sessionBill,
      setSessionBill,
      session,
      setSession,
      adoptServerSession,
      clearSession,
      getTotal,
      getPendingTotal,
      activeSeat,
      setActiveSeat,
      buildSpecialRequests,
      historyLoading,
      setHistoryLoading,
      historyError,
      setHistoryError,
      searchQuery,
      setSearchQuery,
      categoryFilter,
      setCategoryFilter,
    }),
    [
      items,
      addItem,
      removeItem,
      updateQuantity,
      updateNote,
      clearCart,
      resetCart,
      markAsSubmitted,
      markAsQueued,
      markQueuedAsSubmitted,
      markQueuedAsConflict,
      restoreQueuedOrder,
      loadQueuedOrderForEdit,
      removeQueuedOrderItems,
      setHistoryItems,
      sessionBill,
      session,
      setSession,
      adoptServerSession,
      clearSession,
      getTotal,
      getPendingTotal,
      activeSeat,
      buildSpecialRequests,
      historyLoading,
      historyError,
      searchQuery,
      categoryFilter,
    ],
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const context = useContext(PosContext);
  if (context === undefined) {
    throw new Error("usePos must be used within a PosProvider");
  }
  return context;
}
