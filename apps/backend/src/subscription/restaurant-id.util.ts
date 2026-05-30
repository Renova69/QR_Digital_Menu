/**
 * Extract the target restaurant id from a request, for tier resolution (#2).
 * Restaurant-scoped routes carry the id in different places:
 *   - `:restaurantId` param   (payment, loyalty, dashboard query, …)
 *   - `:id` param             (restaurants controller)
 *   - `?restaurantId=`        (dashboard, subscription status)
 *   - body.restaurantId       (payment force-open / close)
 * Routes with no restaurant in the request (e.g. `:paymentId`, list-own)
 * return null and the caller falls back to its own restaurant.
 */
export function extractRestaurantId(request: any): string | null {
  return (
    request?.params?.restaurantId ??
    request?.params?.id ??
    request?.query?.restaurantId ??
    request?.body?.restaurantId ??
    null
  );
}
