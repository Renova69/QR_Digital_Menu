import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface PosCartItem {
  cartId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions: Array<{
    optionId: string;
    optionName: string;
    choiceName: string;
    priceModifier: number;
  }>;
  seatNumber: string;
  itemNote: string;
  submitted: boolean;
}

interface PosSession {
  tableId: string;
  tableName: string;
  sessionToken: string | null;
  sessionId: string | null;
}

interface PosContextType {
  items: PosCartItem[];
  addItem: (item: Omit<PosCartItem, "cartId" | "submitted">) => void;
  removeItem: (cartId: string) => void;
  updateQuantity: (cartId: string, qty: number) => void;
  updateNote: (cartId: string, note: string) => void;
  clearCart: () => void;
  resetCart: () => void;
  markAsSubmitted: () => void;
  setHistoryItems: (historyItems: PosCartItem[]) => void;
  session: PosSession | null;
  setSession: (s: PosSession) => void;
  clearSession: () => void;
  getTotal: () => number;
  getPendingTotal: () => number;
  activeSeat: string;
  setActiveSeat: (seat: string) => void;
  buildSpecialRequests: () => string;
}

const PosContext = createContext<PosContextType | undefined>(undefined);

export function PosProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PosCartItem[]>([]);
  const [session, setSessionState] = useState<PosSession | null>(null);
  const [activeSeat, setActiveSeat] = useState("Seat 1");

  const addItem = useCallback((item: Omit<PosCartItem, "cartId" | "submitted">) => {
    const cartId = generateId();
    setItems((prev) => [...prev, { ...item, cartId, submitted: false }]);
  }, []);

  const removeItem = useCallback((cartId: string) => {
    setItems((prev) => prev.filter((i) => i.cartId !== cartId));
  }, []);

  const updateQuantity = useCallback((cartId: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.cartId !== cartId));
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.cartId === cartId ? { ...i, quantity: qty } : i))
    );
  }, []);

  const updateNote = useCallback((cartId: string, note: string) => {
    setItems((prev) =>
      prev.map((i) => (i.cartId === cartId ? { ...i, itemNote: note } : i))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems((prev) => prev.filter((i) => i.submitted));
  }, []);

  const resetCart = useCallback(() => {
    setItems([]);
  }, []);

  const markAsSubmitted = useCallback(() => {
    setItems((prev) =>
      prev.map((i) => (i.submitted ? i : { ...i, submitted: true }))
    );
  }, []);

  const setHistoryItems = useCallback((historyItems: PosCartItem[]) => {
    setItems((prev) => {
      const pending = prev.filter((i) => !i.submitted);
      return [...historyItems, ...pending];
    });
  }, []);

  const setSession = useCallback((s: PosSession) => {
    setSessionState(s);
  }, []);

  const clearSession = useCallback(() => {
    setSessionState(null);
    setItems([]);
    setActiveSeat("Seat 1");
  }, []);

  const getTotal = useCallback(() => {
    return items.reduce((sum, item) => {
      const optionsTotal = item.selectedOptions.reduce(
        (optSum, opt) => optSum + opt.priceModifier,
        0
      );
      return sum + (item.price + optionsTotal) * item.quantity;
    }, 0);
  }, [items]);

  const getPendingTotal = useCallback(() => {
    return items
      .filter((i) => !i.submitted)
      .reduce((sum, item) => {
        const optionsTotal = item.selectedOptions.reduce(
          (optSum, opt) => optSum + opt.priceModifier,
          0
        );
        return sum + (item.price + optionsTotal) * item.quantity;
      }, 0);
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
    return Array.from(grouped.entries())
      .map(([seat, entries]) => `[${seat}] ${entries.join(", ")}`)
      .join(" | ");
  }, [items]);

  // Memoized so POS consumers don't re-render on unrelated parent renders (#F4).
  const value: PosContextType = useMemo(() => ({
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateNote,
    clearCart,
    resetCart,
    markAsSubmitted,
    setHistoryItems,
    session,
    setSession,
    clearSession,
    getTotal,
    getPendingTotal,
    activeSeat,
    setActiveSeat,
    buildSpecialRequests,
  }), [items, addItem, removeItem, updateQuantity, updateNote, clearCart, resetCart, markAsSubmitted, setHistoryItems, session, setSession, clearSession, getTotal, getPendingTotal, activeSeat, buildSpecialRequests]);

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const context = useContext(PosContext);
  if (context === undefined) {
    throw new Error("usePos must be used within a PosProvider");
  }
  return context;
}
