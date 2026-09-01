import { ConflictException } from '@nestjs/common';
import {
  EmailDeliveryStatus,
  NotificationChannel,
  NotificationDeliveryStatus,
  SmsDeliveryStatus,
  SmsProvider,
  SubscriptionTier,
} from '@prisma/client';
import { NotificationDeliveryService } from './notification-delivery.service';

const payload = {
  to: 'guest@example.test',
  subject: 'Reminder',
  text: 'Your table is ready',
  html: '<p>Your table is ready</p>',
};

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: 'delivery-1',
    restaurantId: 'restaurant-1',
    sourceType: 'RESERVATION_REMINDER',
    sourceId: 'reservation-1',
    deduplicationKey: 'reservation-1:email',
    channel: NotificationChannel.EMAIL,
    payload,
    payloadHash: 'hash',
    status: NotificationDeliveryStatus.PROCESSING,
    attempts: 1,
    maxAttempts: 5,
    nextAttemptAt: new Date(),
    leaseToken: 'lease-1',
    leaseExpiresAt: new Date(Date.now() + 60_000),
    providerMessageId: null,
    emailDeliveryStatus: null,
    emailProviderStatus: null,
    emailSentAt: null,
    emailDeliveredAt: null,
    emailFailedAt: null,
    emailComplainedAt: null,
    emailLastReceiptAt: null,
    emailLastEventAt: null,
    emailFailureCode: null,
    smsProvider: null,
    smsDeliveryStatus: null,
    smsProviderStatus: null,
    smsSegmentCount: null,
    smsEstimatedCostMicros: null,
    smsProviderCostMicros: null,
    smsEstimatedCostCurrency: null,
    smsProviderCostCurrency: null,
    smsEffectiveTier: null,
    smsAllowanceAtSend: null,
    smsDeliveredPartCount: 0,
    smsSentAt: null,
    smsDeliveredAt: null,
    smsFailedAt: null,
    smsLastReceiptAt: null,
    smsFailureCode: null,
    outcomeUncertain: false,
    lastError: null,
    acceptedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    previousStatus: NotificationDeliveryStatus.PENDING,
    restaurantTier: SubscriptionTier.PROFESSIONAL,
    restaurantForceTier: null,
    ...overrides,
  };
}

function build() {
  // Self-referential by design: $transaction hands the same mock back as the
  // transaction client. The reference resolves when the callback runs, not
  // while the object literal is being built, so const is safe here.
  const prisma: any = {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) =>
      callback(prisma),
    ),
    $queryRaw: jest.fn(),
    notificationDelivery: {
      create: jest.fn(),
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn(),
    },
    reservation: { updateMany: jest.fn() },
    loyaltyPointLedger: { updateMany: jest.fn() },
    restaurant: { findFirst: jest.fn() },
  };
  const provider = { send: jest.fn() };
  const smsUsage = {
    getPolicySnapshot: jest.fn().mockReturnValue({
      effectiveTier: SubscriptionTier.PROFESSIONAL,
      includedSegments: 50,
    }),
    acceptanceData: jest.fn().mockReturnValue({
      smsProvider: SmsProvider.TWILIO,
      smsDeliveryStatus: SmsDeliveryStatus.ACCEPTED,
      smsSegmentCount: 1,
      smsEffectiveTier: SubscriptionTier.PROFESSIONAL,
      smsAllowanceAtSend: 50,
    }),
    getSummary: jest.fn(),
  };
  const service = new NotificationDeliveryService(
    prisma as never,
    provider,
    smsUsage as never,
  );
  return { service, prisma, provider, smsUsage };
}

describe('NotificationDeliveryService', () => {
  it('deduplicates the same tenant/key/channel and rejects payload collisions', async () => {
    const { service, prisma } = build();
    const existing = delivery({ payloadHash: service.hashPayload(payload) });
    prisma.notificationDelivery.upsert.mockResolvedValue(existing);

    await expect(
      service.enqueue({
        restaurantId: 'restaurant-1',
        sourceType: 'RESERVATION_REMINDER',
        sourceId: 'reservation-1',
        deduplicationKey: 'reservation-1:email',
        channel: NotificationChannel.EMAIL,
        payload,
      }),
    ).resolves.toBe(existing);

    await expect(
      service.enqueue({
        restaurantId: 'restaurant-1',
        sourceType: 'RESERVATION_REMINDER',
        sourceId: 'reservation-1',
        deduplicationKey: 'reservation-1:email',
        channel: NotificationChannel.EMAIL,
        payload: { ...payload, subject: 'Changed' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses the supplied transaction client for atomic outbox writes', async () => {
    const { service, prisma } = build();
    const transactionClient = {
      notificationDelivery: { upsert: jest.fn() },
    };
    transactionClient.notificationDelivery.upsert.mockResolvedValue(
      delivery({ payloadHash: service.hashPayload(payload) }),
    );

    await service.enqueueMany(
      [
        {
          restaurantId: 'restaurant-1',
          sourceType: 'RESERVATION_LIFECYCLE',
          sourceId: 'reservation-1',
          deduplicationKey: 'reservation-event-1',
          channel: NotificationChannel.EMAIL,
          payload,
        },
      ],
      transactionClient as never,
    );

    expect(transactionClient.notificationDelivery.upsert).toHaveBeenCalled();
    expect(prisma.notificationDelivery.upsert).not.toHaveBeenCalled();
  });

  it('marks provider-accepted work and completes its source', async () => {
    const { service, prisma, provider } = build();
    prisma.$queryRaw.mockResolvedValue([delivery()]);
    provider.send.mockResolvedValue({
      accepted: true,
      providerMessageId: 'email-123',
    });

    await expect(service.processNext()).resolves.toBe(true);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'delivery-1', leaseToken: 'lease-1' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.ACCEPTED,
        providerMessageId: 'email-123',
        acceptedAt: expect.any(Date),
      }),
    });
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'delivery-1',
        emailDeliveryStatus: null,
      },
      data: { emailDeliveryStatus: EmailDeliveryStatus.ACCEPTED },
    });
    expect(prisma.reservation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'reservation-1',
        restaurantId: 'restaurant-1',
        reminderSentAt: null,
      },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('settles SMS usage metadata atomically with provider acceptance', async () => {
    const { service, prisma, provider, smsUsage } = build();
    prisma.$queryRaw.mockResolvedValue([
      delivery({ channel: NotificationChannel.SMS }),
    ]);
    provider.send.mockResolvedValue({
      accepted: true,
      providerMessageId: 'SM-123',
      sms: {
        provider: SmsProvider.TWILIO,
        segmentCount: 1,
        providerCostMicros: null,
        currency: null,
      },
    });

    await service.processNext();

    const claimSql = prisma.$queryRaw.mock.calls[0][0] as {
      strings: readonly string[];
    };
    expect(claimSql.strings.join(' ')).toContain('candidate."restaurantTier"');
    expect(claimSql.strings.join(' ')).toContain(
      'candidate."restaurantForceTier"',
    );
    expect(smsUsage.getPolicySnapshot).toHaveBeenCalledWith(
      SubscriptionTier.PROFESSIONAL,
      null,
    );
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'delivery-1', leaseToken: 'lease-1' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.ACCEPTED,
        providerMessageId: 'SM-123',
        smsProvider: SmsProvider.TWILIO,
        smsDeliveryStatus: SmsDeliveryStatus.ACCEPTED,
        smsSegmentCount: 1,
        smsAllowanceAtSend: 50,
      }),
    });
  });

  it('retries a transient email failure with the durable delivery identity', async () => {
    const { service, prisma, provider } = build();
    prisma.$queryRaw.mockResolvedValue([delivery()]);
    provider.send.mockResolvedValue({
      accepted: false,
      retryable: true,
      outcomeUncertain: true,
      error: 'Network interrupted',
    });

    await service.processNext(new Date('2030-01-01T00:00:00Z'));

    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'delivery-1', leaseToken: 'lease-1' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.RETRY_SCHEDULED,
        nextAttemptAt: new Date('2030-01-01T00:01:00Z'),
      }),
    });
  });

  it('does not replay an SMS whose prior provider outcome is unknown', async () => {
    const { service, prisma, provider } = build();
    prisma.$queryRaw.mockResolvedValue([
      delivery({
        channel: NotificationChannel.SMS,
        previousStatus: NotificationDeliveryStatus.PROCESSING,
      }),
    ]);

    await service.processNext();

    expect(provider.send).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'delivery-1', leaseToken: 'lease-1' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.FAILED,
        lastError: expect.stringContaining('unknown'),
      }),
    });
  });

  it('keeps a permanent provider rejection visible without retrying', async () => {
    const { service, prisma, provider } = build();
    prisma.$queryRaw.mockResolvedValue([delivery()]);
    provider.send.mockResolvedValue({
      accepted: false,
      retryable: false,
      outcomeUncertain: false,
      error: 'Provider credentials missing',
    });

    await service.processNext();

    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'delivery-1', leaseToken: 'lease-1' },
      data: expect.objectContaining({
        status: NotificationDeliveryStatus.FAILED,
        lastError: 'Provider credentials missing',
      }),
    });
  });

  it('stamps reminderSentAt when a reservation leg permanently fails and no other leg is outstanding', async () => {
    // Regression: previously completeSource() only ran on the ACCEPTED
    // path, so a reservation whose *last* pending leg resolved via
    // permanent failure (e.g. SMS provider rejects) never had
    // reminderSentAt stamped, and reservation-reminder.service.ts's sweep
    // re-selected it forever.
    const { service, prisma, provider } = build();
    prisma.$queryRaw.mockResolvedValue([delivery()]);
    prisma.notificationDelivery.count.mockResolvedValue(0); // no other legs outstanding
    provider.send.mockResolvedValue({
      accepted: false,
      retryable: false,
      outcomeUncertain: false,
      error: 'Provider credentials missing',
    });

    await service.processNext(new Date('2030-01-01T00:00:00Z'));

    expect(prisma.reservation.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'reservation-1',
        restaurantId: 'restaurant-1',
        reminderSentAt: null,
      },
      data: { reminderSentAt: new Date('2030-01-01T00:00:00Z') },
    });
  });

  it('does not stamp reminderSentAt while another leg is still outstanding', async () => {
    const { service, prisma, provider } = build();
    prisma.$queryRaw.mockResolvedValue([delivery()]);
    prisma.notificationDelivery.count.mockResolvedValue(1); // another leg still pending/retrying
    provider.send.mockResolvedValue({
      accepted: false,
      retryable: false,
      outcomeUncertain: false,
      error: 'Provider credentials missing',
    });

    await service.processNext();

    expect(prisma.reservation.updateMany).not.toHaveBeenCalled();
  });

  it('never stamps a loyalty ledger reminderSentAt on permanent failure — only on acceptance', async () => {
    // Regression guard for the opposite direction: unlike reservations,
    // loyalty must never treat a permanently-failed send as "sent" (this
    // is the exact false-success failure mode PRD-003 exists to prevent).
    const { service, prisma, provider } = build();
    prisma.$queryRaw.mockResolvedValue([
      delivery({
        sourceType: 'LOYALTY_EXPIRY_REMINDER',
        sourceId: 'loyalty-account-1',
        payload: { ...payload, ledgerBatchIds: ['batch-1'] },
      }),
    ]);
    provider.send.mockResolvedValue({
      accepted: false,
      retryable: false,
      outcomeUncertain: false,
      error: 'Provider credentials missing',
    });

    await service.processNext();

    expect(prisma.loyaltyPointLedger.updateMany).not.toHaveBeenCalled();
  });

  it('lets an authorized operator recover a known permanent failure', async () => {
    const { service, prisma } = build();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.notificationDelivery.findFirst.mockResolvedValue({
      status: NotificationDeliveryStatus.FAILED,
      outcomeUncertain: false,
    });

    await expect(
      service.retryFailed(
        'restaurant-1',
        'delivery-1',
        'owner-1',
        new Date('2030-01-01T00:00:00Z'),
      ),
    ).resolves.toEqual({
      id: 'delivery-1',
      status: NotificationDeliveryStatus.PENDING,
    });
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'delivery-1',
          restaurantId: 'restaurant-1',
          outcomeUncertain: false,
        }),
        data: expect.objectContaining({
          status: NotificationDeliveryStatus.PENDING,
          attempts: 0,
          lastError: null,
        }),
      }),
    );
  });

  it('requires provider reconciliation before retrying an uncertain failure', async () => {
    const { service, prisma } = build();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.notificationDelivery.findFirst.mockResolvedValue({
      status: NotificationDeliveryStatus.FAILED,
      outcomeUncertain: true,
    });

    await expect(
      service.retryFailed('restaurant-1', 'delivery-1', 'owner-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('returns tenant-scoped delivery state without exposing payload content', async () => {
    const { service, prisma } = build();
    prisma.restaurant.findFirst.mockResolvedValue({ id: 'restaurant-1' });
    prisma.notificationDelivery.findMany.mockResolvedValue([
      { id: 'delivery-1', status: NotificationDeliveryStatus.FAILED },
    ]);

    await service.listForRestaurant(
      'restaurant-1',
      'owner-1',
      NotificationDeliveryStatus.FAILED,
    );

    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'restaurant-1',
        OR: [
          { ownerId: 'owner-1' },
          { staffMembers: { some: { id: 'owner-1' } } },
        ],
      },
      select: { id: true },
    });
    expect(prisma.notificationDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          restaurantId: 'restaurant-1',
          status: NotificationDeliveryStatus.FAILED,
        },
        select: expect.not.objectContaining({ payload: true }),
      }),
    );
  });
});
