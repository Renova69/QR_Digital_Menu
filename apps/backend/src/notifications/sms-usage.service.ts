import { BadRequestException, Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationDeliveryStatus,
  Prisma,
  SmsDeliveryStatus,
  SmsProvider,
  SubscriptionTier,
} from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';
import type { SmsProviderAcceptance } from './notification-provider';

const DEFAULT_ALLOWANCE: Record<SubscriptionTier, number> = {
  FREE: 0,
  STARTER: 0,
  PROFESSIONAL: 50,
  ENTERPRISE: 200,
};

const ALLOWANCE_ENV: Partial<Record<SubscriptionTier, string>> = {
  PROFESSIONAL: 'SMS_INCLUDED_PROFESSIONAL',
  ENTERPRISE: 'SMS_INCLUDED_ENTERPRISE',
};

const COST_ENV: Record<SmsProvider, string> = {
  TWILIO: 'SMS_TWILIO_COST_MICROS_PER_SEGMENT',
  SMS_GATEWAY: 'SMS_GATEWAY_COST_MICROS_PER_SEGMENT',
};
const PERIOD_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const POSTGRES_INTEGER_MAX = 2_147_483_647;

function nonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= POSTGRES_INTEGER_MAX
    ? parsed
    : fallback;
}

function optionalNonNegativeInteger(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) &&
    parsed >= 0 &&
    parsed <= POSTGRES_INTEGER_MAX
    ? parsed
    : null;
}

function addCost(
  totals: Map<string, { micros: number; deliveryCount: number }>,
  currency: string | null,
  micros: number | null,
): void {
  if (!currency || micros === null) return;
  const current = totals.get(currency) ?? { micros: 0, deliveryCount: 0 };
  current.micros += micros;
  current.deliveryCount += 1;
  totals.set(currency, current);
}

function parsePeriodMonth(
  periodMonth: string | undefined,
  timezone: string | null,
): {
  key: string;
  timezone: string;
  start: Date;
  end: Date;
} {
  const requestedZone = timezone
    ? DateTime.utc().setZone(timezone)
    : DateTime.invalid('timezone not configured');
  const zone = timezone && requestedZone.isValid ? timezone : 'UTC';
  const key = periodMonth ?? DateTime.now().setZone(zone).toFormat('yyyy-MM');
  if (!PERIOD_MONTH_PATTERN.test(key)) {
    throw new BadRequestException('periodMonth must use YYYY-MM');
  }
  const start = DateTime.fromFormat(key, 'yyyy-MM', { zone }).startOf('month');
  return {
    key,
    timezone: zone,
    start: start.toUTC().toJSDate(),
    end: start.plus({ months: 1 }).toUTC().toJSDate(),
  };
}

export type SmsPolicySnapshot = {
  effectiveTier: SubscriptionTier;
  includedSegments: number;
};

@Injectable()
export class SmsUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly features: FeatureService,
  ) {}

  getPolicySnapshot(
    tier: SubscriptionTier,
    forceTier: SubscriptionTier | null,
  ): SmsPolicySnapshot {
    const effectiveTier = this.features.getEffectiveTier(
      tier,
      forceTier,
    ) as SubscriptionTier;
    const envName = ALLOWANCE_ENV[effectiveTier];
    return {
      effectiveTier,
      includedSegments: nonNegativeInteger(
        envName ? process.env[envName] : undefined,
        DEFAULT_ALLOWANCE[effectiveTier],
      ),
    };
  }

  acceptanceData(
    policy: SmsPolicySnapshot,
    acceptance: SmsProviderAcceptance,
  ): Prisma.NotificationDeliveryUpdateManyMutationInput {
    const unitCost = optionalNonNegativeInteger(
      process.env[COST_ENV[acceptance.provider]],
    );
    const rawEstimate =
      unitCost !== null ? unitCost * acceptance.segmentCount : null;
    const estimatedCostMicros =
      rawEstimate !== null && rawEstimate <= POSTGRES_INTEGER_MAX
        ? rawEstimate
        : null;
    const configuredCurrency = process.env.SMS_COST_CURRENCY?.toUpperCase();
    const estimatedCostCurrency =
      configuredCurrency && /^[A-Z]{3}$/.test(configuredCurrency)
        ? configuredCurrency
        : 'EUR';
    return {
      smsProvider: acceptance.provider,
      smsDeliveryStatus: SmsDeliveryStatus.ACCEPTED,
      smsProviderStatus: 'accepted',
      smsSegmentCount: acceptance.segmentCount,
      smsEstimatedCostMicros: estimatedCostMicros,
      smsProviderCostMicros: acceptance.providerCostMicros,
      smsEstimatedCostCurrency:
        estimatedCostMicros === null ? null : estimatedCostCurrency,
      smsProviderCostCurrency:
        acceptance.providerCostMicros === null ? null : acceptance.currency,
      smsEffectiveTier: policy.effectiveTier,
      smsAllowanceAtSend: policy.includedSegments,
    };
  }

  async getSummary(
    restaurantId: string,
    periodMonth?: string,
  ): Promise<{
    periodMonth: string;
    timezone: string;
    trackOnly: true;
    effectiveTier: SubscriptionTier;
    includedSegments: number;
    usedSegments: number;
    remainingSegments: number;
    overageSegments: number;
    deliveryCount: number;
    estimatedCosts: Array<{
      currency: string;
      micros: number;
      deliveryCount: number;
    }>;
    providerCosts: Array<{
      currency: string;
      micros: number;
      deliveryCount: number;
    }>;
  }> {
    if (periodMonth && !PERIOD_MONTH_PATTERN.test(periodMonth)) {
      throw new BadRequestException('periodMonth must use YYYY-MM');
    }
    const restaurant = await this.prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurantId },
      select: { tier: true, forceTier: true, timezone: true },
    });
    const period = parsePeriodMonth(periodMonth, restaurant.timezone);
    const deliveries = await this.prisma.notificationDelivery.findMany({
      where: {
        restaurantId,
        channel: NotificationChannel.SMS,
        status: NotificationDeliveryStatus.ACCEPTED,
        acceptedAt: { gte: period.start, lt: period.end },
      },
      select: {
        smsSegmentCount: true,
        smsEstimatedCostMicros: true,
        smsProviderCostMicros: true,
        smsEstimatedCostCurrency: true,
        smsProviderCostCurrency: true,
      },
    });
    const policy = this.getPolicySnapshot(
      restaurant.tier,
      restaurant.forceTier,
    );
    const usedSegments = deliveries.reduce(
      (total, delivery) => total + Math.max(1, delivery.smsSegmentCount ?? 1),
      0,
    );
    const estimatedCosts = new Map<
      string,
      { micros: number; deliveryCount: number }
    >();
    const providerCosts = new Map<
      string,
      { micros: number; deliveryCount: number }
    >();
    for (const delivery of deliveries) {
      addCost(
        estimatedCosts,
        delivery.smsEstimatedCostCurrency,
        delivery.smsEstimatedCostMicros,
      );
      addCost(
        providerCosts,
        delivery.smsProviderCostCurrency,
        delivery.smsProviderCostMicros,
      );
    }
    return {
      periodMonth: period.key,
      timezone: period.timezone,
      trackOnly: true,
      effectiveTier: policy.effectiveTier,
      includedSegments: policy.includedSegments,
      usedSegments,
      remainingSegments: Math.max(0, policy.includedSegments - usedSegments),
      overageSegments: Math.max(0, usedSegments - policy.includedSegments),
      deliveryCount: deliveries.length,
      estimatedCosts: [...estimatedCosts].map(([currency, cost]) => ({
        currency,
        ...cost,
      })),
      providerCosts: [...providerCosts].map(([currency, cost]) => ({
        currency,
        ...cost,
      })),
    };
  }
}
