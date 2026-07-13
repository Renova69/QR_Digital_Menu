export const REWARD_POINTS_MODES = ['OFF', 'AUTO', 'CUSTOM'] as const;

export type RewardPointsModeValue = (typeof REWARD_POINTS_MODES)[number];

type RewardPricedItem = {
  price?: number | null;
  rewardPointsMode?: RewardPointsModeValue | null;
  rewardPointsPrice?: number | null;
};

export function getEffectiveRewardPointsPrice(
  item: RewardPricedItem,
  redeemRate: number,
): number | null {
  const mode =
    item.rewardPointsMode ??
    (isPositiveInteger(item.rewardPointsPrice) ? 'CUSTOM' : 'OFF');

  if (mode === 'OFF') return null;
  if (mode === 'CUSTOM') {
    return isPositiveInteger(item.rewardPointsPrice)
      ? item.rewardPointsPrice
      : null;
  }
  if (
    typeof item.price !== 'number' ||
    !Number.isFinite(item.price) ||
    item.price <= 0 ||
    !isPositiveInteger(redeemRate)
  ) {
    return null;
  }

  const priceCents = Math.round(item.price * 100);
  return Math.max(1, Math.ceil((priceCents * redeemRate) / 100));
}

export function withEffectiveRewardPointsPrice<T extends RewardPricedItem>(
  item: T,
  redeemRate: number,
): T & { rewardPointsPrice: number | null } {
  return {
    ...item,
    rewardPointsPrice: getEffectiveRewardPointsPrice(item, redeemRate),
  };
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}
