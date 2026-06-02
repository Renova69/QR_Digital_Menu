/**
 * Extract the target restaurant id from a request, for tier resolution (#2).
 * Restaurant-scoped routes carry the id in these places:
 *   - `:restaurantId` param   (payment, loyalty, dashboard query, …)
 *   - `?restaurantId=`        (dashboard, subscription status)
 *   - body.restaurantId       (payment force-open / close)
 *
 * The generic `:id` param is intentionally NOT consulted (H-11): on non-
 * restaurant routes (`:orderId`, session `:token`, etc.) it resolves an
 * unrelated id as a restaurant, breaking tier checks. Routes whose own
 * `:id` IS the restaurant (restaurants controller) must pass it explicitly
 * as `:restaurantId` or rely on the caller's-own-restaurant fallback.
 *
 * Routes with no restaurant in the request return null and the caller falls
 * back to its own restaurant.
 */
export function extractRestaurantId(request: any): string | null {
  return (
    request?.params?.restaurantId ??
    request?.query?.restaurantId ??
    request?.body?.restaurantId ??
    null
  );
}
