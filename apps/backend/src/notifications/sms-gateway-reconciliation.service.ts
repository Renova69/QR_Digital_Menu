import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, SmsDeliveryStatus, SmsProvider } from '@prisma/client';
import { SentryCron } from '@sentry/nestjs';
import { createHash } from 'node:crypto';
import { cronMonitor } from '../common/cron-monitor';
import { CRON_EVERY_MINUTE } from '../common/cron-schedules';
import {
  getSmsGatewayMessageStatus,
  smsGatewayConfigured,
  type SmsGatewayMessageState,
  type SmsGatewayMessageStatus,
} from '../common/sms/sms-gateway';
import { PrismaService } from '../prisma/prisma.service';
import { SmsReceiptService } from './sms-receipt.service';

const MAX_RECONCILIATION_BATCH = 25;
const RECONCILIATION_INTERVAL_MS = 5 * 60_000;
const RECONCILIATION_HORIZON_MS = 24 * 60 * 60_000;

type ClaimedSmsDelivery = {
  id: string;
  providerMessageId: string;
};

type ReconciledState = {
  status: SmsDeliveryStatus;
  failureCode?: string;
};

function mapProviderState(state: SmsGatewayMessageState): ReconciledState {
  switch (state) {
    case 'Pending':
    case 'Processed':
    case 'Cancelling':
      return { status: SmsDeliveryStatus.ACCEPTED };
    case 'Sent':
      return { status: SmsDeliveryStatus.SENT };
    case 'Delivered':
      return { status: SmsDeliveryStatus.DELIVERED };
    case 'Cancelled':
      return {
        status: SmsDeliveryStatus.FAILED,
        failureCode: 'SMSGATEWAY_CANCELLED',
      };
    case 'Failed':
      return {
        status: SmsDeliveryStatus.FAILED,
        failureCode: 'SMSGATEWAY_FAILED',
      };
  }
}

function eventIdentity(message: SmsGatewayMessageStatus): {
  eventAtValue: string | null;
  providerEventId: string;
} {
  const providerTimestamp = message.states[message.state];
  const parsed = providerTimestamp ? new Date(providerTimestamp) : null;
  const eventAtValue =
    parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  const digest = createHash('sha256')
    .update(`${message.id}:${message.state}:${eventAtValue ?? 'unknown'}`)
    .digest('hex');
  return { eventAtValue, providerEventId: `poll:${digest}` };
}

/**
 * Repairs SMS Gate status evidence when its device-originated webhook is
 * missed. Webhooks remain the fast path; this worker polls only a bounded,
 * recent set of accepted outbox rows and never participates in sending.
 */
@Injectable()
export class SmsGatewayReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receipts: SmsReceiptService,
  ) {}

  // 25 sequential requests at the 10s provider timeout have a 4m10s upper
  // bound. waitForCompletion prevents a second copy in the same process; the
  // SQL claim below coordinates the separate Cloud Run instances.
  @Cron(CRON_EVERY_MINUTE.SMS_GATEWAY_STATUS_RECONCILIATION, {
    name: 'smsGatewayStatusReconciliation',
    waitForCompletion: true,
  })
  @SentryCron(
    'sms-gateway-status-reconciliation',
    cronMonitor(CRON_EVERY_MINUTE.SMS_GATEWAY_STATUS_RECONCILIATION, {
      maxRuntimeMinutes: 6,
      checkinMarginMinutes: 6,
      failureIssueThreshold: 3,
    }),
  )
  async reconcileAccepted(now = new Date()): Promise<number> {
    // Reconcile persisted SMS Gateway work even after routing is switched to
    // Twilio. Provider choice controls new sends, not ownership of old ones.
    if (!smsGatewayConfigured()) return 0;

    const retryBefore = new Date(now.getTime() - RECONCILIATION_INTERVAL_MS);
    const horizonStart = new Date(now.getTime() - RECONCILIATION_HORIZON_MS);
    const claimed = await this.prisma.$queryRaw<
      ClaimedSmsDelivery[]
    >(Prisma.sql`
      WITH candidate AS (
        SELECT delivery."id"
        FROM "notification_delivery" AS delivery
        WHERE delivery."channel" = 'SMS'
          AND delivery."status" = 'ACCEPTED'
          AND delivery."smsProvider" = 'SMS_GATEWAY'
          AND delivery."smsDeliveryStatus" IN ('ACCEPTED', 'SENT')
          AND delivery."providerMessageId" IS NOT NULL
          AND delivery."acceptedAt" >= ${horizonStart}
          AND (
            delivery."smsLastReconciledAt" IS NULL
            OR delivery."smsLastReconciledAt" <= ${retryBefore}
          )
        ORDER BY
          delivery."smsLastReconciledAt" ASC NULLS FIRST,
          delivery."acceptedAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${MAX_RECONCILIATION_BATCH}
      )
      UPDATE "notification_delivery" AS delivery
      SET "smsLastReconciledAt" = ${now}
      FROM candidate
      WHERE delivery."id" = candidate."id"
      RETURNING delivery."id", delivery."providerMessageId"
    `);

    let applied = 0;
    for (const delivery of claimed) {
      const result = await getSmsGatewayMessageStatus(
        delivery.providerMessageId,
      );
      if (!result.ok) {
        // A newly accepted message can briefly be absent from a read replica.
        // The claim watermark makes it eligible again after five minutes.
        if (result.status === 404) continue;
        throw new Error(result.detail);
      }

      const mapped = mapProviderState(result.message.state);
      const { eventAtValue, providerEventId } = eventIdentity(result.message);
      const accepted = await this.receipts.apply({
        provider: SmsProvider.SMS_GATEWAY,
        providerEventId,
        providerMessageId: delivery.providerMessageId,
        providerStatus: result.message.state,
        status: mapped.status,
        eventAt: eventAtValue ? new Date(eventAtValue) : now,
        receivedAt: now,
        failureCode: mapped.failureCode,
        aggregateSnapshot: true,
      });
      if (accepted) applied += 1;
    }
    return applied;
  }
}
