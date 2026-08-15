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

export interface MenuUrlRestaurant {
  id: string;
  slug?: string | null;
}

export interface MenuUrlTarget {
  table?: string | null;
  servicePointToken?: string | null;
}

/**
 * Single seam for every customer-facing menu URL. No component should build
 * one by hand — keeping construction in one place is what makes a future
 * change to the URL shape a one-line edit instead of a grep hunt.
 *
 * Restaurant.slug is nullable until a later migration, so the legacy id path
 * remains a first-class fallback rather than an error case.
 *
 * `restaurant` itself may be null/undefined: several call sites (e.g.
 * TableView.tsx) pass a context-derived restaurant straight through while it
 * may still be resolving, and that file's own convention (#M14) is to guard
 * every deref of it. Rather than trust every current and future caller to
 * remember a `?.` before calling into this seam, the seam absorbs a missing
 * restaurant itself and degrades to "/" — the same fallback already used for
 * an unusable id. Do not re-narrow this parameter back to non-nullable; that
 * reintroduces the crash this guard exists to prevent.
 */
export function getMenuPath(
  restaurant: MenuUrlRestaurant | null | undefined,
  target: MenuUrlTarget = {},
): string {
  if (!restaurant) return "/";

  let base: string;
  if (restaurant.slug) {
    base = `/m/${restaurant.slug}`;
  } else {
    const id = normalizeRestaurantId(restaurant.id);
    if (!id) return "/";
    base = `/menu/public/${id}`;
  }

  if (target.table) return `${base}?table=${encodeURIComponent(target.table)}`;
  if (target.servicePointToken)
    return `${base}?sp=${encodeURIComponent(target.servicePointToken)}`;
  return base;
}

export function getMenuUrl(
  restaurant: MenuUrlRestaurant | null | undefined,
  target: MenuUrlTarget = {},
  origin: string = typeof window === "undefined" ? "" : window.location.origin,
): string {
  return `${origin}${getMenuPath(restaurant, target)}`;
}
