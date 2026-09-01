import { createHmac } from 'node:crypto';
import {
  buildPublicCallbackUrl,
  verifySmsGatewaySignature,
  verifyTwilioSignature,
} from './sms-receipt-security';

describe('SMS receipt signature verification', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('builds callbacks from the configured public backend origin', () => {
    process.env.BACKEND_URL = 'https://backend.example.test/ignored';
    expect(buildPublicCallbackUrl('/api/v1/status')).toBe(
      'https://backend.example.test/api/v1/status',
    );
  });

  it('verifies Twilio URL and sorted form parameters', () => {
    const url = 'https://backend.example.test/api/v1/status';
    const form = { MessageStatus: 'delivered', MessageSid: 'SM123' };
    const signed =
      url +
      'MessageSid' +
      form.MessageSid +
      'MessageStatus' +
      form.MessageStatus;
    const signature = createHmac('sha1', 'auth-token')
      .update(signed)
      .digest('base64');

    expect(
      verifyTwilioSignature({
        signature,
        url,
        form,
        authToken: 'auth-token',
      }),
    ).toBe(true);
    expect(
      verifyTwilioSignature({
        signature: `${signature}changed`,
        url,
        form,
        authToken: 'auth-token',
      }),
    ).toBe(false);
  });

  it('verifies SMS Gateway raw-body signatures and rejects stale replays', () => {
    const now = new Date('2030-01-01T00:00:00Z');
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const rawBody = Buffer.from('{"event":"sms:delivered"}');
    const signature = createHmac('sha256', 'signing-key')
      .update(rawBody)
      .update(timestamp)
      .digest('hex');

    expect(
      verifySmsGatewaySignature({
        signature,
        timestamp,
        rawBody,
        signingKey: 'signing-key',
        now,
      }),
    ).toBe(true);
    expect(
      verifySmsGatewaySignature({
        signature,
        timestamp,
        rawBody,
        signingKey: 'signing-key',
        now: new Date('2030-01-01T00:06:00Z'),
      }),
    ).toBe(false);
  });
});
