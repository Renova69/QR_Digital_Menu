import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function restaurantOwnerWhere(
  userId: string,
): Pick<Prisma.RestaurantWhereInput, 'ownerId'> {
  // Prisma omits undefined filters. A missing principal must never un-scope
  // the ownership condition, even for an internal caller.
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new ForbiddenException('Forbidden access');
  }
  return { ownerId: userId };
}

/** Existing management contract, not the broader any-assigned-account rule.
 * Effective-role checks still belong to the HTTP guard; there is no admin bypass.
 * Callers add their own status policy (zones and settings differ from menu).
 */
export function restaurantManagementWhere(
  userId: string,
): Pick<Prisma.RestaurantWhereInput, 'OR'> {
  return {
    OR: [
      restaurantOwnerWhere(userId),
      { staffMembers: { some: { id: userId, role: 'MANAGER' } } },
    ],
  };
}
