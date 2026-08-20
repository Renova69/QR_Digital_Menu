const INVALID_RESTAURANT_IDS = new Set(["undefined", "null"]);
const MENU_PATH_PREFIX = "/m/";

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
 *
 * `slug` is optional and deliberately last: most call sites only ever have a
 * restaurant id in scope (a route param, a stored marker, a session-bill
 * response) and must keep returning the legacy `/menu/public/:id` path
 * exactly as before — this seam must never trigger a fetch just to look one
 * up. Pass it only when a restaurant object carrying `.slug` is already in
 * scope at the call site; every other caller's behavior is unchanged.
 */
export function buildMenuReturnUrl(
  restaurantId?: string | null,
  tableNumber?: string | null,
  servicePointToken?: string | null,
  slug?: string | null,
): string {
  const normalizedRestaurantId = normalizeRestaurantId(restaurantId);
  if (!normalizedRestaurantId) return "/";
  return getMenuPath(
    { id: normalizedRestaurantId, slug: slug ?? null },
    {
      table: tableNumber ?? undefined,
      servicePointToken: servicePointToken ?? undefined,
    },
  );
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
    base = `${MENU_PATH_PREFIX}${restaurant.slug}`;
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

/**
 * Origin + the branded-URL path prefix, without a slug segment — for UI that
 * needs to display "https://host/m/" as static label text next to an
 * editable slug input (e.g. the settings rename dialog). Owns the "/m/"
 * literal the same way getMenuPath does, so a caller with no slug to hand in
 * yet doesn't have to hand-roll it. Do not inline `${origin}/m/` at a call
 * site — this codebase has already had to undo that mistake twice.
 */
export function getMenuUrlPrefix(
  origin: string = typeof window === "undefined" ? "" : window.location.origin,
): string {
  return `${origin}${MENU_PATH_PREFIX}`;
}
