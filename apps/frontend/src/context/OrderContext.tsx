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
  MAX_BULK_ORDER_STATUS_UPDATES,
  bulkUpdateOrderStatus as apiBulkUpdateOrderStatus,
  getOrdersPage,
  updateOrderStatus as apiUpdateOrderStatus,
} from "../lib/api";
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

type OrderStatusUpdate = {
  id: string;
  status: OrderStatus;
  updatedAt?: string;
};

const TERMINAL_ORDER_STATUSES = new Set<OrderStatus>(["COMPLETED", "CANCELED"]);
const ORDER_HISTORY_PAGE_SIZE = 50;

const applyOrderStatusUpdate = (
  order: Order,
  update: OrderStatusUpdate,
): Order => {
  if (update.updatedAt) {
    const currentUpdatedAt = Date.parse(order.updatedAt);
    const nextUpdatedAt = Date.parse(update.updatedAt);
    if (
      Number.isFinite(currentUpdatedAt) &&
      Number.isFinite(nextUpdatedAt) &&
      nextUpdatedAt < currentUpdatedAt
    ) {
      return order;
    }
  }
  return { ...order, ...update };
};

// Define context type
interface OrderContextType {
  orders: Order[];
  refreshOrders: () => Promise<void>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  batchUpdateOrderStatus: (
    orderIds: string[],
    fromStatus: OrderStatus,
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
  const historyPageRef = useRef(0);
  const refreshVersion = useRef(0);
  const mutationVersions = useRef(new Map<string, number>());
  const { socket, isConnected } = useSocket();
  const needsSocketCatchup = useRef(!isConnected);
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

  const syncHistoryWindowFromLoadedOrders = useCallback(() => {
    const loadedHistory = ordersRef.current
      .filter((order) => TERMINAL_ORDER_STATUSES.has(order.status))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    const loadedHistoryCount = loadedHistory.length;
    setHistoryTotalPages((totalPages) =>
      Math.max(
        totalPages,
        Math.ceil(loadedHistoryCount / ORDER_HISTORY_PAGE_SIZE),
      ),
    );

    const loadedHistoryLimit = historyPageRef.current * ORDER_HISTORY_PAGE_SIZE;
    if (loadedHistoryLimit === 0 || loadedHistoryCount <= loadedHistoryLimit) {
      return;
    }

    const retainedHistoryIds = new Set(
      loadedHistory.slice(0, loadedHistoryLimit).map((order) => order.id),
    );
    updateOrders((current) =>
      current.filter(
        (order) =>
          !TERMINAL_ORDER_STATUSES.has(order.status) ||
          retainedHistoryIds.has(order.id),
      ),
    );
  }, [updateOrders]);

  const mergeOrderStatusUpdates = useCallback(
    (updates: OrderStatusUpdate[]) => {
      const byId = new Map(updates.map((update) => [update.id, update]));
      updateOrders((current) =>
        current.map((order) => {
          const update = byId.get(order.id);
          return update ? applyOrderStatusUpdate(order, update) : order;
        }),
      );
    },
    [updateOrders],
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
      historyPageRef.current = 0;
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
        limit: ORDER_HISTORY_PAGE_SIZE,
      });

      if (refreshVersion.current !== version) return;
      replaceOrders(
        [...activeOrders, ...history.data].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
      historyPageRef.current = history.page;
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
        limit: ORDER_HISTORY_PAGE_SIZE,
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
      historyPageRef.current = response.page;
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

  // Optimistic update — reconcile from the response/socket timestamp and
  // revert only when no newer authoritative update arrived in the meantime.
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
        const updated = (await apiUpdateOrderStatus(orderId, status)) as {
          id: string;
          status: OrderStatus;
          updatedAt?: string;
        };
        if (mutationVersions.current.get(orderId) === version) {
          const addsTerminalOrder =
            previousOrder &&
            !TERMINAL_ORDER_STATUSES.has(previousOrder.status) &&
            TERMINAL_ORDER_STATUSES.has(updated.status);
          updateOrders((current) =>
            current.map((order) =>
              order.id === orderId
                ? applyOrderStatusUpdate(order, updated)
                : order,
            ),
          );
          if (
            addsTerminalOrder &&
            ordersRef.current.some(
              (order) =>
                order.id === orderId &&
                TERMINAL_ORDER_STATUSES.has(order.status),
            )
          ) {
            syncHistoryWindowFromLoadedOrders();
          }
        }
      } catch (error) {
        // M-FE-2: revert only this order via a functional update, not the
        // whole captured snapshot — a blind `setOrders(previous)` would erase
        // any intervening socket updates to other orders.
        if (mutationVersions.current.get(orderId) === version) {
          if (previousOrder) {
            updateOrders((current) =>
              current.map((order) =>
                order.id === orderId &&
                order.updatedAt === previousOrder.updatedAt
                  ? { ...order, status: previousOrder.status }
                  : order,
              ),
            );
          }
          // A transport error does not prove that the server rejected the
          // mutation; it may have committed before the response was lost.
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
    [
      refreshOrders,
      setOrdersPending,
      syncHistoryWindowFromLoadedOrders,
      updateOrders,
    ],
  );

  const batchUpdateOrderStatus = useCallback(
    async (
      orderIds: string[],
      fromStatus: OrderStatus,
      status: OrderStatus,
    ) => {
      // M-FE-6: matches the guard `refreshOrders` already applies — UI-layer
      // consistency only; the server remains the real authorization boundary.
      const restaurantId = activeRestaurant?.id;
      if (!canAccessOrders || !restaurantId || orderIds.length === 0) return;

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

      const chunks: string[][] = [];
      for (
        let index = 0;
        index < orderIds.length;
        index += MAX_BULK_ORDER_STATUS_UPDATES
      ) {
        chunks.push(
          orderIds.slice(index, index + MAX_BULK_ORDER_STATUS_UPDATES),
        );
      }

      let partialFailure: unknown = null;
      let needsReconciliation = false;
      try {
        const results = await Promise.allSettled(
          chunks.map((chunk) =>
            apiBulkUpdateOrderStatus(restaurantId, chunk, fromStatus, status),
          ),
        );
        const updatedById = new Map<
          string,
          { status: OrderStatus; updatedAt: string }
        >();
        const failedById = new Map<
          string,
          { currentStatus: OrderStatus; updatedAt: string }
        >();
        const requestFailedIds = new Set<string>();

        results.forEach((result, index) => {
          const chunk = chunks[index];
          if (result.status === "rejected") {
            needsReconciliation = true;
            partialFailure ??=
              result.reason ?? new Error("Bulk order request failed");
            chunk.forEach((id) => requestFailedIds.add(id));
            return;
          }

          const reportedIds = new Set<string>();
          let missingReport = false;
          result.value.updated.forEach((order) => {
            reportedIds.add(order.id);
            updatedById.set(order.id, {
              status: order.status as OrderStatus,
              updatedAt: order.updatedAt,
            });
          });
          result.value.failed.forEach((failure) => {
            reportedIds.add(failure.id);
            failedById.set(failure.id, {
              currentStatus: failure.currentStatus as OrderStatus,
              updatedAt: failure.updatedAt,
            });
          });
          chunk.forEach((id) => {
            if (!reportedIds.has(id)) {
              needsReconciliation = true;
              missingReport = true;
              requestFailedIds.add(id);
            }
          });
          if (result.value.failed.length > 0 || missingReport) {
            partialFailure ??= new Error(
              "Some orders changed before the bulk move completed",
            );
          }
        });

        const previousById = new Map(
          previous.map((order) => [order.id, order]),
        );
        updateOrders((current) =>
          current.map((order) => {
            if (
              !idSet.has(order.id) ||
              mutationVersions.current.get(order.id) !== versions.get(order.id)
            ) {
              return order;
            }
            const updated = updatedById.get(order.id);
            if (updated) {
              return applyOrderStatusUpdate(order, {
                id: order.id,
                ...updated,
              });
            }
            const failure = failedById.get(order.id);
            if (failure) {
              return applyOrderStatusUpdate(order, {
                id: order.id,
                status: failure.currentStatus,
                updatedAt: failure.updatedAt,
              });
            }
            if (requestFailedIds.has(order.id)) {
              const previousOrder = previousById.get(order.id);
              return previousOrder &&
                order.updatedAt === previousOrder.updatedAt
                ? { ...order, status: previousOrder.status }
                : order;
            }
            return order;
          }),
        );
        if (
          updatedById.size > 0 &&
          !TERMINAL_ORDER_STATUSES.has(fromStatus) &&
          TERMINAL_ORDER_STATUSES.has(status)
        ) {
          syncHistoryWindowFromLoadedOrders();
        }
      } finally {
        const completedIds: string[] = [];
        for (const orderId of orderIds) {
          if (mutationVersions.current.get(orderId) === versions.get(orderId)) {
            mutationVersions.current.delete(orderId);
            completedIds.push(orderId);
          }
        }
        setOrdersPending(completedIds, false);
      }
      if (needsReconciliation) {
        await refreshOrders();
      }
      if (partialFailure) {
        console.error("Failed to batch update order status:", partialFailure);
        throw partialFailure instanceof Error
          ? partialFailure
          : new Error("Batch order update failed");
      }
    },
    [
      activeRestaurant?.id,
      canAccessOrders,
      refreshOrders,
      setOrdersPending,
      syncHistoryWindowFromLoadedOrders,
      updateOrders,
    ],
  );

  // Initial load when a staff/owner session becomes available.
  useEffect(() => {
    replaceOrders([]);
    historyPageRef.current = 0;
    setHistoryPage(0);
    setHistoryTotalPages(0);
    void refreshOrders();
  }, [activeRestaurant?.id, refreshOrders, replaceOrders]);

  useEffect(() => {
    if (!isConnected) needsSocketCatchup.current = true;
  }, [isConnected]);

  useEffect(() => {
    const restaurantId = activeRestaurant?.id;
    if (!canAccessOrders || !socket || !isConnected || !restaurantId) return;
    socket.emit("joinRestaurantOrdersRoom", restaurantId);
    if (needsSocketCatchup.current) {
      // Catch up after a delayed first connection or reconnect. An already
      // connected initial render is covered by the normal initial load above.
      needsSocketCatchup.current = false;
      void refreshOrders();
    }

    const handleNewOrder = () => {
      // Small chime for new UI event
      const audio = new Audio("/notification.mp3");
      audio.play().catch(() => {}); // Catch autoplay restrictions

      // We can either append to state or just refresh fully
      refreshOrders();
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    };

    const handleOrderStatusChanged = (update: OrderStatusUpdate) => {
      if (update?.id) {
        const current = ordersRef.current.find(
          (order) => order.id === update.id,
        );
        const addsTerminalOrder =
          current &&
          !TERMINAL_ORDER_STATUSES.has(current.status) &&
          TERMINAL_ORDER_STATUSES.has(update.status);
        mergeOrderStatusUpdates([update]);
        if (addsTerminalOrder) {
          syncHistoryWindowFromLoadedOrders();
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    };

    const handleOrderStatusesChanged = (updates: OrderStatusUpdate[]) => {
      if (Array.isArray(updates) && updates.length > 0) {
        const addsTerminalOrder = updates.some((update) => {
          const current = ordersRef.current.find(
            (order) => order.id === update.id,
          );
          return (
            current &&
            !TERMINAL_ORDER_STATUSES.has(current.status) &&
            TERMINAL_ORDER_STATUSES.has(update.status)
          );
        });
        mergeOrderStatusUpdates(updates);
        if (addsTerminalOrder) {
          syncHistoryWindowFromLoadedOrders();
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["analytics"] });
    };

    socket.on("newOrder", handleNewOrder);
    socket.on("orderStatusChanged", handleOrderStatusChanged);
    socket.on("orderStatusesChanged", handleOrderStatusesChanged);

    return () => {
      socket.off("newOrder", handleNewOrder);
      socket.off("orderStatusChanged", handleOrderStatusChanged);
      socket.off("orderStatusesChanged", handleOrderStatusesChanged);
      socket.emit("leaveRestaurantOrdersRoom", restaurantId);
    };
  }, [
    activeRestaurant?.id,
    canAccessOrders,
    socket,
    isConnected,
    mergeOrderStatusUpdates,
    refreshOrders,
    syncHistoryWindowFromLoadedOrders,
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
