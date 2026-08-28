import { ForbiddenException } from '@nestjs/common';
import { restaurantMemberWhere } from './restaurant-member-scope';

describe('restaurantMemberWhere', () => {
  it('uses actual ownership or current assignment, with no role bypass', () => {
    expect(restaurantMemberWhere('actor-1')).toEqual({
      OR: [
        { ownerId: 'actor-1' },
        { staffMembers: { some: { id: 'actor-1' } } },
      ],
    });
  });

  it.each([undefined, null, '', '   ', 123])(
    'rejects a missing or invalid principal (%p) before Prisma can omit it',
    (userId) => {
      expect(() => restaurantMemberWhere(userId as string)).toThrow(
        ForbiddenException,
      );
    },
  );
});
