import { Injectable } from '@nestjs/common';
import { FeatureFlag } from './feature-flag.enum';

type Tier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

// Each paid tier is strictly additive over the one below it. Spreading the
// lower tier (instead of re-listing every flag) means a flag added to FREE
// automatically propagates upward — it can never silently go missing from a
// higher tier, which was the M-1 maintenance hazard.
const FREE_FEATURES: FeatureFlag[] = [
  FeatureFlag.MENU_VIEW,
  FeatureFlag.MENU_EDIT,
  FeatureFlag.MENU_IMPORT,
  FeatureFlag.QR_MANAGE,
];

const STARTER_FEATURES: FeatureFlag[] = [
  ...FREE_FEATURES,
  FeatureFlag.ORDERS_RECEIVE,
  FeatureFlag.ORDERS_CALL_WAITER,
  FeatureFlag.ANALYTICS_BASIC,
  FeatureFlag.LANGUAGES_MULTI,
];

const PROFESSIONAL_FEATURES: FeatureFlag[] = [
  ...STARTER_FEATURES,
  FeatureFlag.ANALYTICS_FULL,
  FeatureFlag.PAYMENTS_EPAY,
  FeatureFlag.PAYMENTS_BORICA,
  FeatureFlag.PAYMENTS_MYPOS,
  FeatureFlag.PAYMENTS_STRIPE,
  FeatureFlag.BRANDING_CUSTOM,
  FeatureFlag.LOYALTY,
  FeatureFlag.CUSTOMERS_AUTH,
  FeatureFlag.UPSELLING,
  FeatureFlag.DAYPARTING,
];

const TIER_FEATURES: Record<Tier, FeatureFlag[]> = {
  FREE: FREE_FEATURES,
  STARTER: STARTER_FEATURES,
  PROFESSIONAL: PROFESSIONAL_FEATURES,
  ENTERPRISE: Object.values(FeatureFlag),
};

@Injectable()
export class FeatureService {
  getFeatures(tier: string): FeatureFlag[] {
    return TIER_FEATURES[tier as Tier] ?? TIER_FEATURES.FREE;
  }

  hasFeature(tier: string, feature: FeatureFlag): boolean {
    return this.getFeatures(tier).includes(feature);
  }

  getStaffLimit(tier: string): number {
    switch (tier) {
      case 'FREE':
        return 0;
      case 'STARTER':
        return 1;
      case 'PROFESSIONAL':
        return 5;
      case 'ENTERPRISE':
        return 999999;
      default:
        return 0;
    }
  }

  getAllowedStaffRoles(tier: string): string[] {
    switch (tier) {
      case 'STARTER':
        return ['STAFF'];
      case 'PROFESSIONAL':
        return ['STAFF', 'MANAGER'];
      case 'ENTERPRISE':
        return ['STAFF', 'MANAGER', 'WAITER', 'KITCHEN'];
      default: // FREE and unknown
        return [];
    }
  }

  getEffectiveTier(tier: string, forceTier?: string | null): string {
    if (forceTier && forceTier in TIER_FEATURES) {
      return forceTier;
    }
    return tier;
  }

  /**
   * Resolve a restaurant's effective tier (honoring super-admin forceTier) and
   * test a single feature flag in one call. Collapses the repeated
   * getEffectiveTier(...) + hasFeature(...) pattern across services.
   */
  restaurantHasFeature(
    restaurant: { tier?: string | null; forceTier?: string | null } | null,
    feature: FeatureFlag,
  ): boolean {
    const tier = this.getEffectiveTier(
      restaurant?.tier ?? 'FREE',
      restaurant?.forceTier ?? null,
    );
    return this.hasFeature(tier, feature);
  }
}
