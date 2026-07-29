import React, { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import { OrderProvider, useOrders } from "./OrderContext";
import {
  bulkUpdateOrderStatus as apiBulkUpdateOrderStatus,
  getOrdersPage,
  updateOrderStatus as apiUpdateOrderStatus,
} from "../lib/api";

const socketState = vi.hoisted(() => {
  const handlers: Record<string, (payload?: unknown) => void> = {};
  return {
    handlers,
    socket: {
      emit: vi.fn(),
      on: vi.fn((event: string, handler: (payload?: unknown) => void) => {
        handlers[event] = handler;
      }),
      off: vi.fn((event: string) => {
        delete handlers[event];
      }),
    },
  };
});

const featureState = vi.hoisted(() => ({ orders: true }));
const connectionState = vi.hoisted(() => ({ isConnected: true }));
const queryClientState = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));

vi.mock("../lib/api", () => ({
  MAX_BULK_ORDER_STATUS_UPDATES: 100,
  bulkUpdateOrderStatus: vi.fn(),
  getOrdersPage: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

vi.mock("./SocketContext", () => ({
  useSocket: () => ({
    socket: socketState.socket,
    isConnected: connectionState.isConnected,
  }),
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { id: "owner-1", role: "OWNER" },
  }),
}));

vi.mock("./RestaurantContext", () => ({
  useRestaurantContext: () => ({
    activeRestaurant: { id: "restaurant-1" },
  }),
}));

vi.mock("../hooks/useFeature", () => ({
  useFeature: () => featureState.orders,
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => queryClientState,
}));

vi.stubGlobal(
  "Audio",
  class {
    play() {
      return Promise.resolve();
    }
  },
);

const roomOrder = {
  id: "order-room-301",
  customerName: "Carl",
  tableId: "room-id",
  tableName: "301",
  servicePointType: "ROOM",
  servicePointLabel: "301",
  fulfillmentType: "ROOM_DELIVERY",
  paymentPreference: "PAY_ON_DELIVERY",
  status: "NEW" as const,
  restaurantId: "restaurant-1",
  items: [],
  totalPrice: 10,
  source: "CUSTOMER" as const,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function OrderProbe() {
  const { orders, isLoading } = useOrders();
  return (
    <div>
      <span data-testid="order-count">{orders.length}</span>
      <span data-testid="load-state">{isLoading ? "loading" : "idle"}</span>
      <span>{orders[0]?.servicePointLabel}</span>
    </div>
  );
}

function BulkMoveProbe() {
  const { orders, batchUpdateOrderStatus, isOrderUpdating } = useOrders();
  const [moveError, setMoveError] = React.useState(false);
  const ids = orders.map((order) => order.id);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setMoveError(false);
          void batchUpdateOrderStatus(ids, "NEW", "IN_PROGRESS").catch(() =>
            setMoveError(true),
          );
        }}
      >
        Move all
      </button>
      <span data-testid="bulk-statuses">
        {orders.map((order) => order.status).join(",")}
      </span>
      <span data-testid="bulk-pending">
        {ids.some((id) => isOrderUpdating(id)) ? "pending" : "idle"}
      </span>
      <span data-testid="bulk-error">{moveError ? "error" : "ok"}</span>
    </div>
  );
}

function SingleMoveProbe() {
  const { orders, updateOrderStatus, isOrderUpdating } = useOrders();
  const order = orders[0];

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          order &&
          void updateOrderStatus(order.id, "IN_PROGRESS").catch(() => {})
        }
      >
        Move one
      </button>
      <span data-testid="single-status">{order?.status ?? "empty"}</span>
      <span data-testid="single-pending">
        {order && isOrderUpdating(order.id) ? "pending" : "idle"}
      </span>
    </div>
  );
}

function TerminalMoveProbe() {
  const { orders, updateOrderStatus, hasMoreHistory } = useOrders();
  const order = orders.find((candidate) => candidate.id === roomOrder.id);
  const completedCount = orders.filter(
    (candidate) => candidate.status === "COMPLETED",
  ).length;

  return (
    <div>
      <button
        type="button"
        onClick={() => order && void updateOrderStatus(order.id, "COMPLETED")}
      >
        Complete order
      </button>
      <span data-testid="terminal-status">{order?.status ?? "empty"}</span>
      <span data-testid="completed-count">{completedCount}</span>
      <span data-testid="completed-ids">
        {orders
          .filter((candidate) => candidate.status === "COMPLETED")
          .map((candidate) => candidate.id)
          .join(",")}
      </span>
      <span data-testid="history-continuation">
        {hasMoreHistory ? "more" : "end"}
      </span>
    </div>
  );
}

describe("OrderProvider service-point visibility", () => {
  beforeEach(() => {
    featureState.orders = true;
    connectionState.isConnected = true;
    vi.clearAllMocks();
    for (const event of Object.keys(socketState.handlers)) {
      delete socketState.handlers[event];
    }
  });

  it("loads service-point orders and refetches them after a live event", async () => {
    let currentOrders: (typeof roomOrder)[] = [roomOrder];
    vi.mocked(getOrdersPage).mockImplementation(async (params) => {
      const statuses = params?.statuses;
      return {
        data: statuses?.includes("COMPLETED") ? [] : currentOrders,
        total: statuses?.includes("COMPLETED") ? 0 : currentOrders.length,
        page: 1,
        totalPages: 1,
      };
    });

    render(
      <OrderProvider>
        <OrderProbe />
      </OrderProvider>,
    );

    expect(await screen.findByText("301")).toBeInTheDocument();
    expect(screen.getByTestId("order-count")).toHaveTextContent("1");
    await waitFor(() =>
      expect(screen.getByTestId("load-state")).toHaveTextContent("idle"),
    );
    expect(getOrdersPage).toHaveBeenCalledWith({
      restaurantId: "restaurant-1",
      statuses: ["PENDING_PAYMENT", "NEW", "IN_PROGRESS", "SERVED"],
      page: 1,
      limit: 100,
    });
    await waitFor(() =>
      expect(socketState.handlers.newOrder).toBeTypeOf("function"),
    );
    expect(getOrdersPage).toHaveBeenCalledTimes(2);

    currentOrders = [
      roomOrder,
      { ...roomOrder, id: "order-room-302", servicePointLabel: "302" },
    ];
    await act(async () => socketState.handlers.newOrder());

    await waitFor(() =>
      expect(screen.getByTestId("order-count")).toHaveTextContent("2"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("load-state")).toHaveTextContent("idle"),
    );
  });

  it("loads every page of active orders instead of truncating the live queue", async () => {
    const secondOrder = {
      ...roomOrder,
      id: "order-room-302",
      servicePointLabel: "302",
    };
    vi.mocked(getOrdersPage).mockImplementation(async (params) => {
      const statuses = params?.statuses;
      const page = params?.page ?? 1;
      if (statuses?.includes("COMPLETED")) {
        return { data: [], total: 0, page: 1, totalPages: 1 };
      }
      return {
        data: page === 1 ? [roomOrder] : [secondOrder],
        total: 2,
        page,
        totalPages: 2,
      };
    });

    render(
      <OrderProvider>
        <OrderProbe />
      </OrderProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("order-count")).toHaveTextContent("2"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("load-state")).toHaveTextContent("idle"),
    );
    expect(getOrdersPage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 100 }),
    );
  });

  it("does not fetch or subscribe when the plan lacks Orders", async () => {
    featureState.orders = false;

    render(
      <OrderProvider>
        <OrderProbe />
      </OrderProvider>,
    );

    expect(screen.getByTestId("order-count")).toHaveTextContent("0");
    await waitFor(() => expect(getOrdersPage).not.toHaveBeenCalled());
    expect(socketState.socket.emit).not.toHaveBeenCalledWith(
      "joinRestaurantOrdersRoom",
      expect.anything(),
    );
    expect(socketState.socket.on).not.toHaveBeenCalledWith(
      "newOrder",
      expect.any(Function),
    );
  });

  it("moves four orders through one bulk request without blocking on a list reload", async () => {
    const newOrders = Array.from({ length: 4 }, (_, index) => ({
      ...roomOrder,
      id: `order-${index + 1}`,
      status: "NEW" as const,
    }));
    vi.mocked(getOrdersPage).mockImplementation(async (params) => ({
      data: params?.statuses?.includes("COMPLETED") ? [] : newOrders,
      total: params?.statuses?.includes("COMPLETED") ? 0 : newOrders.length,
      page: 1,
      totalPages: 1,
    }));
    vi.mocked(apiBulkUpdateOrderStatus).mockResolvedValue({
      updated: newOrders.map((order) => ({
        id: order.id,
        restaurantId: order.restaurantId,
        status: "IN_PROGRESS",
        tableId: order.tableId,
        tableSessionId: null,
        updatedAt: order.updatedAt,
      })),
      failed: [],
    });

    render(
      <OrderProvider>
        <BulkMoveProbe />
      </OrderProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("bulk-statuses")).toHaveTextContent(
        "NEW,NEW,NEW,NEW",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("bulk-pending")).toHaveTextContent("idle"),
    );
    vi.mocked(getOrdersPage).mockClear();

    act(() => {
      screen.getByRole("button", { name: "Move all" }).click();
    });

    await waitFor(() =>
      expect(screen.getByTestId("bulk-statuses")).toHaveTextContent(
        "IN_PROGRESS,IN_PROGRESS,IN_PROGRESS,IN_PROGRESS",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("bulk-pending")).toHaveTextContent("idle"),
    );

    expect(apiBulkUpdateOrderStatus).toHaveBeenCalledWith(
      "restaurant-1",
      newOrders.map((order) => order.id),
      "NEW",
      "IN_PROGRESS",
    );
    expect(apiBulkUpdateOrderStatus).toHaveBeenCalledTimes(1);
    expect(apiUpdateOrderStatus).not.toHaveBeenCalled();
    expect(getOrdersPage).not.toHaveBeenCalled();
  });

  it("chunks more than one hundred orders without falling back to individual requests", async () => {
    const newOrders = Array.from({ length: 101 }, (_, index) => ({
      ...roomOrder,
      id: `order-${index + 1}`,
      status: "NEW" as const,
    }));
    vi.mocked(getOrdersPage).mockImplementation(async (params) => ({
      data: params?.statuses?.includes("COMPLETED") ? [] : newOrders,
      total: params?.statuses?.includes("COMPLETED") ? 0 : newOrders.length,
      page: 1,
      totalPages: 1,
    }));
    vi.mocked(apiBulkUpdateOrderStatus).mockImplementation(
      async (restaurantId, orderIds) => ({
        updated: orderIds.map((id) => ({
          id,
          restaurantId,
          status: "IN_PROGRESS",
          tableId: roomOrder.tableId,
          tableSessionId: null,
          updatedAt: "2099-07-29T08:00:00.000Z",
        })),
        failed: [],
      }),
    );

    render(
      <OrderProvider>
        <BulkMoveProbe />
      </OrderProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("bulk-statuses").textContent?.split(","),
      ).toHaveLength(101),
    );
    vi.mocked(getOrdersPage).mockClear();

    act(() => {
      screen.getByRole("button", { name: "Move all" }).click();
    });

    await waitFor(() =>
      expect(screen.getByTestId("bulk-pending")).toHaveTextContent("idle"),
    );
    expect(apiBulkUpdateOrderStatus).toHaveBeenCalledTimes(2);
    expect(apiBulkUpdateOrderStatus).toHaveBeenNthCalledWith(
      1,
      "restaurant-1",
      newOrders.slice(0, 100).map((order) => order.id),
      "NEW",
      "IN_PROGRESS",
    );
    expect(apiBulkUpdateOrderStatus).toHaveBeenNthCalledWith(
      2,
      "restaurant-1",
      [newOrders[100].id],
      "NEW",
      "IN_PROGRESS",
    );
    expect(apiUpdateOrderStatus).not.toHaveBeenCalled();
    expect(getOrdersPage).not.toHaveBeenCalled();
  });

  it("keeps successful chunks when a later bulk request fails", async () => {
    const newOrders = Array.from({ length: 101 }, (_, index) => ({
      ...roomOrder,
      id: `order-${index + 1}`,
      status: "NEW" as const,
    }));
    let currentOrders: Array<
      Omit<(typeof newOrders)[number], "status"> & {
        status: "NEW" | "IN_PROGRESS";
      }
    > = newOrders;
    vi.mocked(getOrdersPage).mockImplementation(async (params) => ({
      data: params?.statuses?.includes("COMPLETED") ? [] : currentOrders,
      total: params?.statuses?.includes("COMPLETED") ? 0 : currentOrders.length,
      page: 1,
      totalPages: 1,
    }));
    vi.mocked(apiBulkUpdateOrderStatus).mockImplementation(
      async (restaurantId, orderIds) => {
        const chunkIds = new Set(orderIds);
        currentOrders = currentOrders.map((order) =>
          chunkIds.has(order.id)
            ? {
                ...order,
                status: "IN_PROGRESS" as const,
                updatedAt: "2099-07-29T08:00:00.000Z",
              }
            : order,
        );
        if (orderIds.length === 1) throw new Error("network failure");
        return {
          updated: orderIds.map((id) => ({
            id,
            restaurantId,
            status: "IN_PROGRESS",
            tableId: roomOrder.tableId,
            tableSessionId: null,
            updatedAt: "2099-07-29T08:00:00.000Z",
          })),
          failed: [],
        };
      },
    );

    render(
      <OrderProvider>
        <BulkMoveProbe />
      </OrderProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("bulk-statuses").textContent?.split(","),
      ).toHaveLength(101),
    );
    vi.mocked(getOrdersPage).mockClear();
    act(() => {
      screen.getByRole("button", { name: "Move all" }).click();
    });

    await waitFor(() =>
      expect(screen.getByTestId("bulk-error")).toHaveTextContent("error"),
    );
    const statuses = screen
      .getByTestId("bulk-statuses")
      .textContent?.split(",");
    expect(statuses).toEqual(Array.from({ length: 101 }, () => "IN_PROGRESS"));
    expect(screen.getByTestId("bulk-pending")).toHaveTextContent("idle");
    expect(getOrdersPage).toHaveBeenCalledTimes(2);
  });

  it("keeps successful moves when one order changed concurrently", async () => {
    const newOrders = Array.from({ length: 4 }, (_, index) => ({
      ...roomOrder,
      id: `order-${index + 1}`,
      status: "NEW" as const,
    }));
    vi.mocked(getOrdersPage).mockImplementation(async (params) => ({
      data: params?.statuses?.includes("COMPLETED") ? [] : newOrders,
      total: params?.statuses?.includes("COMPLETED") ? 0 : newOrders.length,
      page: 1,
      totalPages: 1,
    }));
    vi.mocked(apiBulkUpdateOrderStatus).mockResolvedValue({
      updated: newOrders.slice(0, 3).map((order) => ({
        id: order.id,
        restaurantId: order.restaurantId,
        status: "IN_PROGRESS",
        tableId: order.tableId,
        tableSessionId: null,
        updatedAt: order.updatedAt,
      })),
      failed: [
        {
          id: "order-4",
          reason: "STATUS_CHANGED",
          currentStatus: "SERVED",
          updatedAt: "2099-07-29T09:00:00.000Z",
        },
      ],
    });

    render(
      <OrderProvider>
        <BulkMoveProbe />
      </OrderProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("bulk-statuses")).toHaveTextContent(
        "NEW,NEW,NEW,NEW",
      ),
    );
    screen.getByRole("button", { name: "Move all" }).click();

    await waitFor(() =>
      expect(screen.getByTestId("bulk-error")).toHaveTextContent("error"),
    );
    expect(screen.getByTestId("bulk-statuses")).toHaveTextContent(
      "IN_PROGRESS,IN_PROGRESS,IN_PROGRESS,SERVED",
    );
    expect(screen.getByTestId("bulk-pending")).toHaveTextContent("idle");
  });

  it("applies batch events without reloads and ignores an older event", async () => {
    const newOrders = Array.from({ length: 4 }, (_, index) => ({
      ...roomOrder,
      id: `order-${index + 1}`,
      status: "NEW" as const,
    }));
    vi.mocked(getOrdersPage).mockImplementation(async (params) => ({
      data: params?.statuses?.includes("COMPLETED") ? [] : newOrders,
      total: params?.statuses?.includes("COMPLETED") ? 0 : newOrders.length,
      page: 1,
      totalPages: 1,
    }));

    render(
      <OrderProvider>
        <BulkMoveProbe />
      </OrderProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("bulk-statuses")).toHaveTextContent(
        "NEW,NEW,NEW,NEW",
      ),
    );
    await waitFor(() =>
      expect(socketState.handlers.orderStatusesChanged).toBeTypeOf("function"),
    );
    vi.mocked(getOrdersPage).mockClear();
    queryClientState.invalidateQueries.mockClear();

    act(() => {
      socketState.handlers.orderStatusesChanged(
        newOrders.map((order) => ({
          id: order.id,
          status: "IN_PROGRESS",
          updatedAt: "2099-07-29T08:00:00.000Z",
        })),
      );
    });

    expect(screen.getByTestId("bulk-statuses")).toHaveTextContent(
      "IN_PROGRESS,IN_PROGRESS,IN_PROGRESS,IN_PROGRESS",
    );
    expect(getOrdersPage).not.toHaveBeenCalled();
    expect(queryClientState.invalidateQueries).toHaveBeenCalledTimes(1);

    act(() => {
      socketState.handlers.orderStatusesChanged(
        newOrders.map((order) => ({
          id: order.id,
          status: "SERVED",
          updatedAt: "2099-07-29T09:00:00.000Z",
        })),
      );
      socketState.handlers.orderStatusesChanged(
        newOrders.map((order) => ({
          id: order.id,
          status: "IN_PROGRESS",
          updatedAt: "2099-07-29T08:30:00.000Z",
        })),
      );
    });

    expect(screen.getByTestId("bulk-statuses")).toHaveTextContent(
      "SERVED,SERVED,SERVED,SERVED",
    );
    expect(getOrdersPage).not.toHaveBeenCalled();
  });

  it("reconciles the order lists once after a socket reconnect", async () => {
    let currentOrders: Array<
      Omit<typeof roomOrder, "status"> & {
        status: "NEW" | "IN_PROGRESS";
      }
    > = [roomOrder];
    vi.mocked(getOrdersPage).mockImplementation(async (params) => ({
      data: params?.statuses?.includes("COMPLETED") ? [] : currentOrders,
      total: params?.statuses?.includes("COMPLETED") ? 0 : currentOrders.length,
      page: 1,
      totalPages: 1,
    }));

    const renderView = () => (
      <OrderProvider>
        <BulkMoveProbe />
      </OrderProvider>
    );
    const { rerender } = render(renderView());

    await waitFor(() =>
      expect(screen.getByTestId("bulk-statuses")).toHaveTextContent("NEW"),
    );
    vi.mocked(getOrdersPage).mockClear();

    connectionState.isConnected = false;
    rerender(renderView());
    currentOrders = [{ ...roomOrder, status: "IN_PROGRESS" as const }];
    connectionState.isConnected = true;
    rerender(renderView());

    await waitFor(() =>
      expect(screen.getByTestId("bulk-statuses")).toHaveTextContent(
        "IN_PROGRESS",
      ),
    );
    expect(getOrdersPage).toHaveBeenCalledTimes(2);
  });

  it("reconciles after the socket makes its delayed first connection", async () => {
    connectionState.isConnected = false;
    let currentOrders: Array<
      Omit<typeof roomOrder, "status"> & {
        status: "NEW" | "IN_PROGRESS";
      }
    > = [roomOrder];
    vi.mocked(getOrdersPage).mockImplementation(async (params) => ({
      data: params?.statuses?.includes("COMPLETED") ? [] : currentOrders,
      total: params?.statuses?.includes("COMPLETED") ? 0 : currentOrders.length,
      page: 1,
      totalPages: 1,
    }));

    const renderView = () => (
      <OrderProvider>
        <BulkMoveProbe />
      </OrderProvider>
    );
    const { rerender } = render(renderView());

    await waitFor(() =>
      expect(screen.getByTestId("bulk-statuses")).toHaveTextContent("NEW"),
    );
    vi.mocked(getOrdersPage).mockClear();

    currentOrders = [{ ...roomOrder, status: "IN_PROGRESS" as const }];
    connectionState.isConnected = true;
    rerender(renderView());

    await waitFor(() =>
      expect(screen.getByTestId("bulk-statuses")).toHaveTextContent(
        "IN_PROGRESS",
      ),
    );
    expect(getOrdersPage).toHaveBeenCalledTimes(2);
  });

  it("keeps the next history page reachable when a terminal move crosses the page boundary", async () => {
    const historyOrders = Array.from({ length: 50 }, (_, index) => ({
      ...roomOrder,
      id: `history-order-${index + 1}`,
      status: "COMPLETED" as const,
      createdAt: new Date(
        Date.parse(roomOrder.createdAt) - index - 1,
      ).toISOString(),
    }));
    vi.mocked(getOrdersPage).mockImplementation(async (params) => {
      const isHistory = params?.statuses?.includes("COMPLETED");
      return {
        data: isHistory ? historyOrders : [roomOrder],
        total: isHistory ? historyOrders.length : 1,
        page: 1,
        totalPages: 1,
      };
    });
    vi.mocked(apiUpdateOrderStatus).mockResolvedValue({
      id: roomOrder.id,
      status: "COMPLETED",
      updatedAt: "2099-07-29T08:00:00.000Z",
    });

    render(
      <OrderProvider>
        <TerminalMoveProbe />
      </OrderProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("terminal-status")).toHaveTextContent("NEW"),
    );
    expect(screen.getByTestId("completed-count")).toHaveTextContent("50");
    expect(screen.getByTestId("history-continuation")).toHaveTextContent("end");

    screen.getByRole("button", { name: "Complete order" }).click();

    await waitFor(() =>
      expect(screen.getByTestId("terminal-status")).toHaveTextContent(
        "COMPLETED",
      ),
    );
    expect(screen.getByTestId("completed-count")).toHaveTextContent("50");
    expect(screen.getByTestId("completed-ids")).toHaveTextContent(roomOrder.id);
    expect(screen.getByTestId("completed-ids")).not.toHaveTextContent(
      "history-order-50",
    );
    expect(screen.getByTestId("history-continuation")).toHaveTextContent(
      "more",
    );
  });

  it("finishes a single status move from the authoritative response without a list reload", async () => {
    vi.mocked(getOrdersPage).mockImplementation(async (params) => ({
      data: params?.statuses?.includes("COMPLETED") ? [] : [roomOrder],
      total: params?.statuses?.includes("COMPLETED") ? 0 : 1,
      page: 1,
      totalPages: 1,
    }));
    vi.mocked(apiUpdateOrderStatus).mockResolvedValue({
      id: roomOrder.id,
      status: "IN_PROGRESS",
      updatedAt: "2026-07-29T08:00:00.000Z",
    });

    render(
      <OrderProvider>
        <SingleMoveProbe />
      </OrderProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("single-status")).toHaveTextContent("NEW"),
    );
    vi.mocked(getOrdersPage).mockClear();

    screen.getByRole("button", { name: "Move one" }).click();

    await waitFor(() =>
      expect(screen.getByTestId("single-status")).toHaveTextContent(
        "IN_PROGRESS",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("single-pending")).toHaveTextContent("idle"),
    );
    expect(getOrdersPage).not.toHaveBeenCalled();
  });

  it("reconciles a single move when the server commits but its response is lost", async () => {
    let currentOrder: Omit<typeof roomOrder, "status"> & {
      status: "NEW" | "IN_PROGRESS";
    } = roomOrder;
    vi.mocked(getOrdersPage).mockImplementation(async (params) => ({
      data: params?.statuses?.includes("COMPLETED") ? [] : [currentOrder],
      total: params?.statuses?.includes("COMPLETED") ? 0 : 1,
      page: 1,
      totalPages: 1,
    }));
    vi.mocked(apiUpdateOrderStatus).mockImplementation(async () => {
      currentOrder = {
        ...roomOrder,
        status: "IN_PROGRESS",
        updatedAt: "2099-07-29T08:00:00.000Z",
      };
      throw new Error("response lost");
    });

    render(
      <OrderProvider>
        <SingleMoveProbe />
      </OrderProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("single-status")).toHaveTextContent("NEW"),
    );
    vi.mocked(getOrdersPage).mockClear();

    screen.getByRole("button", { name: "Move one" }).click();

    await waitFor(() =>
      expect(screen.getByTestId("single-status")).toHaveTextContent(
        "IN_PROGRESS",
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId("single-pending")).toHaveTextContent("idle"),
    );
    expect(getOrdersPage).toHaveBeenCalledTimes(2);
  });
});
