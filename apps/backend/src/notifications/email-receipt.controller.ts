import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { EmailDeliveryStatus } from '@prisma/client';
import type { Request as ExpressRequest } from 'express';
import { EmailReceiptService } from './email-receipt.service';
import { verifyResendSignature } from './resend-receipt-security';

type ResendWebhook = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: unknown;
    tags?: Record<string, unknown>;
  };
};

const RESEND_EVENT: Record<
  string,
  { status: EmailDeliveryStatus; failureCode?: string }
> = {
  'email.sent': { status: EmailDeliveryStatus.SENT },
  'email.delivered': { status: EmailDeliveryStatus.DELIVERED },
  'email.delivery_delayed': { status: EmailDeliveryStatus.DELAYED },
  'email.failed': {
    status: EmailDeliveryStatus.FAILED,
    failureCode: 'RESEND_FAILED',
  },
  'email.bounced': {
    status: EmailDeliveryStatus.BOUNCED,
    failureCode: 'RESEND_BOUNCED',
  },
  'email.complained': {
    status: EmailDeliveryStatus.COMPLAINED,
    failureCode: 'RESEND_COMPLAINED',
  },
  'email.suppressed': {
    status: EmailDeliveryStatus.FAILED,
    failureCode: 'RESEND_SUPPRESSED',
  },
};

function validDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function opaqueId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value)
    ? value
    : undefined;
}

@Controller('notifications/email')
export class EmailReceiptController {
  constructor(private readonly receipts: EmailReceiptService) {}

  @Post('resend/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resend(
    @Request() request: ExpressRequest,
    @Headers('svix-id') messageId?: string,
    @Headers('svix-timestamp') timestamp?: string,
    @Headers('svix-signature') signature?: string,
  ): Promise<void> {
    if (!Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Expected a raw Resend payload');
    }
    if (
      !verifyResendSignature({
        messageId,
        timestamp,
        signature,
        rawBody: request.body,
        secret: process.env.RESEND_WEBHOOK_SECRET,
      })
    ) {
      throw new UnauthorizedException('Invalid Resend signature');
    }

    let webhook: ResendWebhook;
    try {
      webhook = JSON.parse(request.body.toString('utf8')) as ResendWebhook;
    } catch {
      throw new BadRequestException('Invalid Resend JSON');
    }
    if (!webhook.type || !messageId) {
      throw new BadRequestException('Missing Resend receipt fields');
    }
    const mapped = RESEND_EVENT[webhook.type];
    if (!mapped) return;
    const providerMessageId = opaqueId(webhook.data?.email_id);
    if (!providerMessageId) {
      throw new BadRequestException('Missing Resend email id');
    }
    const deliveryId = opaqueId(webhook.data?.tags?.delivery_id);

    const receivedAt = new Date();
    await this.receipts.apply({
      providerEventId: messageId,
      providerMessageId,
      providerStatus: webhook.type,
      status: mapped.status,
      eventAt: validDate(webhook.created_at, receivedAt),
      receivedAt,
      ...(deliveryId ? { deliveryId } : {}),
      ...(mapped.failureCode ? { failureCode: mapped.failureCode } : {}),
    });
  }
}
