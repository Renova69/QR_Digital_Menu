import { describe, expect, it } from "vitest";
import type { ReservationNotificationDelivery } from "../../lib/api";
import {
  canRetryReservationNotification,
  getReservationNotificationState,
} from "./reservationNotificationState";

function delivery(
  overrides: Partial<ReservationNotificationDelivery> = {},
): ReservationNotificationDelivery {
  return {
    id: "delivery-1",
    sourceType: "RESERVATION_LIFECYCLE",
    sourceId: "reservation-1",
    channel: "EMAIL",
    status: "PENDING",
    attempts: 0,
    maxAttempts: 5,
    nextAttemptAt: "2030-01-01T12:00:00.000Z",
    emailDeliveryStatus: null,
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
    acceptedAt: null,
    createdAt: "2030-01-01T11:00:00.000Z",
    updatedAt: "2030-01-01T11:00:00.000Z",
    reservation: null,
    ...overrides,
  };
}

describe("reservation notification display state", () => {
  it.each([
    [{}, "pending"],
    [{ status: "PROCESSING" }, "processing"],
    [{ status: "RETRY_SCHEDULED" }, "retryScheduled"],
    [{ status: "ACCEPTED" }, "accepted"],
    [{ status: "ACCEPTED", emailDeliveryStatus: "SENT" }, "sent"],
    [{ status: "ACCEPTED", emailDeliveryStatus: "DELAYED" }, "delayed"],
    [{ status: "ACCEPTED", emailDeliveryStatus: "DELIVERED" }, "delivered"],
    [{ status: "ACCEPTED", emailDeliveryStatus: "BOUNCED" }, "bounced"],
    [{ status: "ACCEPTED", emailDeliveryStatus: "COMPLAINED" }, "complained"],
    [{ status: "FAILED" }, "failed"],
    [{ status: "FAILED", outcomeUncertain: true }, "uncertain"],
    [{ status: "RETRY_SCHEDULED", outcomeUncertain: true }, "retryScheduled"],
  ] as const)("maps provider and queue state %#", (overrides, expected) => {
    expect(
      getReservationNotificationState(
        delivery(overrides as Partial<ReservationNotificationDelivery>),
      ),
    ).toBe(expected);
  });

  it("treats the current provider status as authoritative over older timestamps", () => {
    expect(
      getReservationNotificationState(
        delivery({
          channel: "SMS",
          status: "ACCEPTED",
          smsDeliveryStatus: "FAILED",
          smsDeliveredAt: "2030-01-01T12:00:00.000Z",
          smsFailedAt: "2030-01-01T12:05:00.000Z",
        }),
      ),
    ).toBe("failed");
  });

  it("does not mistake provider acceptance for confirmed delivery", () => {
    expect(
      getReservationNotificationState(
        delivery({
          status: "ACCEPTED",
          emailDeliveryStatus: "ACCEPTED",
          acceptedAt: "2030-01-01T12:00:00.000Z",
        }),
      ),
    ).toBe("accepted");
  });

  it.each([
    ["ACCEPTED", "accepted"],
    ["SENT", "sent"],
    ["DELIVERED", "delivered"],
    ["FAILED", "failed"],
  ] as const)("maps SMS provider state %s", (smsDeliveryStatus, expected) => {
    expect(
      getReservationNotificationState(
        delivery({
          channel: "SMS",
          status: "ACCEPTED",
          smsDeliveryStatus,
        }),
      ),
    ).toBe(expected);
  });

  it("allows retry only for a known permanent queue failure", () => {
    expect(
      canRetryReservationNotification(delivery({ status: "FAILED" })),
    ).toBe(true);
    expect(
      canRetryReservationNotification(
        delivery({ status: "FAILED", outcomeUncertain: true }),
      ),
    ).toBe(false);
    expect(
      canRetryReservationNotification(
        delivery({ status: "ACCEPTED", emailDeliveryStatus: "BOUNCED" }),
      ),
    ).toBe(false);
  });
});
