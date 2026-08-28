import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Query predicate for the existing service-member contract: actual owner OR
 * any account assigned to the restaurant. Not an owner/manager policy and
 * not a SUPER_ADMIN bypass. Keep stricter role/status checks at their callers.
 */
export function restaurantMemberWhere(
  userId: string,
): Pick<Prisma.RestaurantWhereInput, 'OR'> {
  // Prisma omits undefined filters; never turn a missing principal into
  // an unscoped owner/staff relation.
  if (typeof userId !== 'string' || !userId.trim()) {
    throw new ForbiddenException('Forbidden access');
  }
  return {
    OR: [{ ownerId: userId }, { staffMembers: { some: { id: userId } } }],
  };
}
