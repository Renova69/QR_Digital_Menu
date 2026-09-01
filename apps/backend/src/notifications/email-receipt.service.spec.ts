import { EmailDeliveryStatus } from '@prisma/client';
import { EmailReceiptService } from './email-receipt.service';

describe('EmailReceiptService', () => {
  function build() {
    const prisma = {
      notificationDelivery: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'delivery-1',
          providerMessageId: 'email-1',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailProviderReceipt: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    return {
      prisma,
      service: new EmailReceiptService({
        $transaction: jest.fn(async (fn) => fn(prisma)),
      } as never),
    };
  }

  const baseReceipt = {
    providerEventId: 'provider-event-1',
    providerMessageId: 'email-1',
    providerStatus: 'email.delivered',
    status: EmailDeliveryStatus.DELIVERED,
    eventAt: new Date('2030-01-01T12:00:00Z'),
    receivedAt: new Date('2030-01-01T12:00:01Z'),
  };

  it('persists an idempotency receipt before applying delivered state', async () => {
    const { service, prisma } = build();

    await expect(service.apply(baseReceipt)).resolves.toBe(true);

    expect(prisma.emailProviderReceipt.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deliveryId: 'delivery-1',
        providerEventId: 'provider-event-1',
      }),
      skipDuplicates: true,
    });
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailDeliveryStatus: EmailDeliveryStatus.DELIVERED,
          emailDeliveredAt: baseReceipt.eventAt,
          emailLastEventAt: baseReceipt.eventAt,
        }),
      }),
    );
  });

  it('uses the durable delivery tag when a receipt beats send settlement', async () => {
    const { service, prisma } = build();
    prisma.notificationDelivery.findFirst.mockResolvedValue({
      id: 'delivery-1',
      providerMessageId: null,
    });

    await expect(
      service.apply({ ...baseReceipt, deliveryId: 'delivery-1' }),
    ).resolves.toBe(true);

    expect(prisma.notificationDelivery.findFirst).toHaveBeenCalledWith({
      where: {
        channel: 'EMAIL',
        id: 'delivery-1',
      },
      select: { id: true, providerMessageId: true },
    });
    expect(prisma.notificationDelivery.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'delivery-1', providerMessageId: null },
      data: { providerMessageId: 'email-1' },
    });
    expect(prisma.notificationDelivery.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          emailDeliveryStatus: EmailDeliveryStatus.DELIVERED,
        }),
      }),
    );
  });

  it('refuses a tagged receipt whose provider id conflicts with the row', async () => {
    const { service, prisma } = build();
    prisma.notificationDelivery.findFirst.mockResolvedValue({
      id: 'delivery-1',
      providerMessageId: 'different-email',
    });

    await expect(
      service.apply({ ...baseReceipt, deliveryId: 'delivery-1' }),
    ).resolves.toBe(false);

    expect(prisma.emailProviderReceipt.createMany).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('ignores a duplicate provider event', async () => {
    const { service, prisma } = build();
    prisma.emailProviderReceipt.createMany.mockResolvedValue({ count: 0 });

    await expect(service.apply(baseReceipt)).resolves.toBe(false);

    expect(prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('does not let a late sent event regress a terminal state', async () => {
    const { service, prisma } = build();
    prisma.notificationDelivery.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.apply({
        ...baseReceipt,
        providerEventId: 'provider-event-sent',
        providerStatus: 'email.sent',
        status: EmailDeliveryStatus.SENT,
      }),
    ).resolves.toBe(false);

    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({
              OR: expect.arrayContaining([
                { emailLastEventAt: null },
                { emailLastEventAt: { lte: baseReceipt.eventAt } },
              ]),
            }),
            expect.objectContaining({
              OR: expect.arrayContaining([
                { emailDeliveryStatus: null },
                expect.objectContaining({
                  emailDeliveryStatus: expect.any(Object),
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it('records fixed failure evidence without free-form provider details', async () => {
    const { service, prisma } = build();

    await service.apply({
      ...baseReceipt,
      providerEventId: 'provider-event-bounced',
      providerStatus: 'email.bounced',
      status: EmailDeliveryStatus.BOUNCED,
      failureCode: 'RESEND_BOUNCED',
    });

    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailDeliveryStatus: EmailDeliveryStatus.BOUNCED,
          emailFailedAt: baseReceipt.eventAt,
          emailFailureCode: 'RESEND_BOUNCED',
        }),
      }),
    );
  });

  it('does not persist unmatched auth-email events', async () => {
    const { service, prisma } = build();
    prisma.notificationDelivery.findFirst.mockResolvedValue(null);

    await expect(service.apply(baseReceipt)).resolves.toBe(false);

    expect(prisma.emailProviderReceipt.createMany).not.toHaveBeenCalled();
  });
});
