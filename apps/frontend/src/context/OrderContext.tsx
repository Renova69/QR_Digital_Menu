import {
  createContext,
  useCallback,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  getOrders,
  updateOrderStatus as apiUpdateOrderStatus,
} from "../lib/api";
import { revertFailedOrders } from "../lib/orderStatus";
import { useSocket } from "./SocketContext";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { useRestaurantContext } from "./RestaurantContext";

// Define order status types
export type OrderStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "SERVED"
  | "CANCELED"
  | "COMPLETED";

// M-FE-5: matches backend OrderItemOptionDto — the persisted shape of an
// order item's chosen option, not the cart's transient SelectedOption.
interface OrderItemSelectedOption {
  optionId: string;
  optionName: string;
  choiceName: string;
  priceModifier: number;
}

// Define order interface
interface Order {
  id: string;
  customerName: string;
  customerPhone?: string;
  tableId: string;
  tableName?: string | null;
  status: OrderStatus;
  items: Array<{
    id: string;
    menuItemId: string | null;
    itemName?: string;
    quantity: number;
    selectedOptions: OrderItemSelectedOption[];
    menuItem: {
      id: string;
      name: string;
      price: number;
      description?: string;
    } | null;
  }>;
  totalPrice: number;
  specialRequests?: string;
  source?: "CUSTOMER" | "POS";
  staffName?: string | null;
  staff?: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null;
  createdAt: string;
  updatedAt: string;
  tableSession?: {
    status: string;
  };
}

// Define context type
interface OrderContextType {
  orders: Order[];
  refreshOrders: () => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  batchUpdateOrderStatus: (
    orderIds: string[],
    status: OrderStatus,
  ) => Promise<void>;
}

// Create the context
const OrderContext = createContext<OrderContextType | undefined>(undefined);

// Create the provider component
export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const { socket, isConnected } = useSocket();
  const { user, isAuthenticated } = useAuth();
  const { activeRestaurant } = useRestaurantContext();
  const queryClient = useQueryClient();
  const role = user?.role?.toUpperCase();
  const canAccessOrders =
    isAuthenticated &&
    !!role &&
    ["OWNER", "MANAGER", "WAITER", "KITCHEN", "STAFF"].includes(role);

  // Function to refresh orders from API
  const refreshOrders = useCallback(async () => {
    if (!canAccessOrders) {
      setOrders([]);
      return;
    }

    try {
      const data = await getOrders();
      setOrders(data);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
    }
  }, [canAccessOrders]);

  // Optimistic update — mutate local state immediately, revert on error.
  // The socket `orderStatusChanged` event triggers refreshOrders() as
  // authoritative sync, so no manual refetch is needed here.
  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const previous = orders;
    setOrders((cur) =>
      cur.map((o) => (o.id === orderId ? { ...o, status } : o)),
    );
    try {
      await apiUpdateOrderStatus(orderId, status);
    } catch (error) {
      // M-FE-2: revert only this order via a functional update, not the
      // whole captured snapshot — a blind `setOrders(previous)` would erase
      // any intervening socket updates to other orders.
      setOrders((cur) => revertFailedOrders(cur, previous, [orderId]));
      console.error("Failed to update order status:", error);
      throw error;
    }
  };

  const batchUpdateOrderStatus = async (
    orderIds: string[],
    status: OrderStatus,
  ) => {
    // M-FE-6: matches the guard `refreshOrders` already applies — UI-layer
    // consistency only; the server remains the real authorization boundary.
    if (!canAccessOrders) return;

    const previous = orders;
    const idSet = new Set(orderIds);
    setOrders((cur) =>
      cur.map((o) => (idSet.has(o.id) ? { ...o, status } : o)),
    );

    // Settle every call independently — a single failure must not roll back the
    // orders that the server accepted (the old Promise.all reverted ALL of them
    // even though some had already changed server-side).
    const results = await Promise.allSettled(
      orderIds.map((id) => apiUpdateOrderStatus(id, status)),
    );
    const failedIds = orderIds.filter(
      (_, i) => results[i].status === "rejected",
    );

    if (failedIds.length > 0) {
      // Revert only the orders that failed; keep the successful ones updated.
      setOrders((cur) => revertFailedOrders(cur, previous, failedIds));
      // Reconcile against authoritative server state in case the socket sync is
      // delayed or dropped after a partial failure.
      void refreshOrders();
      const firstRejection = results.find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      console.error(
        "Failed to batch update order status:",
        firstRejection?.reason,
      );
      throw firstRejection?.reason ?? new Error("Batch order update failed");
    }
  };

  // Initial load when a staff/owner session becomes available.
  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  // Socket listeners only refresh in response to order events.
  useEffect(() => {
    const restaurantId = activeRestaurant?.id;
    if (!canAccessOrders || !socket || !isConnected || !restaurantId) return;
    socket.emit("joinRestaurantOrdersRoom", restaurantId);

    const handleNewOrder = () => {
      // Small chime for new UI event
      const audio = new Audio("/notification.mp3");
      audio.play().catch(() => {}); // Catch autoplay restrictions

      // We can either append to state or just refresh fully
      refreshOrders();
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    };

    const handleOrderStatusChanged = () => {
      // Refresh or perfectly mutate state
      refreshOrders();
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    };

    socket.on("newOrder", handleNewOrder);
    socket.on("orderStatusChanged", handleOrderStatusChanged);

    return () => {
      socket.off("newOrder", handleNewOrder);
      socket.off("orderStatusChanged", handleOrderStatusChanged);
      socket.emit("leaveRestaurantOrdersRoom", restaurantId);
    };
  }, [
    activeRestaurant?.id,
    canAccessOrders,
    socket,
    isConnected,
    refreshOrders,
    queryClient,
  ]);

  const value = {
    orders,
    refreshOrders,
    updateOrderStatus,
    batchUpdateOrderStatus,
  };

  return (
    <OrderContext.Provider value={value}>{children}</OrderContext.Provider>
  );
}

// Custom hook for easier access to order context
export function useOrders() {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error("useOrders must be used within an OrderProvider");
  }
  return context;
}
