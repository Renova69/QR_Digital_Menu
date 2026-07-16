import { useCallback, useEffect, useMemo, useState } from "react";
import { createOrder } from "../lib/api";
import {
  POS_SYNC_EVENT,
  createPosSyncEngine,
  discardPosOrder,
  indexedDbPosOutbox,
  retryPosOrder,
  type PosSyncEvent,
  type QueuedPosOrder,
} from "../lib/posOfflineOrders";
import { usePos } from "../context/PosContext";

const syncEngine = createPosSyncEngine({
  submit: (payload) => createOrder(payload),
});

export function usePosOfflineSync(restaurantId?: string) {
  const {
    items,
    markQueuedAsSubmitted,
    markQueuedAsConflict,
    loadQueuedOrderForEdit,
    removeQueuedOrderItems,
    adoptServerSession,
  } = usePos();
  const [orders, setOrders] = useState<QueuedPosOrder[]>([]);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!restaurantId) {
      setOrders([]);
      return;
    }
    try {
      const stored = await indexedDbPosOutbox.list();
      const filtered = stored.filter(
        (order) => order.restaurantId === restaurantId,
      );
      setOrders(filtered);
      setStorageError(null);

      // Reconcile missed "synced" events (Bug 1d). The POS_SYNC_EVENT
      // listener only lives while this hook is mounted (PosSyncStatus in
      // PosTopBar). If a queued order's submit resolves while POS is
      // unmounted (idle-logout, route switch to /dashboard), the event is
      // dropped and the cart item stays `syncState:"queued"` forever, which
      // permanently disables card/cash/split/force-close (hasUnsynced).
      // Any queued cart item whose outbox order no longer exists already
      // synced successfully — release it here.
      const outboxIds = new Set(filtered.map((order) => order.clientOrderId));
      const orphanedIds = new Set(
        items
          .filter((item) => item.syncState === "queued" && item.queuedOrderId)
          .map((item) => item.queuedOrderId as string)
          .filter((id) => !outboxIds.has(id)),
      );
      orphanedIds.forEach((id) => markQueuedAsSubmitted(id));
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : "Offline order storage is unavailable.",
      );
    }
  }, [restaurantId, items, markQueuedAsSubmitted]);

  const syncNow = useCallback(async () => {
    if (!restaurantId) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    setIsSyncing(true);
    try {
      await syncEngine.sync(restaurantId);
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : "Queued orders could not be synced.",
      );
    } finally {
      setIsSyncing(false);
      await refresh();
    }
  }, [refresh, restaurantId]);

  useEffect(() => {
    void refresh();
    if (typeof navigator === "undefined" || navigator.onLine) {
      void syncNow();
    }
  }, [refresh, syncNow]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void syncNow();
    };
    const handleOffline = () => setIsOnline(false);
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void syncNow();
      }
    };
    const handleSyncEvent = (rawEvent: Event) => {
      const event = (rawEvent as CustomEvent<PosSyncEvent>).detail;
      if (!event) return;
      if (event.type === "synced") {
        markQueuedAsSubmitted(event.clientOrderId);
        if (event.tableSessionId) {
          adoptServerSession(
            event.localSessionId,
            event.tableSessionId,
            event.sessionToken,
          );
        }
      } else if (event.type === "conflict") {
        markQueuedAsConflict(event.clientOrderId);
      }
      void refresh();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener(POS_SYNC_EVENT, handleSyncEvent);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener(POS_SYNC_EVENT, handleSyncEvent);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [
    adoptServerSession,
    markQueuedAsConflict,
    markQueuedAsSubmitted,
    refresh,
    syncNow,
  ]);

  useEffect(() => {
    if (!isOnline || !orders.some((order) => order.status === "pending")) {
      return;
    }
    const timer = window.setInterval(() => void syncNow(), 30_000);
    return () => window.clearInterval(timer);
  }, [isOnline, orders, syncNow]);

  const retry = useCallback(
    async (clientOrderId: string) => {
      await retryPosOrder(clientOrderId);
      await refresh();
      await syncNow();
    },
    [refresh, syncNow],
  );

  const edit = useCallback(
    async (clientOrderId: string) => {
      // Reentrancy guard (Bug 1b): if the engine is mid-submit for this
      // order, deleting the outbox row here races the in-flight request —
      // the server can still commit it while the waiter re-submits the
      // edited items under a new clientOrderId, creating a duplicate order.
      if (isSyncing) return;
      const order = orders.find(
        (candidate) => candidate.clientOrderId === clientOrderId,
      );
      if (!order) return;
      await discardPosOrder(clientOrderId);
      loadQueuedOrderForEdit(order);
      await refresh();
    },
    [isSyncing, loadQueuedOrderForEdit, orders, refresh],
  );

  const discard = useCallback(
    async (clientOrderId: string) => {
      // Reentrancy guard (Bug 1b) — see edit().
      if (isSyncing) return;
      await discardPosOrder(clientOrderId);
      removeQueuedOrderItems(clientOrderId);
      await refresh();
    },
    [isSyncing, refresh, removeQueuedOrderItems],
  );

  return useMemo(
    () => ({
      orders,
      pendingCount: orders.filter((order) => order.status === "pending").length,
      conflictCount: orders.filter((order) => order.status === "conflict")
        .length,
      isOnline,
      isSyncing,
      storageError,
      syncNow,
      retry,
      edit,
      discard,
    }),
    [orders, isOnline, isSyncing, storageError, syncNow, retry, edit, discard],
  );
}
