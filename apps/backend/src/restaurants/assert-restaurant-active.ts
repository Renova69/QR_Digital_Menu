import { ForbiddenException } from '@nestjs/common';

/**
 * Rejects a suspended or soft-deleted restaurant. `RestaurantsService.remove()`
 * (owner-initiated deletion) and the super-admin suspend/delete actions both
 * set `isActive: false`, but `deletedAt` is also treated as authoritative so
 * inconsistent or manually repaired rows still fail closed.
 *
 * Public-menu read paths already reject inactive restaurants; this closes
 * the same gap on the owner/manager/staff MANAGEMENT side — ownership checks
 * verified who is asking, but not whether the restaurant they're asking
 * about is still active, so a soft-deleted restaurant's menu/tables/payments
 * remained fully mutable by its former owner or staff.
 */
export function assertRestaurantActive(
  restaurant:
    | { isActive?: boolean | null; deletedAt?: Date | string | null }
    | null
    | undefined,
): void {
  if (
    restaurant &&
    (restaurant.isActive === false || restaurant.deletedAt != null)
  ) {
    throw new ForbiddenException({
      code: 'RESTAURANT_SUSPENDED',
      message: 'This restaurant has been suspended',
    });
  }
}
