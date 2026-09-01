import { createHmac } from 'node:crypto';
import { verifyResendSignature } from './resend-receipt-security';

describe('verifyResendSignature', () => {
  const key = Buffer.from('test-resend-webhook-key');
  const secret = ['whsec_', key.toString('base64')].join('');
  const messageId = 'msg_provider_event_1';
  const timestamp = '1893456000';
  const now = new Date('2030-01-01T00:00:00Z');
  const rawBody = Buffer.from('{"type":"email.delivered"}');

  function signature(body = rawBody): string {
    return `v1,${createHmac('sha256', key)
      .update(`${messageId}.${timestamp}.`)
      .update(body)
      .digest('base64')}`;
  }

  it('accepts a current signature over the exact raw body', () => {
    expect(
      verifyResendSignature({
        messageId,
        timestamp,
        signature: signature(),
        rawBody,
        secret,
        now,
      }),
    ).toBe(true);
  });

  it('accepts any matching v1 signature during secret rotation', () => {
    expect(
      verifyResendSignature({
        messageId,
        timestamp,
        signature: `v1,invalid ${signature()}`,
        rawBody,
        secret,
        now,
      }),
    ).toBe(true);
  });

  it('rejects body tampering, stale timestamps, and missing secrets', () => {
    expect(
      verifyResendSignature({
        messageId,
        timestamp,
        signature: signature(),
        rawBody: Buffer.from('{"type":"email.bounced"}'),
        secret,
        now,
      }),
    ).toBe(false);
    expect(
      verifyResendSignature({
        messageId,
        timestamp,
        signature: signature(),
        rawBody,
        secret,
        now: new Date('2030-01-01T00:05:01Z'),
      }),
    ).toBe(false);
    expect(
      verifyResendSignature({
        messageId,
        timestamp,
        signature: signature(),
        rawBody,
        secret: undefined,
        now,
      }),
    ).toBe(false);
  });
});
