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
const DEFAULT_SMS_GATEWAY_URL = 'https://api.sms-gate.app/3rdparty/v1/message';

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
}

/**
 * POST a single SMS to the gateway. Returns a structured result — never throws
 * on an HTTP error so a failed send can't roll back a booking or lock a login.
 */
export async function sendViaSmsGateway(
  to: string,
  body: string,
): Promise<SmsSendResult> {
  const url = process.env.SMS_GATEWAY_URL || DEFAULT_SMS_GATEWAY_URL;
  const username = process.env.SMS_GATEWAY_USERNAME || '';
  const password = process.env.SMS_GATEWAY_PASSWORD || '';
  const auth = Buffer.from(`${username}:${password}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      textMessage: { text: body },
      phoneNumbers: [to],
    }),
  });

  const detail = res.ok ? '' : await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, detail };
}
