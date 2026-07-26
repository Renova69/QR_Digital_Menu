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
    i18n: { language: "en" },
  }),
}));

describe("BookingConfirmationPage live reservation status", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("manage_ABC234", "manage-secret");
    apiMocks.getReservationStatus.mockReset();
    apiMocks.getReservationConfig.mockReset();
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
    vi.useRealTimers();
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

  it("shows an explicit no-show state instead of falling back to pending", async () => {
    apiMocks.getReservationStatus.mockReset();
    apiMocks.getReservationStatus.mockResolvedValue({
      status: "NO_SHOW",
      startsAt: "2099-07-05T18:00:00.000Z",
    });

    render(
      <MemoryRouter
        initialEntries={["/booking/confirmation?r=rest-1&ref=ABC234"]}
      >
        <BookingConfirmationPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("This reservation was marked as a no-show."),
    ).toBeTruthy();
  });

  it("shows a not-found error instead of a pending state when status loading fails", async () => {
    apiMocks.getReservationStatus.mockReset();
    apiMocks.getReservationStatus.mockRejectedValue(new Error("not found"));

    render(
      <MemoryRouter
        initialEntries={["/booking/confirmation?r=rest-1&ref=UNKNOWN"]}
      >
        <BookingConfirmationPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByText("We couldn't find this reservation."),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Request received — awaiting the restaurant's confirmation.",
      ),
    ).toBeNull();
  });

  it("keeps the last known status when a later polling request fails", async () => {
    const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
    let pollAgain: (() => void) | undefined;
    const timeout = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      handler: TimerHandler,
      delay?: number,
    ) => {
      if (delay === 12000) {
        pollAgain = () => {
          if (typeof handler === "function") handler();
        };
        return 1;
      }
      return nativeSetTimeout(handler, delay);
    }) as typeof setTimeout);
    apiMocks.getReservationStatus
      .mockReset()
      .mockResolvedValueOnce({
        status: "PENDING",
        startsAt: "2099-07-05T18:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("temporary network error"));

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

    await act(async () => {
      pollAgain?.();
      await Promise.resolve();
    });

    expect(
      screen.getByText(
        "Request received — awaiting the restaurant's confirmation.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("We couldn't find this reservation.")).toBeNull();
    timeout.mockRestore();
  });
});
