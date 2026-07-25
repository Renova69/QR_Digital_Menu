export type TierName = 'Bronze' | 'Silver' | 'Gold';

export interface TierConfig {
  silverThreshold: number;
  goldThreshold: number;
  silverMultiplier: number;
  goldMultiplier: number;
}

export interface TierInfo {
  tier: TierName;
  multiplier: number;
  nextTierName: string;
  pointsToNext: number;
  progressPercent: number;
}

export function getTierInfo(
  lifetimePoints: number,
  config: TierConfig,
): TierInfo {
  const { silverThreshold, goldThreshold, silverMultiplier, goldMultiplier } =
    config;

  if (lifetimePoints >= goldThreshold) {
    return {
      tier: 'Gold',
      multiplier: goldMultiplier,
      nextTierName: 'Max Tier',
      pointsToNext: 0,
      progressPercent: 100,
    };
  }

  if (lifetimePoints >= silverThreshold) {
    const range = goldThreshold - silverThreshold;
    return {
      tier: 'Silver',
      multiplier: silverMultiplier,
      nextTierName: 'Gold',
      pointsToNext: goldThreshold - lifetimePoints,
      progressPercent: Math.round(
        ((lifetimePoints - silverThreshold) / range) * 100,
      ),
    };
  }

  return {
    tier: 'Bronze',
    multiplier: 1.0,
    nextTierName: 'Silver',
    pointsToNext: silverThreshold - lifetimePoints,
    progressPercent: Math.round((lifetimePoints / silverThreshold) * 100),
  };
}

export function tierConfigFromRestaurant(restaurant: {
  loyaltySilverThreshold?: number | null;
  loyaltyGoldThreshold?: number | null;
  loyaltySilverMultiplier?: number | null;
  loyaltyGoldMultiplier?: number | null;
}): TierConfig {
  return {
    silverThreshold: restaurant.loyaltySilverThreshold ?? 500,
    goldThreshold: restaurant.loyaltyGoldThreshold ?? 2000,
    silverMultiplier: restaurant.loyaltySilverMultiplier ?? 1.2,
    goldMultiplier: restaurant.loyaltyGoldMultiplier ?? 1.5,
  };
}
