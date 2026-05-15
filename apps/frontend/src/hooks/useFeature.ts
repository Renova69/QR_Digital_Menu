import { useContext } from 'react';
import RestaurantContext from '../context/RestaurantContext';

export type FeatureFlag =
  | 'menu:view'
  | 'menu:edit'
  | 'menu:import'
  | 'qr:manage'
  | 'orders:receive'
  | 'orders:call-waiter'
  | 'analytics:basic'
  | 'analytics:full'
  | 'payments:stripe'
  | 'languages:multi'
  | 'branding:custom'
  | 'loyalty'
  | 'customers:auth'
  | 'upselling'
  | 'dayparting'
  | 'pos'
  | 'kds'
  | 'rbac'
  | 'multilocation'
  | 'printers:thermal'
  | 'templates:menu'
  | 'staff:unlimited';

export type SubscriptionTier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

const TIER_FEATURES: Record<SubscriptionTier, FeatureFlag[]> = {
  FREE: ['menu:view', 'menu:edit', 'qr:manage'],
  STARTER: [
    'menu:view',
    'menu:edit',
    'menu:import',
    'qr:manage',
    'orders:receive',
    'analytics:basic',
  ],
  PROFESSIONAL: [
    'menu:view',
    'menu:edit',
    'menu:import',
    'qr:manage',
    'orders:receive',
    'orders:call-waiter',
    'analytics:basic',
    'analytics:full',
    'payments:stripe',
    'languages:multi',
    'branding:custom',
    'loyalty',
    'customers:auth',
    'upselling',
    'dayparting',
  ],
  ENTERPRISE: [
    'menu:view',
    'menu:edit',
    'menu:import',
    'qr:manage',
    'orders:receive',
    'orders:call-waiter',
    'analytics:basic',
    'analytics:full',
    'payments:stripe',
    'languages:multi',
    'branding:custom',
    'loyalty',
    'customers:auth',
    'upselling',
    'dayparting',
    'pos',
    'kds',
    'rbac',
    'multilocation',
    'printers:thermal',
    'templates:menu',
    'staff:unlimited',
  ],
};

function getStaffLimit(tier: SubscriptionTier): number {
  switch (tier) {
    case 'FREE':
    case 'STARTER':
      return 1;
    case 'PROFESSIONAL':
      return 5;
    case 'ENTERPRISE':
      return Infinity;
  }
}

export function useTier(): {
  tier: SubscriptionTier;
  features: FeatureFlag[];
  staffLimit: number;
} {
  const ctx = useContext(RestaurantContext);
  const tier = (ctx?.activeRestaurant?.tier as SubscriptionTier) || 'FREE';
  return {
    tier,
    features: TIER_FEATURES[tier] ?? TIER_FEATURES.FREE,
    staffLimit: getStaffLimit(tier),
  };
}

export function useFeature(feature: FeatureFlag): boolean {
  const { features } = useTier();
  return features.includes(feature);
}
