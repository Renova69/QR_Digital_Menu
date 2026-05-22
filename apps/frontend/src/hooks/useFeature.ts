import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import RestaurantContext from '../context/RestaurantContext';
import { useAuth } from '../context/AuthContext';
import { getSubscriptionStatus } from '../lib/api';

const ALL_FEATURE_FLAGS = [
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
] as const;

export type FeatureFlag = (typeof ALL_FEATURE_FLAGS)[number];

export type SubscriptionTier = 'FREE' | 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

const TIER_FEATURES: Record<SubscriptionTier, FeatureFlag[]> = {
  FREE: ['menu:view', 'menu:edit', 'menu:import', 'qr:manage'],
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
  ENTERPRISE: [...ALL_FEATURE_FLAGS],
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
  const { user } = useAuth();
  const activeRestaurantId = ctx?.activeRestaurant?.id ?? null;
  const userId = user?.id ?? null;
  const hasRestaurant = !!activeRestaurantId && !!userId;

  const { data } = useQuery({
    queryKey: ['subscription-status', userId, activeRestaurantId],
    queryFn: getSubscriptionStatus,
    staleTime: 60_000,
    enabled: hasRestaurant,
  });

  // Prefer live API tier (already has forceTier applied server-side).
  // Fall back to context while query is loading or user has no restaurant.
  const tier =
    (data?.tier as SubscriptionTier) ??
    (ctx?.activeRestaurant?.forceTier as SubscriptionTier | null | undefined) ??
    (ctx?.activeRestaurant?.tier as SubscriptionTier) ??
    'FREE';

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

export function hasTierFeature(tier: string | undefined | null, feature: FeatureFlag): boolean {
  const t = (tier as SubscriptionTier) ?? 'FREE';
  const feats = TIER_FEATURES[t] ?? TIER_FEATURES.FREE;
  return feats.includes(feature);
}
