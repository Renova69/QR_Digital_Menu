/**
 * SIM-based SMS gateway transport (capcom6 "SMS Gate" / android-sms-gateway).
 *
 * Sends SMS through an Android phone's SIM via the gateway's REST API. Works
 * with the hosted cloud server (default URL) or a self-hosted private server —
 * point SMS_GATEWAY_URL at your own instance. This is a cheap alternative to
 * Twilio for the Bulgarian market: local SIM → local numbers avoids the
 * international A2P filtering a US long-code hits.
 *
 * This module is a plain function (no NestJS DI) so both the reservation
 * notifications service and the auth OTP flow can share it without changing
 * their constructors. Never throws for a delivery failure — returns a result
 * the caller logs (keeps guest PII redaction in the caller).
 *
 * Env:
 *   SMS_PROVIDER          'smsgateway' routes SMS here; anything else = Twilio.
 *   SMS_GATEWAY_URL       Send endpoint. Default: hosted cloud API.
 *   SMS_GATEWAY_USERNAME  Basic-auth user (shown in the Android app / server).
 *   SMS_GATEWAY_PASSWORD  Basic-auth password.
 *
 * Twilio env vars are intentionally left in place (unused while
 * SMS_PROVIDER=smsgateway) so you can flip back without reconfiguring.
 */
import { fetchWithDependencyPool } from '../http/dependency-http';

const DEFAULT_SMS_GATEWAY_URL = 'https://api.sms-gate.app/3rdparty/v1/messages';
const DEFAULT_SMS_TTL_SECONDS = 60 * 60;
const DEFAULT_SMS_TIMEOUT_MS = 10_000;

export type SmsProvider = 'twilio' | 'smsgateway';

/** Active SMS provider. Defaults to Twilio to preserve legacy behaviour. */
export function smsProvider(): SmsProvider {
  return process.env.SMS_PROVIDER === 'smsgateway' ? 'smsgateway' : 'twilio';
}

/** True when the gateway has the credentials it needs to send. */
export function smsGatewayConfigured(): boolean {
  return !!(
    process.env.SMS_GATEWAY_USERNAME && process.env.SMS_GATEWAY_PASSWORD
  );
}

export interface SmsSendResult {
  ok: boolean;
  status: number;
  detail: string;
  messageId?: string;
}

export interface SmsSendOptions {
  /** Server-side queue expiry. OTP callers should use their shorter lifetime. */
  ttlSeconds?: number;
  /** Bounds both Cloud Run request latency and a stalled gateway connection. */
  timeoutMs?: number;
  /** Stable provider identity used to make outbox retries reconcilable. */
  messageId?: string;
  /** Ask the Android gateway to emit delivered/failed receipt webhooks. */
  withDeliveryReport?: boolean;
}

const SMS_GATEWAY_MESSAGE_STATES = [
  'Pending',
  'Cancelling',
  'Cancelled',
  'Processed',
  'Sent',
  'Delivered',
  'Failed',
] as const;

export type SmsGatewayMessageState =
  (typeof SMS_GATEWAY_MESSAGE_STATES)[number];

export type SmsGatewayMessageStatus = {
  id: string;
  state: SmsGatewayMessageState;
  states: Partial<Record<SmsGatewayMessageState, string>>;
};

export type SmsGatewayStatusResult =
  | {
      ok: true;
      status: number;
      detail: '';
      message: SmsGatewayMessageStatus;
    }
  | {
      ok: false;
      status: number;
      detail: string;
    };

function blockedResult(detail: string): SmsSendResult {
  return { ok: false, status: 0, detail };
}

function statusFailure(status: number, detail: string): SmsGatewayStatusResult {
  return { ok: false, status, detail };
}

function fetchIsMocked(): boolean {
  return Boolean(
    (globalThis.fetch as typeof fetch & { _isMockFunction?: boolean })
      ?._isMockFunction,
  );
}

/**
 * POST a single SMS to the gateway. Returns a structured result — never throws
 * on an HTTP error so a failed send can't roll back a booking or lock a login.
 */
export async function sendViaSmsGateway(
  to: string,
  body: string,
  options: SmsSendOptions = {},
): Promise<SmsSendResult> {
  if (process.env.NODE_ENV === 'test' && !fetchIsMocked()) {
    return blockedResult('Live SMS network access blocked under NODE_ENV=test');
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV !== 'test' &&
    process.env.SMS_FORCE_SEND !== 'true'
  ) {
    return blockedResult(
      'Live SMS send blocked outside production; set SMS_FORCE_SEND=true explicitly',
    );
  }

  const url = process.env.SMS_GATEWAY_URL || DEFAULT_SMS_GATEWAY_URL;
  const username = process.env.SMS_GATEWAY_USERNAME || '';
  const password = process.env.SMS_GATEWAY_PASSWORD || '';
  const auth = Buffer.from(`${username}:${password}`).toString('base64');
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_SMS_TTL_SECONDS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_SMS_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchWithDependencyPool('sms-gateway', url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(options.messageId ? { id: options.messageId } : {}),
        textMessage: { text: body },
        phoneNumbers: [to],
        ttl: ttlSeconds,
        withDeliveryReport: options.withDeliveryReport ?? false,
      }),
      signal: controller.signal,
    });

    const detail = res.ok ? '' : await res.text().catch(() => '');
    const responseBody =
      res.ok && typeof res.json === 'function'
        ? ((await res.json().catch(() => null)) as { id?: string } | null)
        : null;
    return {
      ok: res.ok,
      status: res.status,
      detail,
      ...(responseBody?.id ? { messageId: responseBody.id } : {}),
    };
  } catch (error) {
    const detail = controller.signal.aborted
      ? `SMS gateway request timed out after ${timeoutMs}ms`
      : error instanceof Error
        ? error.message
        : 'Unknown SMS gateway network error';
    return blockedResult(detail);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read one cloud message's provider-owned state. The response is deliberately
 * reduced to opaque identity and lifecycle timestamps: SMS Gate also returns
 * recipients, message text, and failure reasons, none of which belong in the
 * reconciliation or error-reporting path.
 */
export async function getSmsGatewayMessageStatus(
  messageId: string,
  timeoutMs = DEFAULT_SMS_TIMEOUT_MS,
): Promise<SmsGatewayStatusResult> {
  if (process.env.NODE_ENV === 'test' && !fetchIsMocked()) {
    return statusFailure(
      0,
      'Live SMS network access blocked under NODE_ENV=test',
    );
  }
  if (!smsGatewayConfigured()) {
    return statusFailure(0, 'SMS gateway credentials are not configured');
  }

  const baseUrl = process.env.SMS_GATEWAY_URL || DEFAULT_SMS_GATEWAY_URL;
  const url = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(messageId)}`;
  const auth = Buffer.from(
    `${process.env.SMS_GATEWAY_USERNAME}:${process.env.SMS_GATEWAY_PASSWORD}`,
  ).toString('base64');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchWithDependencyPool('sms-gateway', url, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      // Provider response bodies can contain recipients and failure details.
      // Keep the observable error useful without copying that data to Sentry.
      return statusFailure(
        res.status,
        `SMS gateway status request failed with HTTP ${res.status}`,
      );
    }

    const raw = (await res.json().catch(() => null)) as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return statusFailure(
        502,
        'SMS gateway returned an invalid status response',
      );
    }
    const body = raw as Record<string, unknown>;
    const state = body.state;
    if (
      body.id !== messageId ||
      typeof state !== 'string' ||
      !SMS_GATEWAY_MESSAGE_STATES.includes(state as SmsGatewayMessageState)
    ) {
      return statusFailure(
        502,
        'SMS gateway returned an invalid status response',
      );
    }

    const sourceStates =
      body.states &&
      typeof body.states === 'object' &&
      !Array.isArray(body.states)
        ? (body.states as Record<string, unknown>)
        : {};
    const states: Partial<Record<SmsGatewayMessageState, string>> = {};
    for (const allowedState of SMS_GATEWAY_MESSAGE_STATES) {
      const value = sourceStates[allowedState];
      if (typeof value === 'string') states[allowedState] = value;
    }

    return {
      ok: true,
      status: res.status,
      detail: '',
      message: {
        id: messageId,
        state: state as SmsGatewayMessageState,
        states,
      },
    };
  } catch (error) {
    return statusFailure(
      0,
      controller.signal.aborted
        ? `SMS gateway status request timed out after ${timeoutMs}ms`
        : error instanceof Error
          ? `SMS gateway status request failed: ${error.message}`
          : 'SMS gateway status request failed with an unknown network error',
    );
  } finally {
    clearTimeout(timeout);
  }
}
