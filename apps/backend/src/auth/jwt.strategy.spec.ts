import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

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
