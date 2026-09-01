import { UnauthorizedException } from '@nestjs/common';
import { EmailDeliveryStatus } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { EmailReceiptController } from './email-receipt.controller';

describe('EmailReceiptController', () => {
  const originalEnv = { ...process.env };
  const key = Buffer.from('test-resend-controller-key');
  const secret = ['whsec_', key.toString('base64')].join('');
  let receipts: { apply: jest.Mock };
  let controller: EmailReceiptController;

  beforeEach(() => {
    process.env = { ...originalEnv, RESEND_WEBHOOK_SECRET: secret };
    receipts = { apply: jest.fn().mockResolvedValue(true) };
    controller = new EmailReceiptController(receipts as never);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function signedHeaders(body: Buffer) {
    const messageId = 'provider-event-1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `v1,${createHmac('sha256', key)
      .update(`${messageId}.${timestamp}.`)
      .update(body)
      .digest('base64')}`;
    return { messageId, timestamp, signature };
  }

  it('accepts a signed delivered event using only opaque identifiers', async () => {
    const body = Buffer.from(
      JSON.stringify({
        type: 'email.delivered',
        created_at: '2030-01-01T12:00:00Z',
        data: {
          email_id: 'email-1',
          tags: { delivery_id: 'delivery-1' },
          to: ['private@example.test'],
          subject: 'Private reservation details',
        },
      }),
    );
    const headers = signedHeaders(body);

    await controller.resend(
      { body } as never,
      headers.messageId,
      headers.timestamp,
      headers.signature,
    );

    expect(receipts.apply).toHaveBeenCalledWith({
      providerEventId: 'provider-event-1',
      providerMessageId: 'email-1',
      deliveryId: 'delivery-1',
      providerStatus: 'email.delivered',
      status: EmailDeliveryStatus.DELIVERED,
      eventAt: new Date('2030-01-01T12:00:00Z'),
      receivedAt: expect.any(Date),
    });
    expect(receipts.apply.mock.calls[0][0]).not.toHaveProperty('to');
    expect(receipts.apply.mock.calls[0][0]).not.toHaveProperty('subject');
  });

  it('maps a bounce to a fixed code without copying provider details', async () => {
    const body = Buffer.from(
      JSON.stringify({
        type: 'email.bounced',
        created_at: '2030-01-01T12:00:00Z',
        data: {
          email_id: 'email-1',
          bounce: { message: 'recipient and SMTP response' },
        },
      }),
    );
    const headers = signedHeaders(body);

    await controller.resend(
      { body } as never,
      headers.messageId,
      headers.timestamp,
      headers.signature,
    );

    expect(receipts.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        status: EmailDeliveryStatus.BOUNCED,
        failureCode: 'RESEND_BOUNCED',
      }),
    );
    expect(receipts.apply.mock.calls[0][0]).not.toHaveProperty('bounce');
  });

  it('records provider suppression as a fixed failure code', async () => {
    const body = Buffer.from(
      JSON.stringify({
        type: 'email.suppressed',
        created_at: '2030-01-01T12:00:00Z',
        data: { email_id: 'email-1' },
      }),
    );
    const headers = signedHeaders(body);

    await controller.resend(
      { body } as never,
      headers.messageId,
      headers.timestamp,
      headers.signature,
    );

    expect(receipts.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        status: EmailDeliveryStatus.FAILED,
        failureCode: 'RESEND_SUPPRESSED',
      }),
    );
  });

  it('ignores signed non-email events', async () => {
    const body = Buffer.from(JSON.stringify({ type: 'domain.verified' }));
    const headers = signedHeaders(body);

    await controller.resend(
      { body } as never,
      headers.messageId,
      headers.timestamp,
      headers.signature,
    );

    expect(receipts.apply).not.toHaveBeenCalled();
  });

  it('rejects a callback with an invalid signature', async () => {
    const body = Buffer.from(
      JSON.stringify({
        type: 'email.delivered',
        data: { email_id: 'email-1' },
      }),
    );

    await expect(
      controller.resend(
        { body } as never,
        'provider-event-1',
        String(Math.floor(Date.now() / 1000)),
        'v1,invalid',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(receipts.apply).not.toHaveBeenCalled();
  });
});
