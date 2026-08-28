import { ForbiddenException } from '@nestjs/common';
import {
  restaurantManagementWhere,
  restaurantOwnerWhere,
} from './restaurant-management-scope';

describe('restaurant management query scope', () => {
  it('allows actual ownership or an assigned MANAGER, not arbitrary staff/admins', () => {
    expect(restaurantManagementWhere('actor-1')).toEqual({
      OR: [
        { ownerId: 'actor-1' },
        { staffMembers: { some: { id: 'actor-1', role: 'MANAGER' } } },
      ],
    });
    expect(restaurantOwnerWhere('actor-1')).toEqual({ ownerId: 'actor-1' });
  });

  it.each([undefined, null, '', '  ', 123])(
    'fails closed for an invalid actor (%p)',
    (actor) => {
      expect(() => restaurantOwnerWhere(actor as string)).toThrow(
        ForbiddenException,
      );
      expect(() => restaurantManagementWhere(actor as string)).toThrow(
        ForbiddenException,
      );
    },
  );
});
