import { SmsDeliveryStatus, SmsProvider } from '@prisma/client';
import { SmsReceiptService } from './sms-receipt.service';

describe('SmsReceiptService', () => {
  function build() {
    const prisma = {
      $transaction: jest.fn(),
      notificationDelivery: {
        findFirst: jest.fn().mockResolvedValue({ id: 'delivery-1' }),
        update: jest.fn().mockResolvedValue({
          smsDeliveredPartCount: 1,
          smsDeliveryStatus: SmsDeliveryStatus.SENT,
          smsSegmentCount: 2,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      smsProviderReceipt: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => unknown) => callback(prisma),
    );
    return {
      prisma,
      service: new SmsReceiptService(prisma as never),
    };
  }

  it('persists a Twilio receipt before updating delivery state', async () => {
    const { service, prisma } = build();
    const at = new Date('2030-01-01T12:00:00Z');

    await expect(
      service.apply({
        provider: SmsProvider.TWILIO,
        providerEventId: 'twilio-event-1',
        providerMessageId: 'SM123',
        providerStatus: 'delivered',
        status: SmsDeliveryStatus.DELIVERED,
        eventAt: at,
        receivedAt: at,
      }),
    ).resolves.toBe(true);

    expect(prisma.smsProviderReceipt.createMany).toHaveBeenCalledWith({
      data: expect.objectContaining({
        deliveryId: 'delivery-1',
        providerEventId: 'twilio-event-1',
      }),
      skipDuplicates: true,
    });
    expect(prisma.notificationDelivery.updateMany).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: expect.objectContaining({
        smsDeliveryStatus: SmsDeliveryStatus.DELIVERED,
        smsDeliveredAt: at,
        smsLastReceiptAt: at,
      }),
    });
  });

  it('deduplicates a provider retry before changing the aggregate', async () => {
    const { service, prisma } = build();
    prisma.smsProviderReceipt.createMany.mockResolvedValue({ count: 0 });

    await expect(
      service.apply({
        provider: SmsProvider.TWILIO,
        providerEventId: 'same-event',
        providerMessageId: 'SM123',
        providerStatus: 'delivered',
        status: SmsDeliveryStatus.DELIVERED,
        eventAt: new Date(),
        receivedAt: new Date(),
      }),
    ).resolves.toBe(false);

    expect(prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.update).not.toHaveBeenCalled();
  });

  it('counts each distinct SMS Gateway delivered part atomically', async () => {
    const { service, prisma } = build();
    prisma.notificationDelivery.update
      .mockResolvedValueOnce({
        smsDeliveredPartCount: 1,
        smsDeliveryStatus: SmsDeliveryStatus.SENT,
        smsSegmentCount: 2,
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        smsDeliveredPartCount: 2,
        smsDeliveryStatus: SmsDeliveryStatus.SENT,
        smsSegmentCount: 2,
      })
      .mockResolvedValueOnce({});

    await expect(
      service.apply({
        provider: SmsProvider.SMS_GATEWAY,
        providerEventId: 'gateway-part-1',
        providerMessageId: 'delivery-1',
        providerStatus: 'sms:delivered',
        status: SmsDeliveryStatus.DELIVERED,
        eventAt: new Date(),
        receivedAt: new Date(),
      }),
    ).resolves.toBe(true);

    expect(prisma.notificationDelivery.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          smsDeliveredPartCount: { increment: 1 },
        }),
      }),
    );
    expect(
      prisma.notificationDelivery.update.mock.calls[1][0].data,
    ).not.toHaveProperty('smsDeliveryStatus');

    await expect(
      service.apply({
        provider: SmsProvider.SMS_GATEWAY,
        providerEventId: 'gateway-part-2',
        providerMessageId: 'delivery-1',
        providerStatus: 'sms:delivered',
        status: SmsDeliveryStatus.DELIVERED,
        eventAt: new Date(),
        receivedAt: new Date(),
      }),
    ).resolves.toBe(true);

    expect(prisma.notificationDelivery.update.mock.calls[3][0].data).toEqual(
      expect.objectContaining({
        smsDeliveryStatus: SmsDeliveryStatus.DELIVERED,
      }),
    );
    expect(prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('reconciles a late SMS Gateway sent event with its actual part count', async () => {
    const { service, prisma } = build();

    await expect(
      service.apply({
        provider: SmsProvider.SMS_GATEWAY,
        providerEventId: 'gateway-sent-1',
        providerMessageId: 'delivery-1',
        providerStatus: 'sms:sent',
        status: SmsDeliveryStatus.SENT,
        segmentCount: 2,
        eventAt: new Date(),
        receivedAt: new Date(),
      }),
    ).resolves.toBe(true);

    expect(prisma.notificationDelivery.update).toHaveBeenCalledTimes(2);
    expect(prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('guards a terminal delivery against a late sent callback', async () => {
    const { service, prisma } = build();
    prisma.notificationDelivery.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.apply({
        provider: SmsProvider.TWILIO,
        providerEventId: 'twilio-sent-late',
        providerMessageId: 'SM123',
        providerStatus: 'sent',
        status: SmsDeliveryStatus.SENT,
        eventAt: new Date(),
        receivedAt: new Date(),
      }),
    ).resolves.toBe(false);

    expect(
      prisma.notificationDelivery.updateMany.mock.calls[0][0].where.OR,
    ).toEqual(
      expect.arrayContaining([
        { smsDeliveryStatus: null },
        expect.objectContaining({ smsDeliveryStatus: expect.any(Object) }),
      ]),
    );
  });
});
