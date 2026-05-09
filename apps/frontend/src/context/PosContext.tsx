import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";

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
}

interface PosSession {
  tableId: string;
  tableName: string;
  sessionToken: string | null;
  sessionId: string | null;
}

interface PosContextType {
  items: PosCartItem[];
  addItem: (item: Omit<PosCartItem, "cartId">) => void;
  removeItem: (cartId: string) => void;
  updateQuantity: (cartId: string, qty: number) => void;
  updateNote: (cartId: string, note: string) => void;
  clearCart: () => void;
  session: PosSession | null;
  setSession: (s: PosSession) => void;
  clearSession: () => void;
  getTotal: () => number;
  activeSeat: string;
  setActiveSeat: (seat: string) => void;
  buildSpecialRequests: () => string;
}

const PosContext = createContext<PosContextType | undefined>(undefined);

export function PosProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PosCartItem[]>([]);
  const [session, setSessionState] = useState<PosSession | null>(null);
  const [activeSeat, setActiveSeat] = useState("Seat 1");

  const addItem = useCallback((item: Omit<PosCartItem, "cartId">) => {
    const cartId = crypto.randomUUID();
    setItems((prev) => [...prev, { ...item, cartId }]);
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
    setItems([]);
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

  const buildSpecialRequests = useCallback(() => {
    const grouped = new Map<string, string[]>();
    for (const item of items) {
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

  const value: PosContextType = {
    items,
    addItem,
    removeItem,
    updateQuantity,
    updateNote,
    clearCart,
    session,
    setSession,
    clearSession,
    getTotal,
    activeSeat,
    setActiveSeat,
    buildSpecialRequests,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const context = useContext(PosContext);
  if (context === undefined) {
    throw new Error("usePos must be used within a PosProvider");
  }
  return context;
}
