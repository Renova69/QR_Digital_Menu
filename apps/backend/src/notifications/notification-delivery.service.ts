import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  NotificationChannel,
  type NotificationDelivery,
  NotificationDeliveryStatus,
  Prisma,
} from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  type DeliveryPayload,
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
  type ProviderDeliveryResult,
} from './notification-provider';

const LEASE_DURATION_MS = 60_000;
const MAX_DRAIN_BATCH = 50;

type ClaimedDelivery = NotificationDelivery & {
  previousStatus: NotificationDeliveryStatus;
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

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFICATION_PROVIDER)
    private readonly provider: NotificationProvider,
  ) {}

  hashPayload(payload: DeliveryPayload): string {
    return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  async enqueue(input: EnqueueDeliveryInput): Promise<NotificationDelivery> {
    const payloadHash = this.hashPayload(input.payload);
    try {
      return await this.prisma.notificationDelivery.create({
        data: {
          restaurantId: input.restaurantId,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          deduplicationKey: input.deduplicationKey,
          channel: input.channel,
          payload: input.payload,
          payloadHash,
          maxAttempts: input.maxAttempts ?? 5,
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      const existing = await this.prisma.notificationDelivery.findUnique({
        where: {
          restaurantId_deduplicationKey_channel: {
            restaurantId: input.restaurantId,
            deduplicationKey: input.deduplicationKey,
            channel: input.channel,
          },
        },
      });
      if (!existing) throw error;
      if (existing.payloadHash !== payloadHash) {
        throw new ConflictException({
          code: 'NOTIFICATION_IDEMPOTENCY_MISMATCH',
          message:
            'This notification identity was already used for a different payload.',
        });
      }
      return existing;
    }
  }

  async enqueueMany(
    inputs: EnqueueDeliveryInput[],
  ): Promise<NotificationDelivery[]> {
    return Promise.all(inputs.map((input) => this.enqueue(input)));
  }

  @Cron(CronExpression.EVERY_MINUTE)
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
        SELECT "id", "status" AS "previousStatus"
        FROM "notification_delivery"
        WHERE (
          "status" IN ('PENDING', 'RETRY_SCHEDULED')
          AND "nextAttemptAt" <= ${now}
        ) OR (
          "status" = 'PROCESSING'
          AND "leaseExpiresAt" <= ${now}
        )
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
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
      RETURNING delivery.*, candidate."previousStatus"
    `);
    const claimed = rows[0];
    if (!claimed) return false;

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
          },
        });
        if (updated.count === 1) {
          await this.completeSource(tx, claimed, now, 'accepted');
        }
      });
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
    });
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
  ) {
    await this.assertManagementAccess(restaurantId, userId);
    return this.prisma.notificationDelivery.findMany({
      where: { restaurantId, ...(status ? { status } : {}) },
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
        outcomeUncertain: true,
        lastError: true,
        acceptedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
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
