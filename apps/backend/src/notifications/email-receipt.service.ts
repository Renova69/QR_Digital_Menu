import { Injectable, Logger } from '@nestjs/common';
import {
  EmailDeliveryStatus,
  NotificationChannel,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type EmailReceipt = {
  providerEventId: string;
  providerMessageId: string;
  deliveryId?: string;
  providerStatus: string;
  status: EmailDeliveryStatus;
  eventAt: Date;
  receivedAt: Date;
  failureCode?: string;
};

function allowedPreviousStatus(
  status: EmailDeliveryStatus,
): Prisma.NotificationDeliveryWhereInput {
  if (status === EmailDeliveryStatus.SENT) {
    return {
      OR: [
        { emailDeliveryStatus: null },
        {
          emailDeliveryStatus: {
            in: [EmailDeliveryStatus.ACCEPTED, EmailDeliveryStatus.SENT],
          },
        },
      ],
    };
  }
  if (status === EmailDeliveryStatus.DELAYED) {
    return {
      OR: [
        { emailDeliveryStatus: null },
        {
          emailDeliveryStatus: {
            in: [
              EmailDeliveryStatus.ACCEPTED,
              EmailDeliveryStatus.SENT,
              EmailDeliveryStatus.DELAYED,
            ],
          },
        },
      ],
    };
  }
  if (status === EmailDeliveryStatus.DELIVERED) {
    return {
      OR: [
        { emailDeliveryStatus: null },
        {
          emailDeliveryStatus: {
            notIn: [
              EmailDeliveryStatus.BOUNCED,
              EmailDeliveryStatus.COMPLAINED,
              EmailDeliveryStatus.FAILED,
            ],
          },
        },
      ],
    };
  }
  return {};
}

@Injectable()
export class EmailReceiptService {
  private readonly logger = new Logger(EmailReceiptService.name);

  constructor(private readonly prisma: PrismaService) {}

  async apply(receipt: EmailReceipt): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.notificationDelivery.findFirst({
        where: {
          channel: NotificationChannel.EMAIL,
          ...(receipt.deliveryId
            ? { id: receipt.deliveryId }
            : { providerMessageId: receipt.providerMessageId }),
        },
        select: { id: true, providerMessageId: true },
      });
      if (!delivery) {
        // Auth emails currently bypass the reservation outbox. A global Resend
        // webhook can legitimately report them, but there is no delivery row
        // to update and no reason to persist their recipient or subject.
        this.logger.debug(
          `Ignored unmatched Resend receipt (${receipt.providerMessageId})`,
        );
        return false;
      }
      if (
        delivery.providerMessageId &&
        delivery.providerMessageId !== receipt.providerMessageId
      ) {
        this.logger.warn(
          `Ignored mismatched Resend receipt (${receipt.providerMessageId})`,
        );
        return false;
      }

      if (!delivery.providerMessageId) {
        await tx.notificationDelivery.updateMany({
          where: { id: delivery.id, providerMessageId: null },
          data: { providerMessageId: receipt.providerMessageId },
        });
      }

      const inserted = await tx.emailProviderReceipt.createMany({
        data: {
          deliveryId: delivery.id,
          providerEventId: receipt.providerEventId,
          providerStatus: receipt.providerStatus.slice(0, 80),
          eventAt: receipt.eventAt,
          receivedAt: receipt.receivedAt,
        },
        skipDuplicates: true,
      });
      if (inserted.count === 0) return false;

      const data: Prisma.NotificationDeliveryUpdateManyMutationInput = {
        emailDeliveryStatus: receipt.status,
        emailProviderStatus: receipt.providerStatus.slice(0, 80),
        emailLastReceiptAt: receipt.receivedAt,
        emailLastEventAt: receipt.eventAt,
        ...(receipt.status === EmailDeliveryStatus.SENT
          ? { emailSentAt: receipt.eventAt }
          : {}),
        ...(receipt.status === EmailDeliveryStatus.DELIVERED
          ? { emailDeliveredAt: receipt.eventAt }
          : {}),
        ...(receipt.status === EmailDeliveryStatus.BOUNCED ||
        receipt.status === EmailDeliveryStatus.FAILED
          ? { emailFailedAt: receipt.eventAt }
          : {}),
        ...(receipt.status === EmailDeliveryStatus.COMPLAINED
          ? { emailComplainedAt: receipt.eventAt }
          : {}),
        ...(receipt.failureCode
          ? { emailFailureCode: receipt.failureCode.slice(0, 120) }
          : {}),
      };
      const updated = await tx.notificationDelivery.updateMany({
        where: {
          id: delivery.id,
          AND: [
            {
              OR: [
                { emailLastEventAt: null },
                { emailLastEventAt: { lte: receipt.eventAt } },
              ],
            },
            allowedPreviousStatus(receipt.status),
          ],
        },
        data,
      });
      return updated.count === 1;
    });
  }
}
