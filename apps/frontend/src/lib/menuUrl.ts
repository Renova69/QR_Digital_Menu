const INVALID_RESTAURANT_IDS = new Set(["undefined", "null"]);

export function normalizeRestaurantId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const restaurantId = value.trim();
  if (
    restaurantId.length === 0 ||
    INVALID_RESTAURANT_IDS.has(restaurantId.toLowerCase())
  ) {
    return null;
  }
  return restaurantId;
}

/**
 * Single source of truth for the "return to public menu" URL. Handles the three
 * order entry points — dine-in table (`?table=`), service point (`?sp=`), or
 * neither — so CheckoutPage and OrderConfirmationPage cannot drift apart (#M13).
 */
export function buildMenuReturnUrl(
  restaurantId?: string | null,
  tableNumber?: string | null,
  servicePointToken?: string | null,
): string {
  const normalizedRestaurantId = normalizeRestaurantId(restaurantId);
  if (!normalizedRestaurantId) return "/";
  const base = `/menu/public/${normalizedRestaurantId}`;
  if (tableNumber) return `${base}?table=${encodeURIComponent(tableNumber)}`;
  if (servicePointToken)
    return `${base}?sp=${encodeURIComponent(servicePointToken)}`;
  return base;
}
