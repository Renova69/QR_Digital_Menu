import React, { act } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import { OrderProvider, useOrders } from "./OrderContext";
import { getOrdersPage } from "../lib/api";

const socketState = vi.hoisted(() => {
  const handlers: Record<string, () => void> = {};
  return {
    handlers,
    socket: {
      emit: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        handlers[event] = handler;
      }),
      off: vi.fn((event: string) => {
        delete handlers[event];
      }),
    },
  };
});

const featureState = vi.hoisted(() => ({ orders: true }));
const queryClientState = vi.hoisted(() => ({ invalidateQueries: vi.fn() }));

vi.mock("../lib/api", () => ({
  getOrdersPage: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

vi.mock("./SocketContext", () => ({
  useSocket: () => ({ socket: socketState.socket, isConnected: true }),
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

describe("OrderProvider service-point visibility", () => {
  beforeEach(() => {
    featureState.orders = true;
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
});
