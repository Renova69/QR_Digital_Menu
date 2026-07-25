import { Injectable } from '@nestjs/common';
import { TranslationUsageService } from './translation-usage.service';

type Tier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface TranslationQuotaPolicy {
  monthlyCharCap: number;
  maxTargetLanguages: number;
}

// DeepL API Free is 500,000 chars/month for the whole platform key. These
// per-tier caps are deliberately conservative fractions of that so no
// single tenant (or handful of tenants) can exhaust the shared key — see
// the platform cap below for the actual binding constraint. Bump these
// once the platform moves to a paid DeepL plan.
const TIER_POLICY: Record<Tier, TranslationQuotaPolicy> = {
  FREE: { monthlyCharCap: 0, maxTargetLanguages: 0 }, // FREE never has LANGUAGES_MULTI anyway
  STARTER: { monthlyCharCap: 50_000, maxTargetLanguages: 3 },
  PROFESSIONAL: { monthlyCharCap: 150_000, maxTargetLanguages: 6 },
  ENTERPRISE: { monthlyCharCap: 400_000, maxTargetLanguages: 12 },
};

const DEFAULT_PLATFORM_MONTHLY_CAP = 450_000; // 90% of the 500k free-tier ceiling

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'platform_quota_exceeded' | 'restaurant_quota_exceeded';
  remaining: number;
}

/**
 * Centralized translation spend policy — the single place that knows tier
 * caps, the per-tenant override, and the platform-wide cap, so no call site
 * hardcodes a number. Checked BEFORE a batch is sent to the provider (the
 * worker's job — see MenuTranslationWorkerService), never after: a blocked
 * batch must never partially translate and never write anything.
 */
@Injectable()
export class TranslationQuotaService {
  constructor(private readonly usage: TranslationUsageService) {}

  getPolicy(tier: string, override?: number | null): TranslationQuotaPolicy {
    const base = TIER_POLICY[tier as Tier] ?? TIER_POLICY.FREE;
    return override != null && override >= 0
      ? { ...base, monthlyCharCap: override }
      : base;
  }

  private platformCap(): number {
    const envCap = Number(process.env.TRANSLATION_PLATFORM_MONTHLY_CAP);
    return Number.isFinite(envCap) && envCap > 0
      ? envCap
      : DEFAULT_PLATFORM_MONTHLY_CAP;
  }

  async getPlatformStatus(): Promise<{
    used: number;
    cap: number;
    pct: number;
  }> {
    const used = await this.usage.getPlatformUsage();
    const cap = this.platformCap();
    return { used, cap, pct: cap > 0 ? (used / cap) * 100 : 100 };
  }

  async getRestaurantStatus(restaurant: {
    id: string;
    tier: string;
    forceTier?: string | null;
    translationCharCapOverride?: number | null;
  }): Promise<{ used: number; cap: number; pct: number }> {
    const tier = restaurant.forceTier ?? restaurant.tier;
    const policy = this.getPolicy(tier, restaurant.translationCharCapOverride);
    const used = await this.usage.getRestaurantUsage(restaurant.id);
    return {
      used,
      cap: policy.monthlyCharCap,
      pct:
        policy.monthlyCharCap > 0 ? (used / policy.monthlyCharCap) * 100 : 100,
    };
  }

  /**
   * Platform cap is checked first — it is the actually-binding constraint
   * on a free-tier key (roughly 6 full-menu translations/month platform-
   * wide; see the architecture doc's cost math). A tenant well under their
   * own cap can still be blocked here if the shared key is nearly spent.
   */
  async assertCanSpend(
    restaurant: {
      id: string;
      tier: string;
      forceTier?: string | null;
      translationCharCapOverride?: number | null;
    },
    estimatedChars: number,
  ): Promise<QuotaCheckResult> {
    const platform = await this.getPlatformStatus();
    if (platform.used + estimatedChars > platform.cap) {
      return {
        allowed: false,
        reason: 'platform_quota_exceeded',
        remaining: Math.max(0, platform.cap - platform.used),
      };
    }

    const restaurantStatus = await this.getRestaurantStatus(restaurant);
    if (restaurantStatus.used + estimatedChars > restaurantStatus.cap) {
      return {
        allowed: false,
        reason: 'restaurant_quota_exceeded',
        remaining: Math.max(0, restaurantStatus.cap - restaurantStatus.used),
      };
    }

    return {
      allowed: true,
      remaining: restaurantStatus.cap - restaurantStatus.used - estimatedChars,
    };
  }
}
