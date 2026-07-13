export function calculateAutomaticRewardPoints(
  price: number | string,
  redeemRate: number,
): number | null {
  const parsedPrice = typeof price === "number" ? price : Number(price);
  if (
    !Number.isFinite(parsedPrice) ||
    parsedPrice <= 0 ||
    !Number.isInteger(redeemRate) ||
    redeemRate <= 0
  ) {
    return null;
  }

  const priceCents = Math.round(parsedPrice * 100);
  return Math.max(1, Math.ceil((priceCents * redeemRate) / 100));
}
