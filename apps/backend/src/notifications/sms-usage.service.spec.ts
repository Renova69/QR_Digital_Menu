import { BadRequestException } from '@nestjs/common';
import { SmsProvider, SubscriptionTier } from '@prisma/client';
import { FeatureService } from '../subscription/feature.service';
import { SmsUsageService } from './sms-usage.service';

describe('SmsUsageService', () => {
  const originalEnv = { ...process.env };

  function build() {
    const prisma = {
      restaurant: { findUniqueOrThrow: jest.fn() },
      notificationDelivery: { findMany: jest.fn() },
    };
    return {
      prisma,
      service: new SmsUsageService(prisma as never, new FeatureService()),
    };
  }

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('honours effective tier and configurable included segments', () => {
    process.env.SMS_INCLUDED_ENTERPRISE = '275';
    const { service } = build();

    expect(
      service.getPolicySnapshot(
        SubscriptionTier.PROFESSIONAL,
        SubscriptionTier.ENTERPRISE,
      ),
    ).toEqual({
      effectiveTier: SubscriptionTier.ENTERPRISE,
      includedSegments: 275,
    });
  });

  it('creates immutable acceptance accounting without exposing message PII', () => {
    process.env.SMS_TWILIO_COST_MICROS_PER_SEGMENT = '65000';
    const { service } = build();

    expect(
      service.acceptanceData(
        {
          effectiveTier: SubscriptionTier.PROFESSIONAL,
          includedSegments: 50,
        },
        {
          provider: SmsProvider.TWILIO,
          segmentCount: 2,
          providerCostMicros: 127000,
          currency: 'EUR',
        },
      ),
    ).toEqual(
      expect.objectContaining({
        smsSegmentCount: 2,
        smsEstimatedCostMicros: 130000,
        smsProviderCostMicros: 127000,
        smsEstimatedCostCurrency: 'EUR',
        smsProviderCostCurrency: 'EUR',
        smsEffectiveTier: SubscriptionTier.PROFESSIONAL,
        smsAllowanceAtSend: 50,
      }),
    );
  });

  it('reports usage and overage without enforcing a send block', async () => {
    process.env.SMS_INCLUDED_PROFESSIONAL = '3';
    const { service, prisma } = build();
    prisma.restaurant.findUniqueOrThrow.mockResolvedValue({
      tier: SubscriptionTier.PROFESSIONAL,
      forceTier: null,
      timezone: 'Europe/Sofia',
    });
    prisma.notificationDelivery.findMany.mockResolvedValue([
      {
        smsSegmentCount: 2,
        smsEstimatedCostMicros: 120000,
        smsProviderCostMicros: 118000,
        smsEstimatedCostCurrency: 'EUR',
        smsProviderCostCurrency: 'EUR',
      },
      {
        smsSegmentCount: null,
        smsEstimatedCostMicros: null,
        smsProviderCostMicros: null,
        smsEstimatedCostCurrency: null,
        smsProviderCostCurrency: null,
      },
      {
        smsSegmentCount: 1,
        smsEstimatedCostMicros: 60000,
        smsProviderCostMicros: 59000,
        smsEstimatedCostCurrency: 'EUR',
        smsProviderCostCurrency: 'USD',
      },
    ]);

    await expect(
      service.getSummary('restaurant-1', '2030-01'),
    ).resolves.toEqual(
      expect.objectContaining({
        trackOnly: true,
        timezone: 'Europe/Sofia',
        includedSegments: 3,
        usedSegments: 4,
        remainingSegments: 0,
        overageSegments: 1,
        deliveryCount: 3,
        estimatedCosts: [{ currency: 'EUR', micros: 180000, deliveryCount: 2 }],
        providerCosts: [
          { currency: 'EUR', micros: 118000, deliveryCount: 1 },
          { currency: 'USD', micros: 59000, deliveryCount: 1 },
        ],
      }),
    );
    expect(prisma.notificationDelivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          acceptedAt: {
            gte: new Date('2029-12-31T22:00:00.000Z'),
            lt: new Date('2030-01-31T22:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('rejects ambiguous month filters', async () => {
    const { service } = build();
    await expect(
      service.getSummary('restaurant-1', 'January'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
