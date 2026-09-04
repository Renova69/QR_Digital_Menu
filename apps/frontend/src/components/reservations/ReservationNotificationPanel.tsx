import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import {
  getReservationSmsUsage,
  listReservationNotificationDeliveries,
  retryReservationNotification,
  type ReservationNotificationDelivery,
} from "../../lib/api";
import { DashboardButton } from "../dashboard/DashboardButton";
import { format24h } from "./shared";
import {
  canRetryReservationNotification,
  getReservationNotificationState,
  getReservationNotificationTimestamp,
  type ReservationNotificationDisplayState,
} from "./reservationNotificationState";

interface ReservationNotificationPanelProps {
  restaurantId: string;
  timezone?: string;
}

const STATE_CLASSES: Record<ReservationNotificationDisplayState, string> = {
  pending: "bg-amber-100 text-amber-800",
  processing: "bg-amber-100 text-amber-800",
  retryScheduled: "bg-amber-100 text-amber-800",
  accepted: "bg-blue-100 text-blue-800",
  sent: "bg-blue-100 text-blue-800",
  delayed: "bg-amber-100 text-amber-800",
  delivered: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
  bounced: "bg-red-100 text-red-800",
  complained: "bg-red-100 text-red-800",
  uncertain: "bg-violet-100 text-violet-800",
};

const STATE_FALLBACKS: Record<ReservationNotificationDisplayState, string> = {
  pending: "Queued",
  processing: "Sending",
  retryScheduled: "Retry scheduled",
  accepted: "Provider accepted",
  sent: "Sent",
  delayed: "Delayed",
  delivered: "Delivered",
  failed: "Failed",
  bounced: "Bounced",
  complained: "Spam complaint",
  uncertain: "Outcome unknown",
};

export function ReservationNotificationPanel({
  restaurantId,
  timezone,
}: ReservationNotificationPanelProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const historyKey = ["reservation-notification-deliveries", restaurantId];
  const usageKey = ["reservation-sms-usage", restaurantId];

  const history = useQuery({
    queryKey: historyKey,
    queryFn: () => listReservationNotificationDeliveries(restaurantId),
    enabled: !!restaurantId,
    refetchInterval: 30_000,
  });
  const usage = useQuery({
    queryKey: usageKey,
    queryFn: () => getReservationSmsUsage(restaurantId),
    enabled: !!restaurantId,
    refetchInterval: 60_000,
  });
  const retry = useMutation({
    mutationFn: (deliveryId: string) =>
      retryReservationNotification(restaurantId, deliveryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usageKey }),
    // A 409 means another operator or worker changed the row first. Refresh on
    // every outcome so the dashboard shows the authoritative state instead of
    // leaving a stale Retry button behind.
    onSettled: () => queryClient.invalidateQueries({ queryKey: historyKey }),
  });

  const deliveries = (history.data ?? []).filter((delivery) =>
    delivery.sourceType.startsWith("RESERVATION_"),
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">
              {t(
                "reservations.notifications.smsUsageTitle",
                "Monthly SMS usage",
              )}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "reservations.notifications.smsUsageHelp",
                "Segments are tracked for visibility only. Reservations are never blocked.",
              )}
            </p>
          </div>
          {usage.data && (
            <span className="text-xs text-muted-foreground">
              {usage.data.periodMonth} · {usage.data.timezone}
            </span>
          )}
        </div>

        {usage.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {t("reservations.notifications.loadingUsage", "Loading SMS usage…")}
          </p>
        ) : usage.isError ? (
          <LoadError onRetry={() => void usage.refetch()} kind="usage" />
        ) : usage.data ? (
          <SmsUsageSummary usage={usage.data} />
        ) : null}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">
              {t("reservations.notifications.historyTitle", "Delivery history")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "reservations.notifications.historyHelp",
                "Provider acceptance, sending and confirmed delivery are shown separately.",
              )}
            </p>
          </div>
          <DashboardButton
            density="compact"
            className="border border-border bg-background text-foreground"
            onClick={() => void history.refetch()}
            disabled={history.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${history.isFetching ? "animate-spin" : ""}`}
            />
            {t("reservations.notifications.refresh", "Refresh")}
          </DashboardButton>
        </div>

        {retry.isError && (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {t(
              "reservations.notifications.retryError",
              "The delivery could not be queued again. Refresh and check its current status.",
            )}
          </p>
        )}

        {history.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">
            {t(
              "reservations.notifications.loadingHistory",
              "Loading delivery history…",
            )}
          </p>
        ) : history.isError ? (
          <LoadError onRetry={() => void history.refetch()} kind="history" />
        ) : deliveries.length === 0 ? (
          <p className="mt-4 rounded-lg bg-muted/50 px-4 py-6 text-center text-sm text-muted-foreground">
            {t(
              "reservations.notifications.empty",
              "No reservation notifications have been queued yet.",
            )}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {deliveries.map((delivery) => (
              <DeliveryCard
                key={delivery.id}
                delivery={delivery}
                timezone={timezone}
                locale={i18n.language}
                retrying={retry.isPending && retry.variables === delivery.id}
                onRetry={() => retry.mutate(delivery.id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SmsUsageSummary({
  usage,
}: {
  usage: Awaited<ReturnType<typeof getReservationSmsUsage>>;
}) {
  const { t } = useTranslation();
  const percentage =
    usage.includedSegments > 0
      ? Math.round((usage.usedSegments / usage.includedSegments) * 100)
      : usage.usedSegments > 0
        ? 100
        : 0;
  const meterWidth = Math.min(100, Math.max(0, percentage));
  const nearingAllowance =
    usage.includedSegments > 0 &&
    percentage >= 80 &&
    usage.overageSegments === 0;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-2xl font-bold text-foreground">
          {t("reservations.notifications.segmentsUsed", {
            used: usage.usedSegments,
            included: usage.includedSegments,
            defaultValue: "{{used}} of {{included}} segments used",
          })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("reservations.notifications.deliveryCount", {
            count: usage.deliveryCount,
            defaultValue: "{{count}} SMS deliveries",
          })}
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={Math.max(usage.includedSegments, usage.usedSegments, 1)}
        aria-valuenow={usage.usedSegments}
      >
        <div
          className={`h-full rounded-full ${usage.overageSegments > 0 ? "bg-red-500" : nearingAllowance ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${meterWidth}%` }}
        />
      </div>
      {usage.overageSegments > 0 ? (
        <UsageNotice tone="danger">
          {t("reservations.notifications.overAllowance", {
            count: usage.overageSegments,
            defaultValue:
              "{{count}} segments above the included allowance. Tracking only; messages remain enabled.",
          })}
        </UsageNotice>
      ) : nearingAllowance ? (
        <UsageNotice tone="warning">
          {t("reservations.notifications.nearAllowance", {
            percent: percentage,
            defaultValue:
              "{{percent}}% of this month's included SMS segments have been used.",
          })}
        </UsageNotice>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("reservations.notifications.segmentsRemaining", {
            count: usage.remainingSegments,
            defaultValue: "{{count}} included segments remaining.",
          })}
        </p>
      )}
    </div>
  );
}

function UsageNotice({
  tone,
  children,
}: {
  tone: "warning" | "danger";
  children: ReactNode;
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
        tone === "danger"
          ? "bg-red-50 text-red-800"
          : "bg-amber-50 text-amber-900"
      }`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function DeliveryCard({
  delivery,
  timezone,
  locale,
  retrying,
  onRetry,
}: {
  delivery: ReservationNotificationDelivery;
  timezone?: string;
  locale?: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  const state = getReservationNotificationState(delivery);
  const occurredAt = getReservationNotificationTimestamp(delivery, state);
  const isDelivered = state === "delivered";
  const isProblem = ["failed", "bounced", "complained", "uncertain"].includes(
    state,
  );

  return (
    <article className="rounded-xl border border-border bg-background p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`mt-0.5 rounded-full p-2 ${delivery.channel === "EMAIL" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}
            aria-hidden="true"
          >
            {delivery.channel === "EMAIL" ? (
              <Mail className="h-4 w-4" />
            ) : (
              <MessageSquareText className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">
                {delivery.reservation?.guestName ??
                  t(
                    "reservations.notifications.reservationUnavailable",
                    "Reservation unavailable",
                  )}
              </p>
              {delivery.reservation?.referenceCode && (
                <span className="font-mono text-xs text-muted-foreground">
                  #{delivery.reservation.referenceCode}
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {sourceLabel(delivery.sourceType, t)} ·{" "}
              {delivery.channel === "EMAIL"
                ? t("reservations.notifications.email", "Email")
                : t("reservations.notifications.sms", "SMS")}
            </p>
            {delivery.reservation?.startsAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("reservations.notifications.bookingTime", "Booking")}:{" "}
                {format24h(delivery.reservation.startsAt, timezone, locale)}
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_CLASSES[state]}`}
          >
            {isDelivered ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : isProblem ? (
              <AlertTriangle className="h-3.5 w-3.5" />
            ) : (
              <Clock3 className="h-3.5 w-3.5" />
            )}
            {t(
              `reservations.notifications.status.${state}`,
              STATE_FALLBACKS[state],
            )}
          </span>
          {canRetryReservationNotification(delivery) && (
            <DashboardButton
              density="compact"
              className="border border-red-300 bg-white text-red-700"
              onClick={onRetry}
              disabled={retrying}
            >
              <RefreshCw
                className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`}
              />
              {retrying
                ? t("reservations.notifications.retrying", "Retrying…")
                : t("reservations.notifications.retry", "Retry")}
            </DashboardButton>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
        <span>
          {t("reservations.notifications.updatedAt", "Status updated")}:{" "}
          {format24h(occurredAt, timezone, locale)}
        </span>
        {delivery.channel === "SMS" && delivery.smsSegmentCount != null && (
          <span>
            {t("reservations.notifications.segmentCount", {
              count: delivery.smsSegmentCount,
              defaultValue: "SMS segments: {{count}}",
            })}
          </span>
        )}
        {delivery.attempts > 1 && (
          <span>
            {t("reservations.notifications.attempts", {
              count: delivery.attempts,
              max: delivery.maxAttempts,
              defaultValue: "Attempt {{count}} of {{max}}",
            })}
          </span>
        )}
      </div>

      {state === "uncertain" && (
        <p className="mt-2 text-xs text-violet-800">
          {t(
            "reservations.notifications.uncertainHelp",
            "The provider outcome is unknown. Retry is disabled to avoid sending a duplicate.",
          )}
        </p>
      )}
    </article>
  );
}

function sourceLabel(sourceType: string, t: TFunction): string {
  switch (sourceType) {
    case "RESERVATION_OWNER_NEW":
      return t(
        "reservations.notifications.source.ownerNew",
        "New booking alert",
      );
    case "RESERVATION_REMINDER":
      return t(
        "reservations.notifications.source.reminder",
        "Reservation reminder",
      );
    default:
      return t(
        "reservations.notifications.source.lifecycle",
        "Guest reservation update",
      );
  }
}

function LoadError({
  onRetry,
  kind,
}: {
  onRetry: () => void;
  kind: "usage" | "history";
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 flex flex-col gap-3 rounded-lg bg-red-50 px-3 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
      <span>
        {kind === "usage"
          ? t(
              "reservations.notifications.usageError",
              "SMS usage is temporarily unavailable.",
            )
          : t(
              "reservations.notifications.historyError",
              "Delivery history is temporarily unavailable.",
            )}
      </span>
      <DashboardButton
        density="compact"
        className="border border-red-300 bg-white text-red-700"
        onClick={onRetry}
      >
        {t("reservations.notifications.tryAgain", "Try again")}
      </DashboardButton>
    </div>
  );
}
