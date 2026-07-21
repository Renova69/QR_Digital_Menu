import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import {
  getOrdersPage,
  updateOrderStatus as apiUpdateOrderStatus,
} from "../lib/api";
import { revertFailedOrders } from "../lib/orderStatus";
import { useSocket } from "./SocketContext";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { useRestaurantContext } from "./RestaurantContext";
import { useFeature } from "../hooks/useFeature";

// Define order status types
export type OrderStatus =
  | "PENDING_PAYMENT"
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
  servicePointType?: string | null;
  servicePointLabel?: string | null;
  fulfillmentType?: string | null;
  paymentPreference?: string | null;
  status: OrderStatus;
  items: Array<{
    id: string;
    menuItemId: string | null;
    itemName?: string;
    quantity: number;
    unitPrice: number;
    unitPriceWithOptions: number;
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
  loadMoreHistory: () => Promise<void>;
  hasMoreHistory: boolean;
  isLoadingMoreHistory: boolean;
  isOrderUpdating: (orderId: string) => boolean;
  isLoading: boolean;
  error: string | null;
}

// Create the context
const OrderContext = createContext<OrderContextType | undefined>(undefined);

// Create the provider component
export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingOrderIds, setPendingOrderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyTotalPages, setHistoryTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const ordersRef = useRef<Order[]>([]);
  const refreshVersion = useRef(0);
  const mutationVersions = useRef(new Map<string, number>());
  const { socket, isConnected } = useSocket();
  const { user, isAuthenticated } = useAuth();
  const { activeRestaurant } = useRestaurantContext();
  const canReceiveOrders = useFeature("orders:receive");
  const queryClient = useQueryClient();
  const role = user?.role?.toUpperCase();
  const canAccessOrders =
    canReceiveOrders &&
    isAuthenticated &&
    !!role &&
    ["OWNER", "MANAGER", "WAITER", "KITCHEN", "STAFF"].includes(role);

  const replaceOrders = useCallback((next: Order[]) => {
    ordersRef.current = next;
    setOrders(next);
  }, []);

  const updateOrders = useCallback((updater: (current: Order[]) => Order[]) => {
    const next = updater(ordersRef.current);
    ordersRef.current = next;
    setOrders(next);
  }, []);

  const setOrdersPending = useCallback(
    (orderIds: string[], pending: boolean) => {
      setPendingOrderIds((current) => {
        const next = new Set(current);
        for (const orderId of orderIds) {
          if (pending) next.add(orderId);
          else next.delete(orderId);
        }
        return next;
      });
    },
    [],
  );

  // Function to refresh orders from API
  const refreshOrders = useCallback(async () => {
    const restaurantId = activeRestaurant?.id;
    const version = ++refreshVersion.current;
    if (!canAccessOrders || !restaurantId) {
      replaceOrders([]);
      setError(null);
      setIsLoading(false);
      setIsLoadingMoreHistory(false);
      setHistoryPage(0);
      setHistoryTotalPages(0);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const activeOrders: Order[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await getOrdersPage<Order>({
          restaurantId,
          statuses: ["PENDING_PAYMENT", "NEW", "IN_PROGRESS", "SERVED"],
          page,
          limit: 100,
        });
        activeOrders.push(...response.data);
        totalPages = response.totalPages;
        page += 1;
      } while (page <= totalPages);

      const history = await getOrdersPage<Order>({
        restaurantId,
        statuses: ["COMPLETED", "CANCELED"],
        page: 1,
        limit: 50,
      });

      if (refreshVersion.current !== version) return;
      replaceOrders(
        [...activeOrders, ...history.data].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
      setHistoryPage(history.page);
      setHistoryTotalPages(history.totalPages);
    } catch (error) {
      console.error("Failed to fetch orders:", error);
      if (refreshVersion.current === version) setError("orders.fetchFailed");
    } finally {
      if (refreshVersion.current === version) setIsLoading(false);
    }
  }, [activeRestaurant?.id, canAccessOrders, replaceOrders]);

  const loadMoreHistory = useCallback(async () => {
    const restaurantId = activeRestaurant?.id;
    const nextPage = historyPage + 1;
    const version = refreshVersion.current;
    if (
      !canAccessOrders ||
      !restaurantId ||
      isLoadingMoreHistory ||
      nextPage > historyTotalPages
    ) {
      return;
    }

    setIsLoadingMoreHistory(true);
    setError(null);
    try {
      const response = await getOrdersPage<Order>({
        restaurantId,
        statuses: ["COMPLETED", "CANCELED"],
        page: nextPage,
        limit: 50,
      });
      if (refreshVersion.current !== version) return;
      updateOrders((current) => {
        const byId = new Map(current.map((order) => [order.id, order]));
        for (const order of response.data) byId.set(order.id, order);
        return [...byId.values()].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      });
      setHistoryPage(response.page);
      setHistoryTotalPages(response.totalPages);
    } catch (loadError) {
      console.error("Failed to fetch order history:", loadError);
      if (refreshVersion.current === version) setError("orders.fetchFailed");
    } finally {
      if (refreshVersion.current === version) setIsLoadingMoreHistory(false);
    }
  }, [
    activeRestaurant?.id,
    canAccessOrders,
    historyPage,
    historyTotalPages,
    isLoadingMoreHistory,
    updateOrders,
  ]);

  // Optimistic update — mutate local state immediately, revert on error.
  // The socket `orderStatusChanged` event triggers refreshOrders() as
  // authoritative sync, so no manual refetch is needed here.
  const updateOrderStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      const version = (mutationVersions.current.get(orderId) ?? 0) + 1;
      mutationVersions.current.set(orderId, version);
      const previousOrder = ordersRef.current.find(
        (order) => order.id === orderId,
      );
      setOrdersPending([orderId], true);
      updateOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status } : order,
        ),
      );
      try {
        await apiUpdateOrderStatus(orderId, status);
        if (mutationVersions.current.get(orderId) === version) {
          await refreshOrders();
        }
      } catch (error) {
        // M-FE-2: revert only this order via a functional update, not the
        // whole captured snapshot — a blind `setOrders(previous)` would erase
        // any intervening socket updates to other orders.
        if (
          mutationVersions.current.get(orderId) === version &&
          previousOrder
        ) {
          updateOrders((current) =>
            current.map((order) =>
              order.id === orderId
                ? { ...order, status: previousOrder.status }
                : order,
            ),
          );
          await refreshOrders();
        }
        console.error("Failed to update order status:", error);
        throw error;
      } finally {
        if (mutationVersions.current.get(orderId) === version) {
          mutationVersions.current.delete(orderId);
          setOrdersPending([orderId], false);
        }
      }
    },
    [refreshOrders, setOrdersPending, updateOrders],
  );

  const batchUpdateOrderStatus = useCallback(
    async (orderIds: string[], status: OrderStatus) => {
      // M-FE-6: matches the guard `refreshOrders` already applies — UI-layer
      // consistency only; the server remains the real authorization boundary.
      if (!canAccessOrders) return;

      const previous = ordersRef.current;
      const idSet = new Set(orderIds);
      const versions = new Map(
        orderIds.map((orderId) => {
          const version = (mutationVersions.current.get(orderId) ?? 0) + 1;
          mutationVersions.current.set(orderId, version);
          return [orderId, version] as const;
        }),
      );
      setOrdersPending(orderIds, true);
      updateOrders((current) =>
        current.map((order) =>
          idSet.has(order.id) ? { ...order, status } : order,
        ),
      );

      // Settle every call independently — a single failure must not roll back the
      // orders that the server accepted (the old Promise.all reverted ALL of them
      // even though some had already changed server-side).
      const results = await Promise.allSettled(
        orderIds.map((id) => apiUpdateOrderStatus(id, status)),
      );
      const failedIds = orderIds.filter(
        (orderId, index) =>
          results[index].status === "rejected" &&
          mutationVersions.current.get(orderId) === versions.get(orderId),
      );

      if (failedIds.length > 0) {
        // Revert only the orders that failed; keep the successful ones updated.
        updateOrders((current) =>
          revertFailedOrders(current, previous, failedIds),
        );
      }

      await refreshOrders();
      const completedIds: string[] = [];
      for (const orderId of orderIds) {
        if (mutationVersions.current.get(orderId) === versions.get(orderId)) {
          mutationVersions.current.delete(orderId);
          completedIds.push(orderId);
        }
      }
      setOrdersPending(completedIds, false);

      if (failedIds.length > 0) {
        const firstRejection = results.find(
          (r): r is PromiseRejectedResult => r.status === "rejected",
        );
        console.error(
          "Failed to batch update order status:",
          firstRejection?.reason,
        );
        throw firstRejection?.reason ?? new Error("Batch order update failed");
      }
    },
    [canAccessOrders, refreshOrders, setOrdersPending, updateOrders],
  );

  // Initial load when a staff/owner session becomes available.
  useEffect(() => {
    replaceOrders([]);
    setHistoryPage(0);
    setHistoryTotalPages(0);
    void refreshOrders();
  }, [activeRestaurant?.id, refreshOrders, replaceOrders]);

  // Socket listeners only refresh in response to order events.
  useEffect(() => {
    const restaurantId = activeRestaurant?.id;
    if (!canAccessOrders || !socket || !isConnected || !restaurantId) return;
    socket.emit("joinRestaurantOrdersRoom", restaurantId);
    // Catch up on every (re)connect: a socket drop (network blip, laptop sleep)
    // otherwise misses orders created while disconnected until the next live
    // event — a live KDS/dashboard could silently skip a ticket. This effect
    // re-runs when isConnected flips true, so a fresh fetch closes that gap.
    void refreshOrders();

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

  const value = useMemo(
    () => ({
      orders,
      refreshOrders,
      updateOrderStatus,
      batchUpdateOrderStatus,
      loadMoreHistory,
      hasMoreHistory: historyPage < historyTotalPages,
      isLoadingMoreHistory,
      isOrderUpdating: (orderId: string) => pendingOrderIds.has(orderId),
      isLoading,
      error,
    }),
    [
      batchUpdateOrderStatus,
      error,
      historyPage,
      historyTotalPages,
      isLoading,
      isLoadingMoreHistory,
      loadMoreHistory,
      orders,
      pendingOrderIds,
      refreshOrders,
      updateOrderStatus,
    ],
  );

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
