import { describe, expect, it, vi } from "vitest";
import {
  createPosSyncEngine,
  type PosOutboxStore,
  type QueuedPosOrder,
} from "./posOfflineOrders";

const makeQueuedOrder = (
  overrides: Partial<QueuedPosOrder> = {},
): QueuedPosOrder => ({
  clientOrderId: "client-1",
  restaurantId: "restaurant-1",
  tableId: "table-1",
  tableName: "Table 1",
  localSessionId: "local-session-1",
  createdAt: "2026-07-13T10:00:00.000Z",
  updatedAt: "2026-07-13T10:00:00.000Z",
  attempts: 0,
  status: "pending",
  payload: {
    customerName: "Guest",
    source: "POS",
    tableId: "Table 1",
    restaurantId: "restaurant-1",
    specialRequests: "",
    posSubmission: {
      clientOrderId: "client-1",
      restaurantId: "restaurant-1",
      tableId: "table-1",
      expectedTableSessionId: null,
    },
    items: [
      {
        menuItemId: "menu-item-1",
        quantity: 1,
        expectedUnitPrice: 10,
        selectedOptions: [],
      },
    ],
  },
  ...overrides,
});

function makeStore(seed: QueuedPosOrder[]): PosOutboxStore & {
  values: Map<string, QueuedPosOrder>;
} {
  const values = new Map(seed.map((order) => [order.clientOrderId, order]));
  return {
    values,
    list: vi.fn(async () =>
      [...values.values()].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    ),
    put: vi.fn(async (order) => {
      values.set(order.clientOrderId, order);
    }),
    delete: vi.fn(async (clientOrderId) => {
      values.delete(clientOrderId);
    }),
  };
}

describe("POS offline order sync", () => {
  it("syncs oldest-first and binds later local batches to the created server session", async () => {
    const first = makeQueuedOrder();
    const second = makeQueuedOrder({
      clientOrderId: "client-2",
      createdAt: "2026-07-13T10:01:00.000Z",
      payload: {
        ...first.payload,
        posSubmission: {
          ...first.payload.posSubmission,
          clientOrderId: "client-2",
        },
      },
    });
    const store = makeStore([first, second]);
    const submit = vi
      .fn()
      .mockResolvedValueOnce({
        id: "order-1",
        tableSessionId: "server-session-1",
        sessionToken: "session-token-1",
      })
      .mockResolvedValueOnce({
        id: "order-2",
        tableSessionId: "server-session-1",
        sessionToken: "session-token-1",
      });
    const onEvent = vi.fn();

    const result = await createPosSyncEngine({ store, submit, onEvent }).sync();

    expect(result).toEqual({ synced: 2, conflicts: 0, pending: 0 });
    expect(submit).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        posSubmission: expect.objectContaining({
          expectedTableSessionId: "server-session-1",
        }),
      }),
    );
    expect(store.values.size).toBe(0);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "synced",
        clientOrderId: "client-1",
        tableSessionId: "server-session-1",
      }),
    );
  });

  it("keeps a price conflict for staff review and does not sync a later batch for that table", async () => {
    const first = makeQueuedOrder();
    const second = makeQueuedOrder({
      clientOrderId: "client-2",
      createdAt: "2026-07-13T10:01:00.000Z",
      payload: {
        ...first.payload,
        posSubmission: {
          ...first.payload.posSubmission,
          clientOrderId: "client-2",
        },
      },
    });
    const store = makeStore([first, second]);
    const submit = vi.fn().mockRejectedValue({
      response: {
        status: 409,
        data: {
          code: "PRICE_CHANGED",
          message: "Price changed",
          currentQuote: [{ menuItemId: "menu-item-1", currentUnitPrice: 12 }],
        },
      },
    });

    const engine = createPosSyncEngine({ store, submit });
    const result = await engine.sync();

    expect(result).toEqual({ synced: 0, conflicts: 1, pending: 1 });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(store.values.get("client-1")).toMatchObject({
      status: "conflict",
      conflict: { code: "PRICE_CHANGED", message: "Price changed" },
    });
    expect(store.values.get("client-2")?.status).toBe("pending");

    submit.mockReset().mockResolvedValue({ id: "order-2" });
    await expect(engine.sync()).resolves.toEqual({
      synced: 0,
      conflicts: 0,
      pending: 1,
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it("leaves orders pending when the network disappears", async () => {
    const store = makeStore([makeQueuedOrder()]);
    const submit = vi.fn().mockRejectedValue({ code: "ERR_NETWORK" });

    const result = await createPosSyncEngine({ store, submit }).sync();

    expect(result).toEqual({ synced: 0, conflicts: 0, pending: 1 });
    expect(store.values.get("client-1")).toMatchObject({
      status: "pending",
      attempts: 1,
    });
  });

  it("runs syncs for different restaurants independently", async () => {
    const first = makeQueuedOrder();
    const second = makeQueuedOrder({
      clientOrderId: "client-2",
      restaurantId: "restaurant-2",
      localSessionId: "local-session-2",
      payload: {
        ...first.payload,
        restaurantId: "restaurant-2",
        posSubmission: {
          ...first.payload.posSubmission,
          clientOrderId: "client-2",
          restaurantId: "restaurant-2",
        },
      },
    });
    const store = makeStore([first, second]);
    let releaseFirst!: (value: { id: string }) => void;
    const firstSubmission = new Promise<{ id: string }>((resolve) => {
      releaseFirst = resolve;
    });
    const submit = vi.fn((payload: QueuedPosOrder["payload"]) =>
      payload.restaurantId === "restaurant-1"
        ? firstSubmission
        : Promise.resolve({ id: "order-2" }),
    );
    const engine = createPosSyncEngine({ store, submit });

    const firstSync = engine.sync("restaurant-1");
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    await expect(engine.sync("restaurant-2")).resolves.toEqual({
      synced: 1,
      conflicts: 0,
      pending: 0,
    });
    expect(store.values.has("client-2")).toBe(false);

    releaseFirst({ id: "order-1" });
    await expect(firstSync).resolves.toEqual({
      synced: 1,
      conflicts: 0,
      pending: 0,
    });
  });
});
