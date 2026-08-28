/** Named policies preserve the existing route contracts, not a universal role grant.
 * Add a policy only with its role/status matrix and an HTTP regression test. */
export type RestaurantAccessPolicy =
  | 'dashboard'
  | 'print-management'
  | 'staff-management'
  | 'scan-stats'
  | 'menu-management'
  | 'restaurant-read'
  | 'restaurant-management'
  | 'restaurant-owner'
  | 'device-management'
  | 'menu-import'
  | 'menu-audit'
  | 'table-read'
  | 'table-management'
  | 'zone-read'
  | 'zone-management'
  | 'reservation-read'
  | 'reservation-management'
  | 'reservation-operations'
  | 'reservation-action';

export type RestaurantAccessResource =
  | 'restaurant'
  | 'category'
  | 'item'
  | 'option'
  | 'table'
  | 'zone';

export interface RestaurantAccessRequirement {
  readonly policy: RestaurantAccessPolicy;
  readonly source: 'params' | 'query' | 'body';
  readonly key: string;
  /** Child-resource policies explicitly identify the path resource. Direct
   * targets are authorized from exactly the declared source, never a fallback. */
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
      'restaurant-read',
      'restaurant-management',
      'restaurant-owner',
      'device-management',
      'menu-import',
      'menu-audit',
      'table-read',
      'table-management',
      'zone-read',
      'zone-management',
      'reservation-read',
      'reservation-management',
      'reservation-operations',
      'reservation-action',
    ].includes(requirement.policy ?? '') ||
    !['params', 'query', 'body'].includes(requirement.source ?? '') ||
    typeof requirement.key !== 'string' ||
    !requirement.key.length ||
    requirement.key.trim() !== requirement.key
  )
    return false;
  // Only these two existing reservation contracts select a tenant in the body.
  // Their services still bind the reservation id to that authorized restaurant.
  if (requirement.source === 'body') {
    return (
      ['reservation-action', 'reservation-operations'].includes(
        requirement.policy ?? '',
      ) &&
      requirement.key === 'restaurantId' &&
      (requirement.resource === undefined ||
        requirement.resource === 'restaurant')
    );
  }
  if (requirement.policy === 'reservation-action') return false;
  if (
    requirement.policy === 'table-management' ||
    requirement.policy === 'zone-management'
  ) {
    return (
      requirement.source === 'params' &&
      [
        'restaurant',
        requirement.policy === 'table-management' ? 'table' : 'zone',
      ].includes(requirement.resource ?? '')
    );
  }
  if (requirement.policy === 'menu-management') {
    return (
      requirement.source === 'params' &&
      ['restaurant', 'category', 'item', 'option'].includes(
        requirement.resource ?? '',
      )
    );
  }
  // These management routes select a restaurant explicitly from the path;
  // none has the printer policy's optional query/default-owner semantics.
  if (
    [
      'restaurant-read',
      'restaurant-management',
      'restaurant-owner',
      'device-management',
      'menu-import',
      'menu-audit',
      'zone-read',
      'reservation-read',
      'reservation-management',
      'reservation-operations',
    ].includes(requirement.policy ?? '') &&
    requirement.source !== 'params'
  )
    return false;
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
