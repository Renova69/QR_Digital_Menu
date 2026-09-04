import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReservationsView from "./ReservationsView";

const api = vi.hoisted(() => ({
  listReservations: vi.fn().mockResolvedValue([]),
  getReservationAnalytics: vi.fn().mockResolvedValue(null),
  listReservationNotificationDeliveries: vi.fn().mockResolvedValue([]),
  getReservationSmsUsage: vi.fn().mockResolvedValue({
    periodMonth: "2030-01",
    timezone: "Europe/Sofia",
    trackOnly: true,
    effectiveTier: "PROFESSIONAL",
    includedSegments: 50,
    usedSegments: 0,
    remainingSegments: 50,
    overageSegments: 0,
    deliveryCount: 0,
  }),
}));

const auth = vi.hoisted(() => ({ role: "OWNER" }));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "owner-1", role: auth.role } }),
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
  listReservationNotificationDeliveries:
    api.listReservationNotificationDeliveries,
  getReservationSmsUsage: api.getReservationSmsUsage,
  retryReservationNotification: vi.fn(),
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
    auth.role = "OWNER";
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

  it("does not expose owner notification operations to other roles", () => {
    auth.role = "STAFF";
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={client}>
        <ReservationsView />
      </QueryClientProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "Notification delivery" }),
    ).toBeNull();
  });
});
