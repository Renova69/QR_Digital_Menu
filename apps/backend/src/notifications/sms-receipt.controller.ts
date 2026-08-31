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
import { SmsDeliveryStatus, SmsProvider } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { Request as ExpressRequest } from 'express';
import {
  buildPublicCallbackUrl,
  SMS_GATEWAY_STATUS_PATH,
  TWILIO_SMS_STATUS_PATH,
  verifySmsGatewaySignature,
  verifyTwilioSignature,
} from './sms-receipt-security';
import { SmsReceiptService } from './sms-receipt.service';

type SmsGatewayWebhook = {
  id?: string;
  event?: string;
  payload?: {
    messageId?: string;
    partsCount?: number;
    sentAt?: string;
    deliveredAt?: string;
    failedAt?: string;
    cancelledAt?: string;
  };
};

function opaqueEventId(...parts: Array<string | undefined>): string {
  return createHash('sha256')
    .update(parts.map((part) => part ?? '').join('\u0000'))
    .digest('hex');
}

const TWILIO_STATUS: Record<string, SmsDeliveryStatus> = {
  accepted: SmsDeliveryStatus.ACCEPTED,
  queued: SmsDeliveryStatus.ACCEPTED,
  scheduled: SmsDeliveryStatus.ACCEPTED,
  sending: SmsDeliveryStatus.SENT,
  sent: SmsDeliveryStatus.SENT,
  delivered: SmsDeliveryStatus.DELIVERED,
  undelivered: SmsDeliveryStatus.FAILED,
  failed: SmsDeliveryStatus.FAILED,
  canceled: SmsDeliveryStatus.FAILED,
};

const SMS_GATEWAY_EVENT: Record<string, SmsDeliveryStatus> = {
  'sms:sent': SmsDeliveryStatus.SENT,
  'sms:delivered': SmsDeliveryStatus.DELIVERED,
  'sms:failed': SmsDeliveryStatus.FAILED,
  'sms:cancelled': SmsDeliveryStatus.FAILED,
};

function stringForm(body: unknown): Record<string, string> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  return Object.fromEntries(
    Object.entries(body).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

function validDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

@Controller('notifications/sms')
export class SmsReceiptController {
  constructor(private readonly receipts: SmsReceiptService) {}

  @Post('twilio/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async twilio(
    @Request() request: ExpressRequest,
    @Headers('x-twilio-signature') signature?: string,
  ): Promise<void> {
    const form = stringForm(request.body);
    if (
      !verifyTwilioSignature({
        signature,
        url: buildPublicCallbackUrl(TWILIO_SMS_STATUS_PATH),
        form,
        authToken: process.env.TWILIO_AUTH_TOKEN,
      })
    ) {
      throw new UnauthorizedException('Invalid Twilio signature');
    }
    const messageId = form.MessageSid;
    const providerStatus = form.MessageStatus?.toLowerCase();
    if (!messageId || !providerStatus) {
      throw new BadRequestException('Missing Twilio receipt fields');
    }
    const status = TWILIO_STATUS[providerStatus];
    if (!status) return;
    const segmentCount = Number(form.NumSegments);
    const now = new Date();
    await this.receipts.apply({
      provider: SmsProvider.TWILIO,
      providerEventId: opaqueEventId(
        messageId,
        providerStatus,
        form.ErrorCode,
        form.NumSegments,
      ),
      providerMessageId: messageId,
      providerStatus,
      status,
      eventAt: now,
      receivedAt: now,
      ...(Number.isSafeInteger(segmentCount) && segmentCount > 0
        ? { segmentCount }
        : {}),
      ...(form.ErrorCode ? { failureCode: form.ErrorCode } : {}),
    });
  }

  @Post('smsgateway/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async smsGateway(
    @Request() request: ExpressRequest,
    @Headers('x-signature') signature?: string,
    @Headers('x-timestamp') timestamp?: string,
  ): Promise<void> {
    if (!Buffer.isBuffer(request.body)) {
      throw new BadRequestException('Expected a raw SMS Gateway payload');
    }
    if (
      !verifySmsGatewaySignature({
        signature,
        timestamp,
        rawBody: request.body,
        signingKey: process.env.SMS_GATEWAY_WEBHOOK_SIGNING_KEY,
      })
    ) {
      throw new UnauthorizedException('Invalid SMS Gateway signature');
    }
    let webhook: SmsGatewayWebhook;
    try {
      webhook = JSON.parse(request.body.toString('utf8')) as SmsGatewayWebhook;
    } catch {
      throw new BadRequestException('Invalid SMS Gateway JSON');
    }
    const providerStatus = webhook.event;
    const status = providerStatus ? SMS_GATEWAY_EVENT[providerStatus] : null;
    const messageId = webhook.payload?.messageId;
    if (!webhook.id || !providerStatus || !messageId) {
      throw new BadRequestException('Missing SMS Gateway receipt fields');
    }
    if (!status) return;
    const receivedAt = new Date();
    const eventTimestamp =
      webhook.payload?.sentAt ??
      webhook.payload?.deliveredAt ??
      webhook.payload?.failedAt ??
      webhook.payload?.cancelledAt;
    await this.receipts.apply({
      provider: SmsProvider.SMS_GATEWAY,
      providerEventId: webhook.id,
      providerMessageId: messageId,
      providerStatus,
      status,
      eventAt: validDate(eventTimestamp, receivedAt),
      receivedAt,
      ...(Number.isSafeInteger(webhook.payload?.partsCount) &&
      Number(webhook.payload?.partsCount) > 0
        ? { segmentCount: Number(webhook.payload?.partsCount) }
        : {}),
      ...(status === SmsDeliveryStatus.FAILED
        ? {
            failureCode:
              providerStatus === 'sms:cancelled'
                ? 'SMSGATEWAY_CANCELLED'
                : 'SMSGATEWAY_FAILED',
          }
        : {}),
    });
  }
}
