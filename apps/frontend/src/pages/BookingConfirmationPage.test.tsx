import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingConfirmationPage from "./BookingConfirmationPage";

const apiMocks = vi.hoisted(() => ({
  getReservationStatus: vi.fn(),
  getReservationConfig: vi.fn(),
}));

const socketMocks = vi.hoisted(() => {
  const handlers: Record<string, Array<(payload?: any) => void>> = {};
  const socket: any = {
    emit: vi.fn(),
    on: vi.fn((event: string, handler: (payload?: any) => void) => {
      handlers[event] = [...(handlers[event] ?? []), handler];
      return socket;
    }),
    off: vi.fn((event: string, handler: (payload?: any) => void) => {
      handlers[event] = (handlers[event] ?? []).filter((h) => h !== handler);
      return socket;
    }),
  };

  return {
    handlers,
    socket,
    state: { socket, isConnected: true },
  };
});

vi.mock("../lib/api", () => apiMocks);

vi.mock("../context/SocketContext", () => ({
  useSocket: () => socketMocks.state,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

describe("BookingConfirmationPage live reservation status", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("manage_ABC234", "manage-secret");
    apiMocks.getReservationConfig.mockResolvedValue({
      restaurant: {
        name: "Test Bistro",
        timezone: "Europe/Sofia",
        defaultTheme: "light",
      },
    });
    apiMocks.getReservationStatus
      .mockResolvedValueOnce({
        status: "PENDING",
        startsAt: "2099-07-05T18:00:00.000Z",
      })
      .mockResolvedValueOnce({
        status: "CONFIRMED",
        startsAt: "2099-07-05T18:00:00.000Z",
      });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    for (const event of Object.keys(socketMocks.handlers)) {
      delete socketMocks.handlers[event];
    }
  });

  it("changes from pending to confirmed as soon as the reservation event arrives", async () => {
    render(
      <MemoryRouter
        initialEntries={["/booking/confirmation?r=rest-1&ref=ABC234"]}
      >
        <BookingConfirmationPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(
        "Request received — awaiting the restaurant's confirmation.",
      ),
    ).toBeTruthy();
    await waitFor(() =>
      expect(socketMocks.socket.emit).toHaveBeenCalledWith(
        "joinReservationRoom",
        {
          restaurantId: "rest-1",
          token: "manage-secret",
        },
      ),
    );

    act(() => {
      for (const handler of socketMocks.handlers["reservation:updated"] ?? []) {
        handler({ id: "reservation-1", status: "CONFIRMED" });
      }
    });

    expect(
      await screen.findByText("Your reservation is confirmed. See you soon!"),
    ).toBeTruthy();
  });
});
