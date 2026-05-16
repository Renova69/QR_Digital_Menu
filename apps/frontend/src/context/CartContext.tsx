import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';

// Define the structure of a cart item
interface CartItem {
  cartId: string; // Unique key for the cart entry
  id: string;     // Product ID
  name: string;
  price: number;
  quantity: number;
  selectedOptions: any[];
}

// Define what the CartContext provides
interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  updateItem: (cartId: string, quantity: number, options: any[]) => void;
  removeItem: (cartId: string) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getTotal: () => number;
  tableNumber: string | null;
  setTableNumber: (table: string) => void;
  pruneInvalidItems: (validItemIds: string[]) => number;
}

// Create the context with undefined as default value
const CartContext = createContext<CartContextType | undefined>(undefined);

// Create the provider component
export function CartProvider({ children }: { children: ReactNode }) {
  // Initialize cart items from localStorage (if available)
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const savedItems = localStorage.getItem('cartItems');
      return savedItems ? JSON.parse(savedItems) : [];
    } catch {
      localStorage.removeItem('cartItems');
      return [];
    }
  });

  // Ref to access current items without creating dependency in useCallback
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Initialize table number from localStorage
  const [tableNumber, setTableNumberState] = useState<string | null>(() => {
    return localStorage.getItem('tableNumber') || null;
  });

  // Debounce cart persistence — rapid add/remove coalesces into one write
  const cartSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCartRef = useRef<string | null>(null);

  useEffect(() => {
    const serialized = JSON.stringify(items);
    pendingCartRef.current = serialized;
    if (cartSaveTimerRef.current) clearTimeout(cartSaveTimerRef.current);
    cartSaveTimerRef.current = setTimeout(() => {
      localStorage.setItem('cartItems', serialized);
      pendingCartRef.current = null;
    }, 500);
  }, [items]);

  // Flush pending cart write immediately on unmount
  useEffect(() => {
    return () => {
      if (cartSaveTimerRef.current) clearTimeout(cartSaveTimerRef.current);
      if (pendingCartRef.current !== null) {
        localStorage.setItem('cartItems', pendingCartRef.current);
      }
    };
  }, []);

  // Save table number to localStorage whenever it changes
  useEffect(() => {
    if (tableNumber) {
      localStorage.setItem('tableNumber', tableNumber);
    } else {
      localStorage.removeItem('tableNumber');
    }
  }, [tableNumber]);

  // Add an item to the cart (or increase quantity if already exists)
  const addItem = useCallback((item: CartItem) => {
    // Safety check to ensure we have a cartId
    const cartId = item.cartId || `${item.id}-${Date.now()}`;
    const safeItem = { ...item, cartId };

    setItems(prevItems => {
      const existingItem = prevItems.find(i => i.cartId === cartId);
      if (existingItem) {
        return prevItems.map(i =>
          i.cartId === cartId
            ? { ...i, quantity: (i.quantity || 0) + (safeItem.quantity || 1) }
            : i
        );
      }
      return [...prevItems, safeItem];
    });
  }, []);

  const updateItem = useCallback((cartId: string, quantity: number, options: any[]) => {
    setItems(prevItems =>
      prevItems.map(item =>
        item.cartId === cartId
          ? { ...item, quantity, selectedOptions: options }
          : item
      )
    );
  }, []);

  const removeItem = useCallback((cartId: string) => {
    setItems(prevItems => prevItems.filter(item => item.cartId !== cartId));
  }, []);

  // Clear the entire cart
  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  // Calculate total number of items in cart
  const getItemCount = () => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  };

  // Calculate total price of items in cart
  const getTotal = () => {
    return items.reduce((sum, item) => {
      const selectedOptions = item.selectedOptions || [];
      const optionsTotal = selectedOptions.reduce((optSum: number, opt: any) => optSum + (opt.priceModifier || 0), 0);
      return sum + ((item.price + optionsTotal) * item.quantity);
    }, 0);
  };

  // Set the table number
  const setTableNumber = useCallback((table: string) => {
    setTableNumberState(table);
  }, []);

  // Remove stale cart entries that no longer exist in the current menu dataset
  const pruneInvalidItems = useCallback((validItemIds: string[]) => {
    const validSet = new Set(validItemIds);
    const removedCount = itemsRef.current.filter(item => !validSet.has(item.id)).length;
    if (removedCount > 0) {
      setItems(prevItems => prevItems.filter(item => validSet.has(item.id)));
    }
    return removedCount;
  }, []);

  const value = {
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
  }

  // Provide the cart functionality to children
  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

// Custom hook for easy access to cart context
export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
