import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';

/**
 * Single source of truth for whether loyalty is active for a restaurant (#5).
 *
 * Loyalty runs only when BOTH hold:
 *   1. the restaurant's EFFECTIVE tier (honoring super-admin forceTier)
 *      includes the LOYALTY feature, and
 *   2. the owner has enabled it (`isLoyaltyEnabled`).
 *
 * A downgrade (Stripe cancel → tier FREE) never flips `isLoyaltyEnabled`, so
 * the flag alone is not sufficient — earning/redeeming must also check tier.
 * Balances are preserved (frozen): on re-upgrade, loyalty resumes with the
 * owner's existing configuration untouched.
 */
export function isLoyaltyAvailable(
  restaurant:
    | { tier?: string | null; forceTier?: string | null; isLoyaltyEnabled?: boolean | null }
    | null
    | undefined,
  featureService: FeatureService,
): boolean {
  if (!restaurant) return false;
  const tier = featureService.getEffectiveTier(
    restaurant.tier ?? 'FREE',
    restaurant.forceTier ?? null,
  );
  return (
    featureService.hasFeature(tier, FeatureFlag.LOYALTY) && !!restaurant.isLoyaltyEnabled
  );
}
