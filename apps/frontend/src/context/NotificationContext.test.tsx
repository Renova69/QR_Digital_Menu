import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RestaurantContext from "./RestaurantContext";
import {
  NotificationProvider,
  useNotifications,
} from "./NotificationContext";

const apiMocks = vi.hoisted(() => ({
  getPaymentNotificationFeed: vi.fn(),
  markPaymentNotificationsRead: vi.fn(),
}));

const socketState = vi.hoisted(() => ({
  handlers: {} as Record<string, () => void>,
  socket: {
    on: vi.fn((event: string, handler: () => void) => {
      socketState.handlers[event] = handler;
    }),
    off: vi.fn((event: string) => {
      delete socketState.handlers[event];
    }),
  },
}));

vi.mock("../lib/api", () => apiMocks);
vi.mock("./SocketContext", () => ({
  useSocket: () => ({ socket: socketState.socket, isConnected: true }),
}));
vi.mock("./AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner-1", role: "OWNER" } }),
}));

function NotificationConsumer() {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  return (
    <div>
      <span data-testid="notification-count">{notifications.length}</span>
      <span data-testid="unread-count">{unreadCount}</span>
      <button type="button" onClick={() => void markAllRead()}>
        Mark read
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <RestaurantContext.Provider
      value={
        {
          activeRestaurant: {
            id: "restaurant-1",
            notifyAllStaffOnPayment: true,
          },
        } as never
      }
    >
      <NotificationProvider>
        <NotificationConsumer />
      </NotificationProvider>
    </RestaurantContext.Provider>,
  );
}

describe("NotificationProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketState.handlers = {};
    apiMocks.getPaymentNotificationFeed.mockResolvedValue({
      data: [
        {
          id: "payment:payment-1",
          paymentId: "payment-1",
          tableSessionId: "session-1",
          amount: 42,
          tipAmount: 4,
          currency: "EUR",
          tableNumber: "Table 7",
          customerName: "Alex",
          provider: "STRIPE",
          status: "SUCCEEDED",
          kind: "PAYMENT_SUCCEEDED",
          occurredAt: "2026-07-28T10:30:00.000Z",
          read: false,
        },
      ],
      unreadCount: 1,
      readThrough: null,
    });
    apiMocks.markPaymentNotificationsRead.mockResolvedValue({
      readThrough: "2026-07-28T11:00:00.000Z",
    });
  });

  it("loads durable payment notifications when the dashboard opens", async () => {
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("notification-count")).toHaveTextContent("1");
    });
    expect(screen.getByTestId("unread-count")).toHaveTextContent("1");
    expect(apiMocks.getPaymentNotificationFeed).toHaveBeenCalledWith(
      "restaurant-1",
      20,
    );
  });

  it("refreshes from durable payment records when a partial payment updates the bill", async () => {
    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId("notification-count")).toHaveTextContent("1");
    });

    apiMocks.getPaymentNotificationFeed.mockResolvedValue({
      data: [
        {
          id: "payment:payment-2",
          paymentId: "payment-2",
          tableSessionId: "session-1",
          amount: 12,
          tipAmount: 0,
          currency: "EUR",
          tableNumber: "Table 7",
          customerName: "Alex",
          provider: "STRIPE",
          status: "SUCCEEDED",
          kind: "PAYMENT_SUCCEEDED",
          occurredAt: "2026-07-28T10:35:00.000Z",
          read: false,
        },
        {
          id: "payment:payment-1",
          paymentId: "payment-1",
          tableSessionId: "session-1",
          amount: 42,
          tipAmount: 4,
          currency: "EUR",
          tableNumber: "Table 7",
          customerName: "Alex",
          provider: "STRIPE",
          status: "SUCCEEDED",
          kind: "PAYMENT_SUCCEEDED",
          occurredAt: "2026-07-28T10:30:00.000Z",
          read: false,
        },
      ],
      unreadCount: 2,
      readThrough: null,
    });

    await act(async () => {
      socketState.handlers["bill:updated"]();
    });

    await waitFor(() => {
      expect(screen.getByTestId("notification-count")).toHaveTextContent("2");
    });
    expect(screen.getByTestId("unread-count")).toHaveTextContent("2");
  });

  it("persists mark-all-read and clears the unread badge", async () => {
    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId("unread-count")).toHaveTextContent("1");
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark read" }));

    await waitFor(() => {
      expect(screen.getByTestId("unread-count")).toHaveTextContent("0");
    });
    expect(apiMocks.markPaymentNotificationsRead).toHaveBeenCalledWith(
      "restaurant-1",
    );
  });
});
