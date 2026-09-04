import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReservationNotificationDelivery } from "../../lib/api";
import { ReservationNotificationPanel } from "./ReservationNotificationPanel";

const api = vi.hoisted(() => ({
  list: vi.fn(),
  usage: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, options?: string | Record<string, unknown>) => {
      if (typeof options === "string") return options;
      let value = String(options?.defaultValue ?? _key);
      for (const [name, replacement] of Object.entries(options ?? {})) {
        value = value.replace(`{{${name}}}`, String(replacement));
      }
      return value;
    },
    i18n: { language: "en" },
  }),
}));

vi.mock("../../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/api")>();
  return {
    ...original,
    listReservationNotificationDeliveries: api.list,
    getReservationSmsUsage: api.usage,
    retryReservationNotification: api.retry,
  };
});

function delivery(
  overrides: Partial<ReservationNotificationDelivery>,
): ReservationNotificationDelivery {
  return {
    id: "delivery-1",
    sourceType: "RESERVATION_LIFECYCLE",
    sourceId: "reservation-1",
    channel: "EMAIL",
    status: "ACCEPTED",
    attempts: 1,
    maxAttempts: 5,
    nextAttemptAt: "2030-01-01T12:00:00.000Z",
    emailDeliveryStatus: "ACCEPTED",
    emailSentAt: null,
    emailDeliveredAt: null,
    emailFailedAt: null,
    emailComplainedAt: null,
    smsProvider: null,
    smsDeliveryStatus: null,
    smsSegmentCount: null,
    smsDeliveredPartCount: 0,
    smsSentAt: null,
    smsDeliveredAt: null,
    smsFailedAt: null,
    outcomeUncertain: false,
    acceptedAt: "2030-01-01T12:00:00.000Z",
    createdAt: "2030-01-01T11:59:00.000Z",
    updatedAt: "2030-01-01T12:00:00.000Z",
    reservation: {
      referenceCode: "BOOK42",
      guestName: "Guest One",
      startsAt: "2030-01-02T17:00:00.000Z",
    },
    ...overrides,
  };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ReservationNotificationPanel
        restaurantId="restaurant-1"
        timezone="Europe/Sofia"
      />
    </QueryClientProvider>,
  );
}

describe("ReservationNotificationPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.usage.mockResolvedValue({
      periodMonth: "2030-01",
      timezone: "Europe/Sofia",
      trackOnly: true,
      effectiveTier: "PROFESSIONAL",
      includedSegments: 50,
      usedSegments: 45,
      remainingSegments: 5,
      overageSegments: 0,
      deliveryCount: 40,
    });
    api.retry.mockResolvedValue({ id: "failed-1", status: "PENDING" });
  });

  it("keeps accepted, delivered and failed states distinct and identifies the booking", async () => {
    api.list.mockResolvedValue([
      delivery({ id: "accepted-1" }),
      delivery({
        id: "delivered-1",
        channel: "SMS",
        smsDeliveryStatus: "DELIVERED",
        smsDeliveredAt: "2030-01-01T12:02:00.000Z",
        smsSegmentCount: 2,
        emailDeliveryStatus: null,
      }),
      delivery({
        id: "failed-1",
        status: "FAILED",
        emailDeliveryStatus: null,
      }),
    ]);

    renderPanel();

    expect(await screen.findByText("Provider accepted")).toBeTruthy();
    expect(screen.getByText("Delivered")).toBeTruthy();
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getAllByText("Guest One")).toHaveLength(3);
    expect(screen.getAllByText("#BOOK42")).toHaveLength(3);
    expect(
      screen.getByText(
        "90% of this month's included SMS segments have been used.",
      ),
    ).toBeTruthy();
  });

  it("queues retry only for a known failed delivery", async () => {
    api.list.mockResolvedValue([
      delivery({
        id: "failed-1",
        status: "FAILED",
        emailDeliveryStatus: null,
      }),
      delivery({
        id: "uncertain-1",
        status: "FAILED",
        emailDeliveryStatus: null,
        outcomeUncertain: true,
      }),
    ]);

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(api.retry).toHaveBeenCalledWith("restaurant-1", "failed-1");
    });
    expect(screen.getAllByRole("button", { name: /Retry/ })).toHaveLength(1);
    expect(
      screen.getByText(
        "The provider outcome is unknown. Retry is disabled to avoid sending a duplicate.",
      ),
    ).toBeTruthy();
  });
});
