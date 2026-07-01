import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import type { MenuTranslationMap } from "../types";

export interface SelectedOption {
  optionId: string;
  optionName: string;
  choiceName: string;
  priceModifier: number;
  translations?: MenuTranslationMap | null;
}

export interface CartItem {
  cartId: string;
  id: string;
  name: string;
  originalName?: string;
  price: number;
  quantity: number;
  selectedOptions: SelectedOption[];
  itemTranslations?: MenuTranslationMap | null;
  rewardPointsPrice?: number;
}

// M-FE-3: localStorage cart is user-editable/corruptible outside the app —
// validate shape beyond "JSON.parse didn't throw" so a malformed payload
// (missing fields, NaN/negative price or quantity) can't reach getTotal().
function isValidSelectedOption(value: unknown): value is SelectedOption {
  if (!value || typeof value !== "object") return false;
  const opt = value as Record<string, unknown>;
  return (
    typeof opt.optionId === "string" &&
    typeof opt.optionName === "string" &&
    typeof opt.choiceName === "string" &&
    typeof opt.priceModifier === "number" &&
    Number.isFinite(opt.priceModifier)
  );
}

function isValidCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.cartId === "string" &&
    item.cartId.length > 0 &&
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.name === "string" &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    item.price >= 0 &&
    typeof item.quantity === "number" &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    Array.isArray(item.selectedOptions) &&
    item.selectedOptions.every(isValidSelectedOption)
  );
}

function loadCartFromStorage(): CartItem[] {
  try {
    const savedItems = localStorage.getItem("cartItems");
    if (!savedItems) return [];
    const parsed = JSON.parse(savedItems);
    if (!Array.isArray(parsed)) {
      localStorage.removeItem("cartItems");
      return [];
    }
    const valid = parsed.filter(isValidCartItem);
    if (valid.length !== parsed.length) {
      // Persist the cleaned list so corrupt entries aren't re-validated (and
      // re-discarded) on every reload.
      localStorage.setItem("cartItems", JSON.stringify(valid));
    }
    return valid;
  } catch {
    localStorage.removeItem("cartItems");
    return [];
  }
}

// Define what the CartContext provides
interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateItem: (
    cartId: string,
    quantity: number,
    options: SelectedOption[],
  ) => void;
  removeItem: (cartId: string) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getTotal: (excludeCartIds?: Set<string>) => number;
  tableNumber: string | null;
  setTableNumber: (table: string) => void;
  pruneInvalidItems: (validItemIds: string[]) => number;
}

// Create the context with undefined as default value
const CartContext = createContext<CartContextType | undefined>(undefined);

// Create the provider component
export function CartProvider({ children }: { children: ReactNode }) {
  // Initialize cart items from localStorage (if available)
  const [items, setItems] = useState<CartItem[]>(loadCartFromStorage);

  // Ref to access current items without creating dependency in useCallback
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Initialize table number from localStorage
  const [tableNumber, setTableNumberState] = useState<string | null>(() => {
    return localStorage.getItem("tableNumber") || null;
  });

  // Debounce cart persistence — rapid add/remove coalesces into one write
  const cartSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCartRef = useRef<string | null>(null);

  useEffect(() => {
    const serialized = JSON.stringify(items);
    pendingCartRef.current = serialized;
    if (cartSaveTimerRef.current) clearTimeout(cartSaveTimerRef.current);
    cartSaveTimerRef.current = setTimeout(() => {
      localStorage.setItem("cartItems", serialized);
      pendingCartRef.current = null;
    }, 100);
  }, [items]);

  // Flush pending cart write immediately on unmount
  useEffect(() => {
    return () => {
      if (cartSaveTimerRef.current) clearTimeout(cartSaveTimerRef.current);
      if (pendingCartRef.current !== null) {
        localStorage.setItem("cartItems", pendingCartRef.current);
      }
    };
  }, []);

  // Save table number to localStorage whenever it changes
  useEffect(() => {
    if (tableNumber) {
      localStorage.setItem("tableNumber", tableNumber);
    } else {
      localStorage.removeItem("tableNumber");
    }
  }, [tableNumber]);

  // Add an item to the cart (or increase quantity if already exists)
  const addItem = useCallback((item: CartItem) => {
    // Safety check to ensure we have a cartId
    const cartId = item.cartId || `${item.id}-${Date.now()}`;
    const safeItem = { ...item, cartId };

    setItems((prevItems) => {
      const existingItem = prevItems.find((i) => i.cartId === cartId);
      if (existingItem) {
        return prevItems.map((i) =>
          i.cartId === cartId
            ? { ...i, quantity: (i.quantity || 0) + (safeItem.quantity || 1) }
            : i,
        );
      }
      return [...prevItems, safeItem];
    });
  }, []);

  const updateItem = useCallback(
    (cartId: string, quantity: number, options: SelectedOption[]) => {
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.cartId === cartId
            ? { ...item, quantity, selectedOptions: options }
            : item,
        ),
      );
    },
    [],
  );

  const removeItem = useCallback((cartId: string) => {
    setItems((prevItems) => prevItems.filter((item) => item.cartId !== cartId));
  }, []);

  // Clear the entire cart
  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  // Calculate total number of items in cart
  const getItemCount = useCallback(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  // Calculate total price of items in cart. Optionally exclude cart entries
  // (e.g. fully redeemed loyalty items) by their cartId.
  const getTotal = useCallback(
    (excludeCartIds?: Set<string>) => {
      const raw = items.reduce((sum, item) => {
        if (excludeCartIds?.has(item.cartId)) return sum;
        const selectedOptions = item.selectedOptions || [];
        const optionsTotal = selectedOptions.reduce(
          (optSum: number, opt: SelectedOption) =>
            optSum + (opt.priceModifier || 0),
          0,
        );
        return sum + (item.price + optionsTotal) * item.quantity;
      }, 0);
      return Math.round(raw * 100) / 100;
    },
    [items],
  );

  // Set the table number
  const setTableNumber = useCallback((table: string) => {
    setTableNumberState(table);
  }, []);

  // Remove stale cart entries that no longer exist in the current menu dataset
  const pruneInvalidItems = useCallback((validItemIds: string[]) => {
    const validSet = new Set(validItemIds);
    const removedCount = itemsRef.current.filter(
      (item) => !validSet.has(item.id),
    ).length;
    if (removedCount > 0) {
      setItems((prevItems) =>
        prevItems.filter((item) => validSet.has(item.id)),
      );
    }
    return removedCount;
  }, []);

  // Memoized so consumers don't re-render on unrelated parent renders (#F4).
  const value = useMemo(
    () => ({
      items,
      addItem,
      updateItem,
      removeItem,
      clearCart,
      getItemCount,
      getTotal,
      tableNumber,
      setTableNumber,
      pruneInvalidItems,
    }),
    [
      items,
      addItem,
      updateItem,
      removeItem,
      clearCart,
      getItemCount,
      getTotal,
      tableNumber,
      setTableNumber,
      pruneInvalidItems,
    ],
  );

  // Provide the cart functionality to children
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

// Custom hook for easy access to cart context
export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
