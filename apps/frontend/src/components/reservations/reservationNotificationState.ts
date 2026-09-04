import type { ReservationNotificationDelivery } from "../../lib/api";

export type ReservationNotificationDisplayState =
  | "pending"
  | "processing"
  | "retryScheduled"
  | "accepted"
  | "sent"
  | "delayed"
  | "delivered"
  | "failed"
  | "bounced"
  | "complained"
  | "uncertain";

export function getReservationNotificationState(
  delivery: ReservationNotificationDelivery,
): ReservationNotificationDisplayState {
  // Email sends with an ambiguous provider response are automatically retried,
  // while ambiguous SMS sends stop for reconciliation to avoid duplicates.
  // Show the scheduled action when one exists; reserve "unknown" for the
  // terminal state that genuinely needs operator attention.
  if (delivery.outcomeUncertain && delivery.status === "FAILED") {
    return "uncertain";
  }

  if (delivery.channel === "EMAIL") {
    switch (delivery.emailDeliveryStatus) {
      case "COMPLAINED":
        return "complained";
      case "BOUNCED":
        return "bounced";
      case "DELIVERED":
        return "delivered";
      case "FAILED":
        return "failed";
      case "DELAYED":
        return "delayed";
      case "SENT":
        return "sent";
      case "ACCEPTED":
        return "accepted";
    }
  } else {
    switch (delivery.smsDeliveryStatus) {
      case "FAILED":
        return "failed";
      case "DELIVERED":
        return "delivered";
      case "SENT":
        return "sent";
      case "ACCEPTED":
        return "accepted";
    }
  }

  if (delivery.status === "FAILED") return "failed";

  // Timestamp fallback keeps rows written before receipt-status persistence
  // readable. When an enum exists above, it remains the authoritative state.
  if (delivery.channel === "EMAIL") {
    if (delivery.emailComplainedAt) return "complained";
    if (delivery.emailFailedAt) return "failed";
    if (delivery.emailDeliveredAt) return "delivered";
    if (delivery.emailSentAt) return "sent";
  } else {
    if (delivery.smsFailedAt) return "failed";
    if (delivery.smsDeliveredAt) return "delivered";
    if (delivery.smsSentAt) return "sent";
  }

  switch (delivery.status) {
    case "PROCESSING":
      return "processing";
    case "RETRY_SCHEDULED":
      return "retryScheduled";
    case "ACCEPTED":
      return "accepted";
    default:
      return "pending";
  }
}

export function canRetryReservationNotification(
  delivery: ReservationNotificationDelivery,
): boolean {
  return (
    delivery.status === "FAILED" &&
    !delivery.outcomeUncertain &&
    getReservationNotificationState(delivery) === "failed"
  );
}

export function getReservationNotificationTimestamp(
  delivery: ReservationNotificationDelivery,
  state: ReservationNotificationDisplayState,
): string {
  if (state === "delivered") {
    return (
      delivery.emailDeliveredAt ?? delivery.smsDeliveredAt ?? delivery.updatedAt
    );
  }
  if (state === "complained") {
    return delivery.emailComplainedAt ?? delivery.updatedAt;
  }
  if (state === "failed" || state === "bounced") {
    return delivery.emailFailedAt ?? delivery.smsFailedAt ?? delivery.updatedAt;
  }
  if (state === "sent") {
    return delivery.emailSentAt ?? delivery.smsSentAt ?? delivery.updatedAt;
  }
  if (state === "accepted") {
    return delivery.acceptedAt ?? delivery.updatedAt;
  }
  return delivery.updatedAt ?? delivery.createdAt;
}
