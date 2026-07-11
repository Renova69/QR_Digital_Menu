import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { vi } from "vitest";
import { OrderProvider, useOrders } from "./OrderContext";
import { getOrders } from "../lib/api";

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

vi.mock("../lib/api", () => ({
  getOrders: vi.fn(),
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

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
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
  const { orders } = useOrders();
  return (
    <div>
      <span data-testid="order-count">{orders.length}</span>
      <span>{orders[0]?.servicePointLabel}</span>
    </div>
  );
}

describe("OrderProvider service-point visibility", () => {
  it("loads service-point orders and refetches them after a live event", async () => {
    vi.mocked(getOrders)
      .mockResolvedValueOnce([roomOrder])
      .mockResolvedValueOnce([
        roomOrder,
        { ...roomOrder, id: "order-room-302", servicePointLabel: "302" },
      ]);

    render(
      <OrderProvider>
        <OrderProbe />
      </OrderProvider>,
    );

    expect(await screen.findByText("301")).toBeInTheDocument();
    expect(screen.getByTestId("order-count")).toHaveTextContent("1");
    expect(getOrders).toHaveBeenCalledWith({
      restaurantId: "restaurant-1",
    });
    await waitFor(() =>
      expect(socketState.handlers.newOrder).toBeTypeOf("function"),
    );

    act(() => socketState.handlers.newOrder());

    await waitFor(() =>
      expect(screen.getByTestId("order-count")).toHaveTextContent("2"),
    );
  });
});
