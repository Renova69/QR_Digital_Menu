import {
  NotificationChannel,
  NotificationDeliveryStatus,
} from '@prisma/client';
import { ProductionNotificationProvider } from './notification-provider';

function delivery(channel: NotificationChannel = NotificationChannel.EMAIL) {
  return {
    id: 'delivery-123',
    restaurantId: 'restaurant-1',
    sourceType: 'TEST',
    sourceId: 'source-1',
    deduplicationKey: 'test',
    channel,
    payload:
      channel === NotificationChannel.EMAIL
        ? {
            to: 'guest@example.test',
            subject: 'Reminder',
            text: 'Reminder',
            html: '<p>Reminder</p>',
          }
        : { to: '+359000000000', body: 'Reminder' },
    payloadHash: 'hash',
    status: NotificationDeliveryStatus.PROCESSING,
    attempts: 1,
    maxAttempts: 5,
    nextAttemptAt: new Date(),
    leaseToken: 'lease',
    leaseExpiresAt: new Date(),
    providerMessageId: null,
    outcomeUncertain: false,
    lastError: null,
    acceptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ProductionNotificationProvider', () => {
  const originalEnv = { ...process.env };
  const provider = new ProductionNotificationProvider();

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    delete process.env.RESEND_API_KEY;
    delete process.env.SMS_PROVIDER;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('does not claim provider acceptance when non-production delivery is suppressed', async () => {
    process.env.NODE_ENV = 'test';
    await expect(provider.send(delivery())).resolves.toMatchObject({
      accepted: false,
      retryable: false,
      outcomeUncertain: false,
      error: expect.stringContaining('suppressed'),
    });
  });

  it('uses the durable delivery id as Resend idempotency key and records acceptance', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ id: 'resend-message-1' }),
    } as unknown as Response);

    await expect(provider.send(delivery())).resolves.toEqual({
      accepted: true,
      providerMessageId: 'resend-message-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': 'delivery-123',
        }),
      }),
    );
  });

  it('does not report acceptance when email credentials are absent', async () => {
    await expect(provider.send(delivery())).resolves.toMatchObject({
      accepted: false,
      retryable: false,
      outcomeUncertain: false,
    });
  });

  it('classifies an explicit provider 503 as retryable', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(provider.send(delivery())).resolves.toMatchObject({
      accepted: false,
      retryable: true,
      outcomeUncertain: false,
    });
  });

  it('classifies an interrupted SMS provider call as an unknown terminal outcome', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC-test';
    process.env.TWILIO_AUTH_TOKEN = 'secret';
    process.env.TWILIO_FROM_NUMBER = '+359111111111';
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('socket closed'));

    await expect(
      provider.send(delivery(NotificationChannel.SMS)),
    ).resolves.toMatchObject({
      accepted: false,
      retryable: false,
      outcomeUncertain: true,
    });
  });
});
