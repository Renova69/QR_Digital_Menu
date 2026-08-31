import { createHmac, timingSafeEqual } from 'node:crypto';

export const TWILIO_SMS_STATUS_PATH = '/api/v1/notifications/sms/twilio/status';
export const SMS_GATEWAY_STATUS_PATH =
  '/api/v1/notifications/sms/smsgateway/status';

export function buildPublicCallbackUrl(path: string): string | null {
  const configured = process.env.BACKEND_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    url.pathname = path;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function equalText(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

/** Twilio's documented HMAC-SHA1 URL + sorted form-parameter signature. */
export function verifyTwilioSignature(params: {
  signature: string | undefined;
  url: string | null;
  form: Record<string, string>;
  authToken: string | undefined;
}): boolean {
  if (!params.signature || !params.url || !params.authToken) return false;
  const signed = Object.keys(params.form)
    .sort()
    .reduce((value, key) => value + key + params.form[key], params.url);
  const expected = createHmac('sha1', params.authToken)
    .update(signed)
    .digest('base64');
  return equalText(expected, params.signature.trim());
}

/** SMS Gateway signs raw JSON followed by its Unix timestamp. */
export function verifySmsGatewaySignature(params: {
  signature: string | undefined;
  timestamp: string | undefined;
  rawBody: Buffer;
  signingKey: string | undefined;
  now?: Date;
}): boolean {
  if (
    !params.signature ||
    !params.timestamp ||
    !params.signingKey ||
    !/^\d+$/.test(params.timestamp)
  ) {
    return false;
  }
  const nowSeconds = Math.floor((params.now ?? new Date()).getTime() / 1000);
  const timestampSeconds = Number(params.timestamp);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > 5 * 60
  ) {
    return false;
  }
  const expected = createHmac('sha256', params.signingKey)
    .update(params.rawBody)
    .update(params.timestamp)
    .digest('hex');
  return equalText(expected, params.signature.trim().toLowerCase());
}
