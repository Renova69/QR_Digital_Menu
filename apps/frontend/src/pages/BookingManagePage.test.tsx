import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BookingManagePage from "./BookingManagePage";

const apiMocks = vi.hoisted(() => ({
  getManageReservation: vi.fn(),
  getReservationConfig: vi.fn(),
  getReservationAvailability: vi.fn(),
  cancelManageReservation: vi.fn(),
  modifyManageReservation: vi.fn(),
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
    t: (
      _key: string,
      fallbackOrOptions?: string | { defaultValue?: string; n?: number },
    ) => {
      const value =
        typeof fallbackOrOptions === "string"
          ? fallbackOrOptions
          : (fallbackOrOptions?.defaultValue ?? _key);
      return value.replace(
        /\{\{\s*n\s*\}\}/g,
        typeof fallbackOrOptions === "object" &&
          fallbackOrOptions.n !== undefined
          ? String(fallbackOrOptions.n)
          : "",
      );
    },
    i18n: { language: "en" },
  }),
}));

const pendingReservation = {
  referenceCode: "ABC234",
  status: "PENDING",
  startsAt: "2099-07-05T18:00:00.000Z",
  guestName: "Maria",
  adultsCount: 2,
  childrenCount: 0,
  totalGuests: 2,
  preferredZone: null,
  canModify: true,
  canCancel: true,
  policy: {
    maxTotalGuests: 12,
    slotIntervalMinutes: 30,
    minLeadMinutes: 60,
    bookingHorizonDays: 60,
  },
};

describe("BookingManagePage live reservation status", () => {
  beforeEach(() => {
    sessionStorage.clear();
    sessionStorage.setItem("manage_token", "manage-secret");
    apiMocks.getReservationConfig.mockResolvedValue({
      restaurant: {
        name: "Test Bistro",
        timezone: "Europe/Sofia",
        defaultTheme: "light",
      },
    });
    apiMocks.getManageReservation
      .mockResolvedValueOnce(pendingReservation)
      .mockResolvedValueOnce({
        ...pendingReservation,
        status: "CONFIRMED",
      });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    for (const event of Object.keys(socketMocks.handlers)) {
      delete socketMocks.handlers[event];
    }
  });

  it("changes the visible status as soon as the dashboard update event arrives", async () => {
    render(
      <MemoryRouter initialEntries={["/booking/manage?r=rest-1"]}>
        <BookingManagePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("PENDING")).toBeTruthy();
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

    expect(await screen.findByText("CONFIRMED")).toBeTruthy();
    await waitFor(() =>
      expect(apiMocks.getManageReservation).toHaveBeenCalledTimes(2),
    );
  });
});
