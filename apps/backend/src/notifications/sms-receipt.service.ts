import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  Prisma,
  SmsDeliveryStatus,
  SmsProvider,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SmsReceipt = {
  provider: SmsProvider;
  providerEventId: string;
  providerMessageId: string;
  providerStatus: string;
  status: SmsDeliveryStatus;
  eventAt: Date;
  receivedAt: Date;
  segmentCount?: number;
  failureCode?: string;
};

@Injectable()
export class SmsReceiptService {
  private readonly logger = new Logger(SmsReceiptService.name);

  constructor(private readonly prisma: PrismaService) {}

  async apply(receipt: SmsReceipt): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.notificationDelivery.findFirst({
        where: {
          channel: NotificationChannel.SMS,
          providerMessageId: receipt.providerMessageId,
          smsProvider: receipt.provider,
        },
        select: { id: true },
      });
      if (!delivery) {
        // Direct OTP sends intentionally bypass the reservation outbox but a
        // globally registered SMS Gateway `sms:sent` webhook may still report
        // them. Keep that expected case diagnostic without warning noise.
        this.logger.debug(
          `Ignored unmatched ${receipt.provider} SMS receipt (${receipt.providerMessageId})`,
        );
        return false;
      }

      const inserted = await tx.smsProviderReceipt.createMany({
        data: {
          deliveryId: delivery.id,
          provider: receipt.provider,
          providerEventId: receipt.providerEventId,
          providerStatus: receipt.providerStatus.slice(0, 80),
          eventAt: receipt.eventAt,
          receivedAt: receipt.receivedAt,
        },
        skipDuplicates: true,
      });
      if (inserted.count === 0) return false;

      if (
        receipt.provider === SmsProvider.SMS_GATEWAY &&
        receipt.status === SmsDeliveryStatus.SENT &&
        receipt.segmentCount &&
        receipt.segmentCount > 0
      ) {
        // A retried `sent` webhook can arrive after a part-level delivered
        // event. Reconcile the provider's authoritative part count without
        // clearing FAILED; an early DELIVERED estimate is corrected to SENT
        // until the remaining distinct part receipts arrive.
        const aggregate = await tx.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            smsSegmentCount: receipt.segmentCount,
            smsSentAt: receipt.eventAt,
            smsLastReceiptAt: receipt.receivedAt,
          },
          select: {
            smsDeliveredPartCount: true,
            smsDeliveryStatus: true,
          },
        });
        if (aggregate.smsDeliveryStatus === SmsDeliveryStatus.FAILED) {
          return true;
        }
        const alreadyComplete =
          aggregate.smsDeliveredPartCount >= receipt.segmentCount;
        if (
          alreadyComplete &&
          aggregate.smsDeliveryStatus === SmsDeliveryStatus.DELIVERED
        ) {
          return true;
        }
        await tx.notificationDelivery.update({
          where: { id: delivery.id },
          data: alreadyComplete
            ? { smsDeliveryStatus: SmsDeliveryStatus.DELIVERED }
            : {
                smsDeliveryStatus: SmsDeliveryStatus.SENT,
                smsProviderStatus: receipt.providerStatus.slice(0, 80),
                smsDeliveredAt: null,
              },
        });
        return true;
      }

      if (
        receipt.provider === SmsProvider.SMS_GATEWAY &&
        receipt.status === SmsDeliveryStatus.DELIVERED
      ) {
        // SMS Gateway emits one delivered webhook per part. The event table
        // above deduplicates retries; this atomic increment then marks the
        // aggregate delivered only when every expected part has arrived.
        const aggregate = await tx.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            smsDeliveredPartCount: { increment: 1 },
            smsLastReceiptAt: receipt.receivedAt,
          },
          select: {
            smsDeliveredPartCount: true,
            smsDeliveryStatus: true,
            smsSegmentCount: true,
          },
        });
        if (aggregate.smsDeliveryStatus === SmsDeliveryStatus.FAILED) {
          return true;
        }
        const expectedParts = Math.max(1, aggregate.smsSegmentCount ?? 1);
        const fullyDelivered = aggregate.smsDeliveredPartCount >= expectedParts;
        await tx.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            smsProviderStatus: receipt.providerStatus.slice(0, 80),
            ...(fullyDelivered
              ? {
                  smsDeliveryStatus: SmsDeliveryStatus.DELIVERED,
                  smsDeliveredAt: receipt.eventAt,
                }
              : {}),
          },
        });
        return true;
      }

      const data: Prisma.NotificationDeliveryUpdateManyMutationInput = {
        smsDeliveryStatus: receipt.status,
        smsProviderStatus: receipt.providerStatus.slice(0, 80),
        smsLastReceiptAt: receipt.receivedAt,
        ...(receipt.segmentCount && receipt.segmentCount > 0
          ? { smsSegmentCount: receipt.segmentCount }
          : {}),
        ...(receipt.status === SmsDeliveryStatus.SENT
          ? { smsSentAt: receipt.eventAt }
          : {}),
        ...(receipt.status === SmsDeliveryStatus.DELIVERED
          ? { smsDeliveredAt: receipt.eventAt }
          : {}),
        ...(receipt.status === SmsDeliveryStatus.FAILED
          ? {
              smsFailedAt: receipt.eventAt,
              smsFailureCode: receipt.failureCode?.slice(0, 120) ?? null,
            }
          : {}),
      };
      const updated = await tx.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          // A late sent callback must not regress a terminal delivery.
          ...(receipt.status === SmsDeliveryStatus.SENT
            ? {
                OR: [
                  { smsDeliveryStatus: null },
                  {
                    smsDeliveryStatus: {
                      in: [SmsDeliveryStatus.ACCEPTED, SmsDeliveryStatus.SENT],
                    },
                  },
                ],
              }
            : {}),
        },
        data,
      });
      return updated.count === 1;
    });
  }
}
