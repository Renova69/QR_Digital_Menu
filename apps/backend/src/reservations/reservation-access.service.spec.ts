import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  resolveReservationActor,
  assertReservationRole,
  requireReservationEntitlement,
} from './reservation-access.service';

describe('resolveReservationActor', () => {
  const mockPrisma = {
    restaurant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  it('returns SUPER_ADMIN for super-admin users', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({
      ownerId: 'o1',
      isActive: true,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      restaurantId: 'r1',
      role: 'SUPER_ADMIN',
    });

    const role = await resolveReservationActor(
      mockPrisma as any,
      'r1',
      'admin-1',
    );
    expect(role).toBe('SUPER_ADMIN');
  });

  it('returns OWNER when user is restaurant owner', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({
      ownerId: 'u1',
      isActive: true,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      restaurantId: 'r1',
      role: 'OWNER',
    });

    const role = await resolveReservationActor(mockPrisma as any, 'r1', 'u1');
    expect(role).toBe('OWNER');
  });

  it('returns MANAGER for manager assigned to restaurant', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({
      ownerId: 'o1',
      isActive: true,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      restaurantId: 'r1',
      role: 'MANAGER',
    });

    const role = await resolveReservationActor(
      mockPrisma as any,
      'r1',
      'mgr-1',
    );
    expect(role).toBe('MANAGER');
  });

  it('throws NotFoundException for missing restaurant', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(null);

    await expect(
      resolveReservationActor(mockPrisma as any, 'r99', 'u1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException for inactive restaurant', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({
      ownerId: 'o1',
      isActive: false,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      restaurantId: 'r1',
      role: 'OWNER',
    });

    await expect(
      resolveReservationActor(mockPrisma as any, 'r1', 'u1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException for unauthorized user', async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({
      ownerId: 'o1',
      isActive: true,
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      restaurantId: 'r2',
      role: 'WAITER',
    });

    await expect(
      resolveReservationActor(mockPrisma as any, 'r1', 'waiter-1'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('assertReservationRole', () => {
  it('always allows OWNER', () => {
    expect(() => assertReservationRole('OWNER', [])).not.toThrow();
  });

  it('always allows SUPER_ADMIN', () => {
    expect(() => assertReservationRole('SUPER_ADMIN', [])).not.toThrow();
  });

  it('allows MANAGER when in allowed list', () => {
    expect(() => assertReservationRole('MANAGER', ['MANAGER'])).not.toThrow();
  });

  it('throws ForbiddenException when role not allowed', () => {
    expect(() => assertReservationRole('WAITER', ['MANAGER'])).toThrow(
      ForbiddenException,
    );
  });
});

describe('requireReservationEntitlement', () => {
  it('throws NotFoundException when restaurant missing', async () => {
    const prisma = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const features = { restaurantHasFeature: jest.fn() };

    await expect(
      requireReservationEntitlement(prisma as any, features as any, 'r1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws ForbiddenException when restaurant inactive', async () => {
    const prisma = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ isActive: false }),
      },
    };
    const features = { restaurantHasFeature: jest.fn() };

    await expect(
      requireReservationEntitlement(prisma as any, features as any, 'r1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws FEATURE_LOCKED when tier lacks RESERVATIONS', async () => {
    const prisma = {
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
      },
    };
    const features = { restaurantHasFeature: jest.fn().mockReturnValue(false) };

    await expect(
      requireReservationEntitlement(prisma as any, features as any, 'r1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns restaurant when entitled', async () => {
    const restaurant = { isActive: true, tier: 'PROFESSIONAL' };
    const prisma = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(restaurant) },
    };
    const features = { restaurantHasFeature: jest.fn().mockReturnValue(true) };

    const result = await requireReservationEntitlement(
      prisma as any,
      features as any,
      'r1',
    );
    expect(result).toEqual(restaurant);
  });
});
