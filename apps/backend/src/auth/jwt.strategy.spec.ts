import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

import { FeatureService } from '../subscription/feature.service';

describe('JwtStrategy', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(
      prisma as any,
      { get: jest.fn().mockReturnValue('test-secret') } as unknown as ConfigService,
      {
        getEffectiveTier: jest.fn().mockImplementation((tier) => tier),
        getAllowedStaffRoles: jest.fn().mockReturnValue(['STAFF', 'MANAGER', 'WAITER', 'KITCHEN']),
      } as unknown as FeatureService,
    );
  });

  it('rejects disabled users, including SUPER_ADMIN accounts', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'admin@test.com',
      password: 'hash',
      role: 'SUPER_ADMIN',
      isActive: false,
      disabledAt: new Date(),
      staffRestaurant: null,
      restaurants: [],
    });

    await expect(strategy.validate({ sub: 'admin-1', email: 'admin@test.com' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects tokens issued before the last password change', async () => {
    const passwordChangedAt = new Date('2026-05-31T12:00:00Z');
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'owner-1',
      email: 'owner@test.com',
      password: 'hash',
      role: 'OWNER',
      isActive: true,
      disabledAt: null,
      passwordChangedAt,
      staffRestaurant: null,
      restaurants: [{ isActive: true }],
    });

    // iat one minute before the reset → stale token
    const staleIat = Math.floor(passwordChangedAt.getTime() / 1000) - 60;

    await expect(
      strategy.validate({ sub: 'owner-1', email: 'owner@test.com', iat: staleIat }),
    ).rejects.toThrow('PASSWORD_CHANGED');
  });

  it('accepts tokens issued after the last password change', async () => {
    const passwordChangedAt = new Date('2026-05-31T12:00:00Z');
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'owner-1',
      email: 'owner@test.com',
      password: 'hash',
      role: 'OWNER',
      isActive: true,
      disabledAt: null,
      disabledReason: null,
      passwordChangedAt,
      staffRestaurant: null,
      restaurants: [{ isActive: true }],
    });

    const freshIat = Math.floor(passwordChangedAt.getTime() / 1000) + 60;

    const result = await strategy.validate({
      sub: 'owner-1',
      email: 'owner@test.com',
      iat: freshIat,
    });

    expect(result).toMatchObject({ id: 'owner-1', role: 'OWNER' });
  });

  it('returns a DB-loaded user without sensitive fields when active', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'admin@test.com',
      password: 'hash',
      role: 'SUPER_ADMIN',
      isActive: true,
      disabledAt: null,
      disabledReason: null,
      staffRestaurant: null,
      restaurants: [],
    });

    const result = await strategy.validate({ sub: 'admin-1', email: 'admin@test.com' });

    expect(result).toMatchObject({
      id: 'admin-1',
      email: 'admin@test.com',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('staffRestaurant');
    expect(result).not.toHaveProperty('restaurants');
  });
});
