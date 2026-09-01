import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  type NotificationDelivery,
  SmsProvider,
} from '@prisma/client';
import {
  sendViaSmsGateway,
  smsGatewayConfigured,
  smsProvider,
} from '../common/sms/sms-gateway';
import { fetchWithDependencyPool } from '../common/http/dependency-http';
import {
  buildPublicCallbackUrl,
  TWILIO_SMS_STATUS_PATH,
} from './sms-receipt-security';
import { estimateSmsSegments } from './sms-segments';

export const NOTIFICATION_PROVIDER = Symbol('NOTIFICATION_PROVIDER');

// Bounds Resend/Twilio requests. The 60s delivery lease (see
// NotificationDeliveryService) already means a hung request loses its lease
// to another worker, but without this the original socket/fetch never
// closes and the outcome is never resolved either way — mirrors the SIM SMS
// gateway's own timeout in ../common/sms/sms-gateway.ts.
const PROVIDER_HTTP_TIMEOUT_MS = 10_000;

export type DeliveryPayload = {
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  body?: string;
  attachments?: Array<{
    filename: string;
    /** Base64-encoded content, persisted with the outbox payload. */
    content: string;
  }>;
  ledgerBatchIds?: string[];
};

export type ProviderDeliveryResult =
  | {
      accepted: true;
      providerMessageId: string | null;
      sms?: SmsProviderAcceptance;
    }
  | {
      accepted: false;
      retryable: boolean;
      outcomeUncertain: boolean;
      error: string;
    };

export type SmsProviderAcceptance = {
  provider: SmsProvider;
  segmentCount: number;
  providerCostMicros: number | null;
  currency: string | null;
};

export interface NotificationProvider {
  send(delivery: NotificationDelivery): Promise<ProviderDeliveryResult>;
}

function providerCurrency(value: string | null | undefined): string | null {
  const currency = value?.trim().toUpperCase();
  return currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

@Injectable()
export class ProductionNotificationProvider implements NotificationProvider {
  async send(delivery: NotificationDelivery): Promise<ProviderDeliveryResult> {
    const payload = delivery.payload as DeliveryPayload;
    const forceLocalSms =
      delivery.channel === NotificationChannel.SMS &&
      process.env.SMS_FORCE_SEND === 'true';
    if (process.env.NODE_ENV !== 'production' && !forceLocalSms) {
      return {
        accepted: false,
        retryable: false,
        outcomeUncertain: false,
        error: `${delivery.channel} delivery is suppressed outside production`,
      };
    }
    return delivery.channel === NotificationChannel.EMAIL
      ? this.sendEmail(delivery.id, payload)
      : this.sendSms(delivery.id, payload);
  }

  private async sendEmail(
    deliveryId: string,
    payload: DeliveryPayload,
  ): Promise<ProviderDeliveryResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return {
        accepted: false,
        retryable: false,
        outcomeUncertain: false,
        error: 'Resend credentials are not configured',
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PROVIDER_HTTP_TIMEOUT_MS,
    );
    try {
      const response = await fetchWithDependencyPool(
        'resend',
        'https://api.resend.com/emails',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': deliveryId,
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL || 'noreply@yourdomain.com',
            to: [payload.to],
            subject: payload.subject,
            text: payload.text,
            html: payload.html,
            attachments: payload.attachments,
            // Resend can deliver a webhook before this request returns and
            // providerMessageId is persisted. The durable outbox id lets the
            // signed receipt find its row during that window.
            tags: [{ name: 'delivery_id', value: deliveryId }],
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        return {
          accepted: false,
          retryable: isRetryableStatus(response.status),
          outcomeUncertain: false,
          error: `Resend rejected the request with HTTP ${response.status}`,
        };
      }
      const responseBody = (await response.json().catch(() => null)) as {
        id?: string;
      } | null;
      if (!responseBody?.id) {
        // The request may already have been accepted. Retrying is safe because
        // Resend receives the durable delivery id as its idempotency key.
        return {
          accepted: false,
          retryable: true,
          outcomeUncertain: true,
          error: 'Resend response did not include a message id',
        };
      }
      return {
        accepted: true,
        providerMessageId: responseBody.id,
      };
    } catch {
      return {
        accepted: false,
        retryable: true,
        outcomeUncertain: true,
        error: 'Resend request outcome is unknown after a network interruption',
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async sendSms(
    deliveryId: string,
    payload: DeliveryPayload,
  ): Promise<ProviderDeliveryResult> {
    const body = payload.body ?? payload.text;
    if (!body) {
      return {
        accepted: false,
        retryable: false,
        outcomeUncertain: false,
        error: 'SMS payload is empty',
      };
    }
    const estimatedSegments = estimateSmsSegments(body).segments;

    if (smsProvider() === 'smsgateway') {
      if (!smsGatewayConfigured()) {
        return {
          accepted: false,
          retryable: false,
          outcomeUncertain: false,
          error: 'SMS gateway credentials are not configured',
        };
      }
      try {
        const result = await sendViaSmsGateway(payload.to, body, {
          ttlSeconds: 60 * 60,
          messageId: deliveryId,
          withDeliveryReport: true,
        });
        return result.ok
          ? {
              accepted: true,
              providerMessageId: result.messageId ?? deliveryId,
              sms: {
                provider: SmsProvider.SMS_GATEWAY,
                segmentCount: estimatedSegments,
                providerCostMicros: null,
                currency: null,
              },
            }
          : {
              accepted: false,
              retryable: isRetryableStatus(result.status),
              outcomeUncertain: false,
              error: `SMS gateway rejected the request with HTTP ${result.status}`,
            };
      } catch {
        return {
          accepted: false,
          retryable: false,
          outcomeUncertain: true,
          error: 'SMS gateway request outcome is unknown after interruption',
        };
      }
    }

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;
    const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
    if (!sid || !token || (!from && !messagingServiceSid)) {
      return {
        accepted: false,
        retryable: false,
        outcomeUncertain: false,
        error: 'Twilio credentials are not configured',
      };
    }

    const form = new URLSearchParams({ To: payload.to, Body: body });
    const statusCallback = buildPublicCallbackUrl(TWILIO_SMS_STATUS_PATH);
    if (statusCallback) form.set('StatusCallback', statusCallback);
    if (messagingServiceSid)
      form.set('MessagingServiceSid', messagingServiceSid);
    else form.set('From', from!);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      PROVIDER_HTTP_TIMEOUT_MS,
    );
    try {
      const response = await fetchWithDependencyPool(
        'twilio',
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        return {
          accepted: false,
          retryable: isRetryableStatus(response.status),
          outcomeUncertain: false,
          error: `Twilio rejected the request with HTTP ${response.status}`,
        };
      }
      const responseBody = (await response.json().catch(() => null)) as {
        sid?: string;
        num_segments?: string;
        price?: string | null;
        price_unit?: string | null;
      } | null;
      const providerSegments = Number(responseBody?.num_segments);
      const segmentCount =
        Number.isSafeInteger(providerSegments) && providerSegments > 0
          ? providerSegments
          : estimatedSegments;
      const providerPrice =
        responseBody?.price === null || responseBody?.price === undefined
          ? null
          : Number(responseBody.price);
      const providerCostMicros =
        providerPrice !== null &&
        Number.isFinite(providerPrice) &&
        Math.abs(providerPrice) * 1_000_000 <= 2_147_483_647
          ? Math.round(Math.abs(providerPrice) * 1_000_000)
          : null;
      return {
        accepted: true,
        providerMessageId: responseBody?.sid ?? null,
        sms: {
          provider: SmsProvider.TWILIO,
          segmentCount,
          providerCostMicros,
          currency: providerCurrency(responseBody?.price_unit),
        },
      };
    } catch {
      return {
        accepted: false,
        retryable: false,
        outcomeUncertain: true,
        error: 'Twilio request outcome is unknown after interruption',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
