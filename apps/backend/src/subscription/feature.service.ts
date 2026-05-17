import { Injectable } from '@nestjs/common';
import { FeatureFlag } from './feature-flag.enum';

type Tier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

const TIER_FEATURES: Record<Tier, FeatureFlag[]> = {
  FREE: [
    FeatureFlag.MENU_VIEW,
    FeatureFlag.MENU_EDIT,
    FeatureFlag.MENU_IMPORT,
    FeatureFlag.QR_MANAGE,
  ],
  STARTER: [
    FeatureFlag.MENU_VIEW,
    FeatureFlag.MENU_EDIT,
    FeatureFlag.MENU_IMPORT,
    FeatureFlag.QR_MANAGE,
    FeatureFlag.ORDERS_RECEIVE,
    FeatureFlag.ANALYTICS_BASIC,
  ],
  PROFESSIONAL: [
    FeatureFlag.MENU_VIEW,
    FeatureFlag.MENU_EDIT,
    FeatureFlag.MENU_IMPORT,
    FeatureFlag.QR_MANAGE,
    FeatureFlag.ORDERS_RECEIVE,
    FeatureFlag.ORDERS_CALL_WAITER,
    FeatureFlag.ANALYTICS_BASIC,
    FeatureFlag.ANALYTICS_FULL,
    FeatureFlag.PAYMENTS_STRIPE,
    FeatureFlag.LANGUAGES_MULTI,
    FeatureFlag.BRANDING_CUSTOM,
    FeatureFlag.LOYALTY,
    FeatureFlag.CUSTOMERS_AUTH,
    FeatureFlag.UPSELLING,
    FeatureFlag.DAYPARTING,
  ],
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
      case 'STARTER':
        return 1;
      case 'PROFESSIONAL':
        return 5;
      case 'ENTERPRISE':
        return Infinity;
      default:
        return 1;
    }
  }

  getAllowedStaffRoles(tier: string): string[] {
    switch (tier) {
      case 'PROFESSIONAL':
        return ['MANAGER'];
      case 'ENTERPRISE':
        return ['MANAGER', 'WAITER', 'KITCHEN'];
      default: // FREE, STARTER
        return [];
    }
  }
}
