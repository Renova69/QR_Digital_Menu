import { UnauthorizedException } from '@nestjs/common';
import { SmsDeliveryStatus, SmsProvider } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { SmsReceiptController } from './sms-receipt.controller';

describe('SmsReceiptController', () => {
  const originalEnv = { ...process.env };
  let receipts: { apply: jest.Mock };
  let controller: SmsReceiptController;

  beforeEach(() => {
    process.env = { ...originalEnv };
    receipts = { apply: jest.fn().mockResolvedValue(true) };
    controller = new SmsReceiptController(receipts as never);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts a signed Twilio delivered callback', async () => {
    process.env.BACKEND_URL = 'https://backend.example.test';
    process.env.TWILIO_AUTH_TOKEN = 'auth-token';
    const body = { MessageSid: 'SM123', MessageStatus: 'delivered' };
    const url =
      'https://backend.example.test/api/v1/notifications/sms/twilio/status';
    const signature = createHmac('sha1', 'auth-token')
      .update(
        url +
          'MessageSid' +
          body.MessageSid +
          'MessageStatus' +
          body.MessageStatus,
      )
      .digest('base64');

    await controller.twilio({ body } as never, signature);

    expect(receipts.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: SmsProvider.TWILIO,
        providerEventId: expect.any(String),
        providerMessageId: 'SM123',
        status: SmsDeliveryStatus.DELIVERED,
      }),
    );
  });

  it('accepts a signed SMS Gateway multipart sent callback', async () => {
    process.env.SMS_GATEWAY_WEBHOOK_SIGNING_KEY = 'signing-key';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = Buffer.from(
      JSON.stringify({
        id: 'provider-event-1',
        event: 'sms:sent',
        payload: {
          messageId: 'delivery-1',
          partsCount: 2,
          sentAt: '2030-01-01T10:00:00Z',
        },
      }),
    );
    const signature = createHmac('sha256', 'signing-key')
      .update(body)
      .update(timestamp)
      .digest('hex');

    await controller.smsGateway({ body } as never, signature, timestamp);

    expect(receipts.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: SmsProvider.SMS_GATEWAY,
        providerEventId: 'provider-event-1',
        providerMessageId: 'delivery-1',
        status: SmsDeliveryStatus.SENT,
        segmentCount: 2,
      }),
    );
  });

  it('does not persist free-form SMS Gateway failure details', async () => {
    process.env.SMS_GATEWAY_WEBHOOK_SIGNING_KEY = 'signing-key';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = Buffer.from(
      JSON.stringify({
        id: 'provider-event-failed',
        event: 'sms:failed',
        payload: {
          messageId: 'delivery-1',
          failedAt: '2030-01-01T10:00:00Z',
          reason: 'carrier returned recipient details',
        },
      }),
    );
    const signature = createHmac('sha256', 'signing-key')
      .update(body)
      .update(timestamp)
      .digest('hex');

    await controller.smsGateway({ body } as never, signature, timestamp);

    expect(receipts.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        failureCode: 'SMSGATEWAY_FAILED',
      }),
    );
    expect(receipts.apply.mock.calls[0][0]).not.toHaveProperty('reason');
  });

  it('rejects an unsigned provider callback', async () => {
    process.env.BACKEND_URL = 'https://backend.example.test';
    process.env.TWILIO_AUTH_TOKEN = 'auth-token';

    await expect(
      controller.twilio(
        { body: { MessageSid: 'SM123', MessageStatus: 'delivered' } } as never,
        'invalid',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(receipts.apply).not.toHaveBeenCalled();
  });
});
