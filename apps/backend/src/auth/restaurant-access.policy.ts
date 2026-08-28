/** Named policies preserve the existing route contracts, not a universal role grant.
 * Add a policy only with its role/status matrix and an HTTP regression test. */
export type RestaurantAccessPolicy =
  | 'dashboard'
  | 'print-management'
  | 'staff-management'
  | 'scan-stats'
  | 'menu-management';

export type RestaurantAccessResource =
  | 'restaurant'
  | 'category'
  | 'item'
  | 'option';

export interface RestaurantAccessRequirement {
  readonly policy: RestaurantAccessPolicy;
  readonly source: 'params' | 'query';
  readonly key: string;
  /** Menu policies must explicitly identify the path resource. Other policies
   * retain direct restaurant ids; no caller-supplied tenant override is used. */
  readonly resource?: RestaurantAccessResource;
}

export function isRestaurantAccessRequirement(
  value: unknown,
): value is RestaurantAccessRequirement {
  if (!value || typeof value !== 'object') return false;
  const requirement = value as Partial<RestaurantAccessRequirement>;
  if (
    ![
      'dashboard',
      'print-management',
      'staff-management',
      'scan-stats',
      'menu-management',
    ].includes(requirement.policy ?? '') ||
    !['params', 'query'].includes(requirement.source ?? '') ||
    typeof requirement.key !== 'string' ||
    !requirement.key.length ||
    requirement.key.trim() !== requirement.key
  )
    return false;
  if (requirement.policy === 'menu-management') {
    return (
      requirement.source === 'params' &&
      ['restaurant', 'category', 'item', 'option'].includes(
        requirement.resource ?? '',
      )
    );
  }
  return (
    requirement.resource === undefined || requirement.resource === 'restaurant'
  );
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
