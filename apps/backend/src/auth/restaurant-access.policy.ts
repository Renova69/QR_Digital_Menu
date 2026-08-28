/** Named policies preserve the existing route contracts, not a universal role grant.
 * Add a policy only with its role/status matrix and an HTTP regression test. */
export type RestaurantAccessPolicy =
  | 'dashboard'
  | 'print-management'
  | 'staff-management'
  | 'scan-stats';

export interface RestaurantAccessRequirement {
  readonly policy: RestaurantAccessPolicy;
  readonly source: 'params' | 'query';
  readonly key: string;
}

export const RESTAURANT_ACCESS_KEY = 'requireRestaurantAccess';

export interface RestaurantAccessContext {
  readonly restaurantId: string;
  readonly userId: string;
  /** The effective role from JwtStrategy, including tier-driven demotion. */
  readonly role: string;
  readonly tier: string;
  readonly forceTier: string | null;
}

// A request body/header cannot manufacture this context. No cross-request cache.
const accessContexts = new WeakMap<object, RestaurantAccessContext>();

export function getRestaurantAccess(
  request: object,
): RestaurantAccessContext | undefined {
  return accessContexts.get(request);
}

export function setRestaurantAccess(
  request: object,
  access: RestaurantAccessContext | undefined,
): void {
  if (access) accessContexts.set(request, Object.freeze(access));
  else accessContexts.delete(request);
}
