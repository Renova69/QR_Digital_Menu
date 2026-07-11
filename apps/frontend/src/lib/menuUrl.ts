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
  if (!restaurantId) return "/";
  const base = `/menu/public/${restaurantId}`;
  if (tableNumber) return `${base}?table=${encodeURIComponent(tableNumber)}`;
  if (servicePointToken)
    return `${base}?sp=${encodeURIComponent(servicePointToken)}`;
  return base;
}
