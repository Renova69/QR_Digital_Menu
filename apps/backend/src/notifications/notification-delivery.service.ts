import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  EmailDeliveryStatus,
  NotificationChannel,
  type NotificationDelivery,
  NotificationDeliveryStatus,
  Prisma,
  SubscriptionTier,
} from '@prisma/client';
import { SentryCron } from '@sentry/nestjs';
import { createHash, randomUUID } from 'node:crypto';
import { cronMonitor } from '../common/cron-monitor';
import { CRON_EVERY_MINUTE } from '../common/cron-schedules';
import { PrismaService } from '../prisma/prisma.service';
import {
  type DeliveryPayload,
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
  type ProviderDeliveryResult,
} from './notification-provider';
import { SmsUsageService, type SmsPolicySnapshot } from './sms-usage.service';

const LEASE_DURATION_MS = 60_000;
const MAX_DRAIN_BATCH = 50;

/**
 * Settling a claimed delivery is two or three small writes, but it competes
 * for a connection pool shared with every other cron. Prisma's 5s default was
 * being exhausted by contention rather than by the work itself (Sentry
 * QR-MENU-BACKEND-8: "4999 ms passed" on a single `updateMany`), and a thrown
 * settlement leaves the row PROCESSING until its lease expires — so the
 * provider call is repeated even though it already succeeded. Prefer waiting
 * over redoing side-effectful work.
 *
 * maxWait + timeout must stay comfortably below LEASE_DURATION_MS, since the
 * provider call already consumed part of the lease before we get here — if the
 * lease expires mid-settlement another worker reclaims the row and the
 * `leaseToken` guard in the update silently matches nothing.
 */
const SETTLE_TX_OPTIONS = { timeout: 20_000, maxWait: 10_000 } as const;

type ClaimedDelivery = NotificationDelivery & {
  previousStatus: NotificationDeliveryStatus;
  restaurantTier: SubscriptionTier;
  restaurantForceTier: SubscriptionTier | null;
};

export type EnqueueDeliveryInput = {
  restaurantId: string;
  sourceType: string;
  sourceId: string;
  deduplicationKey: string;
  channel: NotificationChannel;
  payload: DeliveryPayload;
  maxAttempts?: number;
};

type NotificationDeliveryClient = Pick<
  Prisma.TransactionClient,
  'notificationDelivery'
>;

export type NotificationDeliverySourceFamily = 'RESERVATION';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly provider: NotificationProvider,
    private readonly smsUsage: SmsUsageService,
  ) {}

  hashPayload(payload: DeliveryPayload): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  async enqueue(
    input: EnqueueDeliveryInput,
    client: NotificationDeliveryClient = this.prisma,
  ): Promise<NotificationDelivery> {
    const payloadHash = this.hashPayload(input.payload);
    const existing = await client.notificationDelivery.upsert({
      where: {
        restaurantId_deduplicationKey_channel: {
          restaurantId: input.restaurantId,
          deduplicationKey: input.deduplicationKey,
          channel: input.channel,
        },
      },
      create: {
        restaurantId: input.restaurantId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        deduplicationKey: input.deduplicationKey,
        channel: input.channel,
        payload: input.payload,
        payloadHash,
        maxAttempts: input.maxAttempts ?? 5,
      },
      // Upsert avoids catching P2002 inside an interactive transaction. In
      // PostgreSQL a unique violation aborts the whole transaction, so the old
      // create-then-find pattern could not safely support atomic outbox writes.
      update: {},
    });
    if (existing.payloadHash !== payloadHash) {
      throw new ConflictException({
        code: 'NOTIFICATION_IDEMPOTENCY_MISMATCH',
        message:
          'This notification identity was already used for a different payload.',
      });
    }
    return existing;
  }

  async enqueueMany(
    inputs: EnqueueDeliveryInput[],
    client: NotificationDeliveryClient = this.prisma,
  ): Promise<NotificationDelivery[]> {
    const deliveries: NotificationDelivery[] = [];
    // Sequential writes are intentional when `client` is a transaction: one
    // failed leg must roll back the reservation change and every outbox leg.
    for (const input of inputs) {
      deliveries.push(await this.enqueue(input, client));
    }
    return deliveries;
  }

  // waitForCompletion matters more here than anywhere else: a drain can make
  // up to MAX_DRAIN_BATCH provider calls, each with network latency, so it can
  // easily outrun its own one-minute interval. Without the guard, overlapping
  // drains stack up and each one holds pool connections.
  // @Cron must stay ABOVE @SentryCron. Decorators apply bottom-up, so
  // SentryCron wraps the method first and @Cron then registers the wrapped
  // version. Reversed, the scheduler would register the unwrapped method and
  // no check-in would ever be sent — silently.
  @Cron(CRON_EVERY_MINUTE.NOTIFICATION_DRAIN_DUE, {
    name: 'notificationDrainDue',
    waitForCompletion: true,
  })
  @SentryCron(
    'notification-drain-due',
    cronMonitor(CRON_EVERY_MINUTE.NOTIFICATION_DRAIN_DUE, {
      // Worst legitimate run is MAX_DRAIN_BATCH (50) provider calls that each
      // burn the full PROVIDER_HTTP_TIMEOUT_MS (10s) — 500s, or 8m20s. Anything
      // at or below that would flag a healthy-but-slow drain as failed, so keep
      // real headroom above it.
      maxRuntimeMinutes: 15,
      // The margin has to cover the same 8m20s. waitForCompletion drops every
      // tick while a drain is still running, so a long healthy run produces a
      // string of check-in-less minutes; with a short margin those read as
      // missed and open an issue on their own.
      checkinMarginMinutes: 10,
      failureIssueThreshold: 3,
    }),
  )
  async drainDue(): Promise<number> {
    let processed = 0;
    while (processed < MAX_DRAIN_BATCH && (await this.processNext())) {
      processed += 1;
    }
    return processed;
  }

  async processNext(now = new Date()): Promise<boolean> {
    const leaseToken = randomUUID();
    const leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);
    const rows = await this.prisma.$queryRaw<ClaimedDelivery[]>(Prisma.sql`
      WITH candidate AS (
        SELECT
          delivery."id",
          delivery."status" AS "previousStatus",
          restaurant."tier" AS "restaurantTier",
          restaurant."forceTier" AS "restaurantForceTier"
        FROM "notification_delivery" AS delivery
        INNER JOIN "restaurant" AS restaurant
          ON restaurant."id" = delivery."restaurantId"
        WHERE (
          delivery."status" IN ('PENDING', 'RETRY_SCHEDULED')
          AND delivery."nextAttemptAt" <= ${now}
        ) OR (
          delivery."status" = 'PROCESSING'
          AND delivery."leaseExpiresAt" <= ${now}
        )
        ORDER BY delivery."nextAttemptAt" ASC, delivery."createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "notification_delivery" AS delivery
      SET
        "status" = 'PROCESSING',
        "attempts" = delivery."attempts" + 1,
        "leaseToken" = ${leaseToken},
        "leaseExpiresAt" = ${leaseExpiresAt},
        "updatedAt" = ${now}
      FROM candidate
      WHERE delivery."id" = candidate."id"
      RETURNING
        delivery.*,
        candidate."previousStatus",
        candidate."restaurantTier",
        candidate."restaurantForceTier"
    `);
    const claimed = rows[0];
    if (!claimed) return false;

    const smsPolicy: SmsPolicySnapshot | null =
      claimed.channel === NotificationChannel.SMS
        ? this.smsUsage.getPolicySnapshot(
            claimed.restaurantTier,
            claimed.restaurantForceTier,
          )
        : null;

    if (
      claimed.channel === NotificationChannel.SMS &&
      claimed.previousStatus === NotificationDeliveryStatus.PROCESSING
    ) {
      await this.settleFailure(claimed, now, {
        accepted: false,
        retryable: false,
        outcomeUncertain: true,
        error:
          'SMS provider outcome is unknown after the previous worker was interrupted',
      });
      return true;
    }

    let result: ProviderDeliveryResult;
    try {
      result = await this.provider.send(claimed);
    } catch (error) {
      result = {
        accepted: false,
        retryable: true,
        outcomeUncertain: true,
        error: error instanceof Error ? error.message : 'Provider call failed',
      };
    }

    if (result.accepted) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.notificationDelivery.updateMany({
          where: { id: claimed.id, leaseToken: claimed.leaseToken },
          data: {
            status: NotificationDeliveryStatus.ACCEPTED,
            providerMessageId: result.providerMessageId,
            acceptedAt: now,
            outcomeUncertain: false,
            lastError: null,
            leaseToken: null,
            leaseExpiresAt: null,
            ...(result.sms && smsPolicy
              ? this.smsUsage.acceptanceData(smsPolicy, result.sms)
              : {}),
          },
        });
        if (updated.count === 1) {
          if (claimed.channel === NotificationChannel.EMAIL) {
            // A signed Resend receipt can win the race with this settlement.
            // Only fill the initial state when no receipt has already moved
            // the delivery forward (or into a terminal failure state).
            await tx.notificationDelivery.updateMany({
              where: {
                id: claimed.id,
                emailDeliveryStatus: null,
              },
              data: { emailDeliveryStatus: EmailDeliveryStatus.ACCEPTED },
            });
          }
          await this.completeSource(tx, claimed, now, 'accepted');
        }
      }, SETTLE_TX_OPTIONS);
    } else {
      await this.settleFailure(claimed, now, result);
    }
    return true;
  }

  private async settleFailure(
    claimed: ClaimedDelivery,
    now: Date,
    failure: Extract<ProviderDeliveryResult, { accepted: false }>,
  ): Promise<void> {
    const safeToRetryUnknown = claimed.channel === NotificationChannel.EMAIL;
    const retry =
      failure.retryable &&
      claimed.attempts < claimed.maxAttempts &&
      (!failure.outcomeUncertain || safeToRetryUnknown);
    const retryDelayMs = Math.min(
      60_000 * 2 ** Math.max(0, claimed.attempts - 1),
      60 * 60 * 1000,
    );
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.notificationDelivery.updateMany({
        where: { id: claimed.id, leaseToken: claimed.leaseToken },
        data: {
          status: retry
            ? NotificationDeliveryStatus.RETRY_SCHEDULED
            : NotificationDeliveryStatus.FAILED,
          nextAttemptAt: retry
            ? new Date(now.getTime() + retryDelayMs)
            : claimed.nextAttemptAt,
          outcomeUncertain: failure.outcomeUncertain,
          lastError: failure.error.slice(0, 500),
          leaseToken: null,
          leaseExpiresAt: null,
        },
      });
      // FAILED is terminal (retries exhausted or non-retryable) — this may
      // be the last outstanding leg for its source, so re-check completion
      // the same way an ACCEPTED settlement does. Without this, a
      // reservation whose *last* pending leg resolves via permanent failure
      // (rather than acceptance) never gets `reminderSentAt` stamped and is
      // re-selected by the sweep forever. See completeSource: this only
      // applies to RESERVATION_REMINDER, never to LOYALTY_EXPIRY_REMINDER.
      if (updated.count === 1 && !retry) {
        await this.completeSource(tx, claimed, now, 'failed');
      }
    }, SETTLE_TX_OPTIONS);
  }

  private async completeSource(
    tx: Prisma.TransactionClient,
    delivery: ClaimedDelivery,
    resolvedAt: Date,
    terminal: 'accepted' | 'failed',
  ): Promise<void> {
    if (delivery.sourceType === 'RESERVATION_REMINDER') {
      // "Incomplete" means still in flight (PENDING/PROCESSING/
      // RETRY_SCHEDULED) — not "not yet successfully delivered". FAILED is
      // itself a terminal state (settleFailure only sets it once retries are
      // exhausted or the failure is non-retryable), so it must count as
      // resolved here too. Otherwise a reservation with one ACCEPTED leg and
      // one permanently-FAILED leg (e.g. SMS provider consistently rejects)
      // never gets its `reminderSentAt` stamped, and the reminder sweep
      // (reservation-reminder.service.ts) re-selects the same reservation
      // every 30 minutes forever. `reminderSentAt` therefore means "every
      // attempted channel reached a terminal state", not "the guest was
      // definitely reached" — per-channel outcome is still visible via
      // NotificationDeliveryService.listForRestaurant.
      const incomplete = await tx.notificationDelivery.count({
        where: {
          restaurantId: delivery.restaurantId,
          sourceType: delivery.sourceType,
          sourceId: delivery.sourceId,
          status: {
            notIn: [
              NotificationDeliveryStatus.ACCEPTED,
              NotificationDeliveryStatus.FAILED,
            ],
          },
        },
      });
      if (incomplete === 0) {
        await tx.reservation.updateMany({
          where: {
            id: delivery.sourceId,
            restaurantId: delivery.restaurantId,
            reminderSentAt: null,
          },
          data: { reminderSentAt: resolvedAt },
        });
      }
      return;
    }

    if (delivery.sourceType === 'LOYALTY_EXPIRY_REMINDER') {
      // Unlike reservations, loyalty reminders are re-evaluated daily from
      // the ledger's expiry window rather than a one-shot "due" queue, and
      // stamping reminderSentAt is exactly the "false success" outcome this
      // durable-delivery system exists to prevent (see PRD-003). Only ever
      // stamp it on genuine provider acceptance — a permanently-failed
      // loyalty email must remain eligible for a future attempt/backfill,
      // not be silently marked as sent.
      if (terminal !== 'accepted') return;
      const payload = delivery.payload as DeliveryPayload;
      if (payload.ledgerBatchIds?.length) {
        await tx.loyaltyPointLedger.updateMany({
          where: { id: { in: payload.ledgerBatchIds }, reminderSentAt: null },
          data: { reminderSentAt: resolvedAt },
        });
      }
    }
  }

  async listForRestaurant(
    restaurantId: string,
    userId: string,
    status?: NotificationDeliveryStatus,
    sourceFamily?: NotificationDeliverySourceFamily,
  ) {
    await this.assertManagementAccess(restaurantId, userId);
    const deliveries = await this.prisma.notificationDelivery.findMany({
      where: {
        restaurantId,
        ...(status ? { status } : {}),
        ...(sourceFamily === 'RESERVATION'
          ? { sourceType: { startsWith: 'RESERVATION_' } }
          : {}),
      },
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        channel: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        nextAttemptAt: true,
        providerMessageId: true,
        emailDeliveryStatus: true,
        emailProviderStatus: true,
        emailSentAt: true,
        emailDeliveredAt: true,
        emailFailedAt: true,
        emailComplainedAt: true,
        emailLastReceiptAt: true,
        emailLastEventAt: true,
        emailFailureCode: true,
        smsProvider: true,
        smsDeliveryStatus: true,
        smsProviderStatus: true,
        smsSegmentCount: true,
        smsEstimatedCostMicros: true,
        smsProviderCostMicros: true,
        smsEstimatedCostCurrency: true,
        smsProviderCostCurrency: true,
        smsEffectiveTier: true,
        smsAllowanceAtSend: true,
        smsDeliveredPartCount: true,
        smsSentAt: true,
        smsDeliveredAt: true,
        smsFailedAt: true,
        smsLastReceiptAt: true,
        smsFailureCode: true,
        outcomeUncertain: true,
        lastError: true,
        acceptedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (sourceFamily !== 'RESERVATION') return deliveries;

    const reservationIds = [
      ...new Set(
        deliveries
          .filter((delivery) => delivery.sourceType.startsWith('RESERVATION_'))
          .map((delivery) => delivery.sourceId),
      ),
    ];
    if (reservationIds.length === 0) {
      return deliveries.map((delivery) => ({
        ...delivery,
        reservation: null,
      }));
    }

    const reservations = await this.prisma.reservation.findMany({
      where: { restaurantId, id: { in: reservationIds } },
      select: {
        id: true,
        referenceCode: true,
        guestName: true,
        startsAt: true,
      },
    });
    const reservationById = new Map(
      reservations.map((reservation) => [reservation.id, reservation]),
    );

    return deliveries.map((delivery) => ({
      ...delivery,
      reservation: reservationById.get(delivery.sourceId) ?? null,
    }));
  }

  async getSmsUsage(
    restaurantId: string,
    userId: string,
    periodMonth?: string,
  ) {
    await this.assertManagementAccess(restaurantId, userId);
    return this.smsUsage.getSummary(restaurantId, periodMonth);
  }

  async retryFailed(
    restaurantId: string,
    deliveryId: string,
    userId: string,
    now = new Date(),
  ) {
    await this.assertManagementAccess(restaurantId, userId);
    const delivery = await this.prisma.notificationDelivery.findFirst({
      where: { id: deliveryId, restaurantId },
      select: { status: true, outcomeUncertain: true },
    });
    if (!delivery) throw new ForbiddenException('Forbidden');
    if (delivery.status !== NotificationDeliveryStatus.FAILED) {
      throw new ConflictException({
        code: 'NOTIFICATION_NOT_FAILED',
        message: 'Only failed notification deliveries can be retried.',
      });
    }
    if (delivery.outcomeUncertain) {
      throw new ConflictException({
        code: 'NOTIFICATION_OUTCOME_UNCERTAIN',
        message:
          'Provider reconciliation is required before retrying this delivery.',
      });
    }

    const updated = await this.prisma.notificationDelivery.updateMany({
      where: {
        id: deliveryId,
        restaurantId,
        status: NotificationDeliveryStatus.FAILED,
        outcomeUncertain: false,
      },
      data: {
        status: NotificationDeliveryStatus.PENDING,
        attempts: 0,
        nextAttemptAt: now,
        lastError: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    if (updated.count !== 1) {
      throw new ConflictException({
        code: 'NOTIFICATION_RETRY_RACE',
        message: 'The delivery state changed before it could be retried.',
      });
    }
    return { id: deliveryId, status: NotificationDeliveryStatus.PENDING };
  }

  private async assertManagementAccess(
    restaurantId: string,
    userId: string,
  ): Promise<void> {
    const restaurant = await this.prisma.restaurant.findFirst({
      where: {
        id: restaurantId,
        OR: [{ ownerId: userId }, { staffMembers: { some: { id: userId } } }],
      },
      select: { id: true },
    });
    if (!restaurant) throw new ForbiddenException('Forbidden');
  }
}
