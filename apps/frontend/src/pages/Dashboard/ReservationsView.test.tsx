import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReservationsView from "./ReservationsView";

const api = vi.hoisted(() => ({
  listReservations: vi.fn().mockResolvedValue([]),
  getReservationAnalytics: vi.fn().mockResolvedValue(null),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
    i18n: { language: "en" },
  }),
}));

vi.mock("../../context/RestaurantContext", () => ({
  useRestaurantContext: () => ({
    activeRestaurant: { id: "rest-1", timezone: "Europe/Sofia" },
  }),
}));

vi.mock("../../context/SocketContext", () => ({
  useSocket: () => ({ socket: null, isConnected: false }),
}));

vi.mock("../../lib/api", () => ({
  listReservations: api.listReservations,
  getReservationAnalytics: api.getReservationAnalytics,
  reservationAction: vi.fn(),
  getReservationSettings: vi.fn(),
  updateReservationSettings: vi.fn(),
  setReservationServiceHours: vi.fn(),
  createManualReservation: vi.fn(),
  updateReservationInternal: vi.fn(),
  listReservationBlackouts: vi.fn(),
  addReservationBlackout: vi.fn(),
  removeReservationBlackout: vi.fn(),
}));

describe("ReservationsView downgrade continuity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps existing-booking operations visible without exposing paid creation or configuration", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <ReservationsView canConfigure={false} />
      </QueryClientProvider>,
    );

    expect(
      screen.getByText(
        "Existing reservations remain available to service. Upgrade to accept or configure new bookings.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "+ New booking" })).toBeNull();
    expect(api.getReservationAnalytics).not.toHaveBeenCalled();
    expect(
      await screen.findByText("No reservations for this filter."),
    ).toBeTruthy();
  });
});
