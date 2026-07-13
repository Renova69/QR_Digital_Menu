export interface PosOrderOption {
  optionId: string;
  optionName: string;
  choiceName: string;
  priceModifier: number;
}

export interface PosOrderPayload {
  customerName: string;
  source: "POS";
  tableId: string;
  restaurantId: string;
  specialRequests?: string;
  posSubmission: {
    clientOrderId: string;
    restaurantId: string;
    tableId: string;
    expectedTableSessionId: string | null;
  };
  items: Array<{
    menuItemId: string;
    quantity: number;
    expectedUnitPrice: number;
    selectedOptions: PosOrderOption[];
    notes?: string;
  }>;
}

export interface PosSyncConflict {
  code: string;
  message: string;
  details?: unknown;
}

export interface PosQueuedCartItem {
  cartId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  selectedOptions: PosOrderOption[];
  seatNumber: string;
  itemNote: string;
}

export interface QueuedPosOrder {
  clientOrderId: string;
  restaurantId: string;
  tableId: string;
  tableName: string;
  localSessionId: string;
  createdAt: string;
  updatedAt: string;
  lastAttemptAt?: string;
  attempts: number;
  status: "pending" | "conflict";
  payload: PosOrderPayload;
  cartItems?: PosQueuedCartItem[];
  conflict?: PosSyncConflict;
  lastError?: PosSyncConflict;
}

export interface PosOutboxStore {
  list: () => Promise<QueuedPosOrder[]>;
  put: (order: QueuedPosOrder) => Promise<void>;
  delete: (clientOrderId: string) => Promise<void>;
}

export interface PosOrderResult {
  id: string;
  tableSessionId?: string | null;
  sessionToken?: string | null;
}

export type PosSyncEvent =
  | { type: "changed" }
  | { type: "queued"; clientOrderId: string }
  | {
      type: "synced";
      clientOrderId: string;
      localSessionId: string;
      orderId: string;
      tableSessionId: string | null;
      sessionToken: string | null;
    }
  | {
      type: "conflict";
      clientOrderId: string;
      localSessionId: string;
      conflict: PosSyncConflict;
    };

export const POS_SYNC_EVENT = "pos:offline-sync";

const DATABASE_NAME = "qr-menu-pos";
const DATABASE_VERSION = 1;
const OUTBOX_STORE = "order-outbox";
const SNAPSHOT_STORE = "snapshots";

interface PosSnapshot<T> {
  key: string;
  value: T;
  cachedAt: string;
}

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export const createPosClientOrderId = createId;
export const createPosLocalSessionId = createId;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openPosDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("Offline storage is unavailable in this browser."),
    );
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OUTBOX_STORE)) {
        database.createObjectStore(OUTBOX_STORE, {
          keyPath: "clientOrderId",
        });
      }
      if (!database.objectStoreNames.contains(SNAPSHOT_STORE)) {
        database.createObjectStore(SNAPSHOT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Offline storage upgrade is blocked by another tab."));
  });
}

export const indexedDbPosOutbox: PosOutboxStore = {
  async list() {
    const database = await openPosDatabase();
    try {
      const transaction = database.transaction(OUTBOX_STORE, "readonly");
      const orders = await requestResult<QueuedPosOrder[]>(
        transaction.objectStore(OUTBOX_STORE).getAll(),
      );
      return orders.sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      );
    } finally {
      database.close();
    }
  },

  async put(order) {
    const database = await openPosDatabase();
    try {
      const transaction = database.transaction(OUTBOX_STORE, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(OUTBOX_STORE).put(order);
      await done;
    } finally {
      database.close();
    }
  },

  async delete(clientOrderId) {
    const database = await openPosDatabase();
    try {
      const transaction = database.transaction(OUTBOX_STORE, "readwrite");
      const done = transactionDone(transaction);
      transaction.objectStore(OUTBOX_STORE).delete(clientOrderId);
      await done;
    } finally {
      database.close();
    }
  },
};

function dispatchSyncEvent(event: PosSyncEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POS_SYNC_EVENT, { detail: event }));
}

export async function queuePosOrder(
  order: QueuedPosOrder,
  store: PosOutboxStore = indexedDbPosOutbox,
): Promise<void> {
  await store.put(order);
  dispatchSyncEvent({ type: "queued", clientOrderId: order.clientOrderId });
  dispatchSyncEvent({ type: "changed" });
}

export async function retryPosOrder(
  clientOrderId: string,
  store: PosOutboxStore = indexedDbPosOutbox,
): Promise<void> {
  const order = (await store.list()).find(
    (candidate) => candidate.clientOrderId === clientOrderId,
  );
  if (!order) return;
  await store.put({
    ...order,
    status: "pending",
    conflict: undefined,
    lastError: undefined,
    updatedAt: new Date().toISOString(),
  });
  dispatchSyncEvent({ type: "changed" });
}

export async function discardPosOrder(
  clientOrderId: string,
  store: PosOutboxStore = indexedDbPosOutbox,
): Promise<void> {
  await store.delete(clientOrderId);
  dispatchSyncEvent({ type: "changed" });
}

export async function putPosSnapshot<T>(key: string, value: T): Promise<void> {
  const database = await openPosDatabase();
  try {
    const transaction = database.transaction(SNAPSHOT_STORE, "readwrite");
    const done = transactionDone(transaction);
    const snapshot: PosSnapshot<T> = {
      key,
      value,
      cachedAt: new Date().toISOString(),
    };
    transaction.objectStore(SNAPSHOT_STORE).put(snapshot);
    await done;
  } finally {
    database.close();
  }
}

export async function getPosSnapshot<T>(
  key: string,
): Promise<PosSnapshot<T> | null> {
  const database = await openPosDatabase();
  try {
    const transaction = database.transaction(SNAPSHOT_STORE, "readonly");
    const snapshot = await requestResult<PosSnapshot<T> | undefined>(
      transaction.objectStore(SNAPSHOT_STORE).get(key),
    );
    return snapshot ?? null;
  } finally {
    database.close();
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function classifySyncError(error: unknown): {
  conflict: PosSyncConflict;
  disposition: "conflict" | "retry" | "stop";
} {
  const errorRecord = asRecord(error);
  const response = asRecord(errorRecord?.response);
  const data = asRecord(response?.data);
  const status = typeof response?.status === "number" ? response.status : null;
  const transportCode =
    typeof errorRecord?.code === "string" ? errorRecord.code : null;
  const code =
    typeof data?.code === "string"
      ? data.code
      : status
        ? `HTTP_${status}`
        : transportCode || "NETWORK_ERROR";
  const message =
    typeof data?.message === "string"
      ? data.message
      : status
        ? "The server could not sync this order."
        : "Waiting for a network connection.";
  const conflict = { code, message, details: data ?? undefined };

  if (!status || transportCode === "ERR_NETWORK") {
    return { conflict, disposition: "stop" };
  }
  if (status === 401 || status === 403) {
    return {
      conflict: {
        code: "AUTH_REQUIRED",
        message: "Sign in again before queued orders can sync.",
        details: data ?? undefined,
      },
      disposition: "stop",
    };
  }
  if (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500 ||
    code === "PAYMENT_IN_PROGRESS"
  ) {
    return { conflict, disposition: "retry" };
  }
  if (status >= 400 && status < 500) {
    return { conflict, disposition: "conflict" };
  }
  return { conflict, disposition: "retry" };
}

export function isPosTransportFailure(error: unknown): boolean {
  const errorRecord = asRecord(error);
  const response = asRecord(errorRecord?.response);
  const code = typeof errorRecord?.code === "string" ? errorRecord.code : null;
  return (
    !response &&
    (code === null ||
      code === "ERR_NETWORK" ||
      code === "ECONNABORTED" ||
      code === "ETIMEDOUT")
  );
}

export function createPosSyncEngine({
  store = indexedDbPosOutbox,
  submit,
  onEvent = dispatchSyncEvent,
}: {
  store?: PosOutboxStore;
  submit: (payload: PosOrderPayload) => Promise<PosOrderResult>;
  onEvent?: (event: PosSyncEvent) => void;
}) {
  type SyncResult = {
    synced: number;
    conflicts: number;
    pending: number;
  };
  const activeSyncs = new Map<string, Promise<SyncResult>>();

  const run = async (restaurantId?: string) => {
    const orders = (await store.list()).filter(
      (order) => !restaurantId || order.restaurantId === restaurantId,
    );
    const blockedLocalSessions = new Set(
      orders
        .filter((order) => order.status === "conflict")
        .map((order) => order.localSessionId),
    );
    let synced = 0;
    let conflicts = 0;

    for (let index = 0; index < orders.length; index += 1) {
      let order = orders[index];
      if (
        order.status !== "pending" ||
        blockedLocalSessions.has(order.localSessionId)
      ) {
        continue;
      }

      const attemptedAt = new Date().toISOString();
      order = {
        ...order,
        attempts: order.attempts + 1,
        lastAttemptAt: attemptedAt,
        updatedAt: attemptedAt,
        lastError: undefined,
      };
      orders[index] = order;
      await store.put(order);

      try {
        const result = await submit(order.payload);
        await store.delete(order.clientOrderId);
        synced += 1;

        const serverSessionId = result.tableSessionId ?? null;
        if (serverSessionId) {
          for (
            let candidateIndex = index + 1;
            candidateIndex < orders.length;
            candidateIndex += 1
          ) {
            const candidate = orders[candidateIndex];
            if (
              candidate.status !== "pending" ||
              candidate.localSessionId !== order.localSessionId ||
              candidate.payload.posSubmission.expectedTableSessionId !== null
            ) {
              continue;
            }
            const patched = {
              ...candidate,
              updatedAt: attemptedAt,
              payload: {
                ...candidate.payload,
                posSubmission: {
                  ...candidate.payload.posSubmission,
                  expectedTableSessionId: serverSessionId,
                },
              },
            };
            orders[candidateIndex] = patched;
            await store.put(patched);
          }
        }

        onEvent({
          type: "synced",
          clientOrderId: order.clientOrderId,
          localSessionId: order.localSessionId,
          orderId: result.id,
          tableSessionId: serverSessionId,
          sessionToken: result.sessionToken ?? null,
        });
        onEvent({ type: "changed" });
      } catch (error) {
        const failure = classifySyncError(error);
        blockedLocalSessions.add(order.localSessionId);

        if (failure.disposition === "conflict") {
          conflicts += 1;
          const conflicted: QueuedPosOrder = {
            ...order,
            status: "conflict",
            conflict: failure.conflict,
            lastError: failure.conflict,
          };
          orders[index] = conflicted;
          await store.put(conflicted);
          onEvent({
            type: "conflict",
            clientOrderId: order.clientOrderId,
            localSessionId: order.localSessionId,
            conflict: failure.conflict,
          });
          onEvent({ type: "changed" });
          continue;
        }

        const pending: QueuedPosOrder = {
          ...order,
          status: "pending",
          lastError: failure.conflict,
        };
        orders[index] = pending;
        await store.put(pending);
        onEvent({ type: "changed" });
        if (failure.disposition === "stop") break;
      }
    }

    const remaining = (await store.list()).filter(
      (order) => !restaurantId || order.restaurantId === restaurantId,
    );
    return {
      synced,
      conflicts,
      pending: remaining.filter((order) => order.status === "pending").length,
    };
  };

  return {
    sync(restaurantId?: string) {
      const scope = restaurantId ?? "*";
      const activeSync = activeSyncs.get(scope);
      if (activeSync) return activeSync;

      const request = run(restaurantId).finally(() => {
        if (activeSyncs.get(scope) === request) {
          activeSyncs.delete(scope);
        }
      });
      activeSyncs.set(scope, request);
      return request;
    },
  };
}
