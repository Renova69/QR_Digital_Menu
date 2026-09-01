import { createHmac, timingSafeEqual } from 'node:crypto';

export const RESEND_EMAIL_STATUS_PATH =
  '/api/v1/notifications/email/resend/status';

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
const SECRET_PREFIX = 'whsec_';

function equalBytes(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Verify Resend's Svix HMAC-SHA256 signature over the untouched request body. */
export function verifyResendSignature(params: {
  messageId: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: Buffer;
  secret: string | undefined;
  now?: Date;
}): boolean {
  if (
    !params.messageId ||
    !params.timestamp ||
    !params.signature ||
    !params.secret?.startsWith(SECRET_PREFIX) ||
    !/^\d+$/.test(params.timestamp)
  ) {
    return false;
  }

  const timestampSeconds = Number(params.timestamp);
  const nowSeconds = Math.floor((params.now ?? new Date()).getTime() / 1000);
  if (
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(nowSeconds - timestampSeconds) > WEBHOOK_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const key = Buffer.from(params.secret.slice(SECRET_PREFIX.length), 'base64');
  if (key.length === 0) return false;
  const expected = createHmac('sha256', key)
    .update(`${params.messageId}.${params.timestamp}.`)
    .update(params.rawBody)
    .digest();

  return params.signature.split(/\s+/).some((versionedSignature) => {
    const comma = versionedSignature.indexOf(',');
    if (comma < 0 || versionedSignature.slice(0, comma) !== 'v1') return false;
    const candidate = Buffer.from(
      versionedSignature.slice(comma + 1),
      'base64',
    );
    return equalBytes(expected, candidate);
  });
}
