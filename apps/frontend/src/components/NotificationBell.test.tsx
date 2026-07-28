import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NotificationBell from "./NotificationBell";

const notificationMocks = vi.hoisted(() => ({
  markAllRead: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../context/NotificationContext", () => ({
  useNotifications: () => ({
    notifications: [
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
        timestamp: Date.now(),
        read: false,
      },
    ],
    unreadCount: 1,
    markAllRead: notificationMocks.markAllRead,
  }),
}));

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks payment notifications read when the inbox is opened", async () => {
    render(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Payment notifications" }),
    );

    await waitFor(() => {
      expect(notificationMocks.markAllRead).toHaveBeenCalledOnce();
    });
  });

  it("opens the selected payment from a notification", () => {
    function LocationProbe() {
      const location = useLocation();
      return (
        <span data-testid="location">
          {location.pathname}
          {location.search}
        </span>
      );
    }

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <NotificationBell />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Payment notifications" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Payment received.*Table 7/i }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/dashboard?tab=payments&paymentId=payment-1",
    );
  });
});
