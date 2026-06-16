import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OptionalJwtStrategy } from './optional-jwt.strategy';

describe('OptionalJwtStrategy', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };

  let strategy: OptionalJwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new OptionalJwtStrategy(
      { get: jest.fn().mockReturnValue('test-secret') } as unknown as ConfigService,
      prisma as any,
    );
  });

  it('rejects a present token whose user has been disabled (#1)', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'waiter-1',
      email: 'waiter@test.com',
      isActive: false,
      disabledAt: new Date(),
      passwordChangedAt: null,
    });

    await expect(
      strategy.validate({ sub: 'waiter-1', email: 'waiter@test.com' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token for a user that no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      strategy.validate({ sub: 'gone', email: 'gone@test.com' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token issued before the last password change', async () => {
    const passwordChangedAt = new Date('2026-05-31T12:00:00Z');
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'staff-1',
      email: 'staff@test.com',
      isActive: true,
      disabledAt: null,
      passwordChangedAt,
    });

    const staleIat = Math.floor(passwordChangedAt.getTime() / 1000) - 60;

    await expect(
      strategy.validate({ sub: 'staff-1', email: 'staff@test.com', iat: staleIat }),
    ).rejects.toThrow('PASSWORD_CHANGED');
  });

  it('returns the identity for an active user', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'waiter-2',
      email: 'waiter2@test.com',
      isActive: true,
      disabledAt: null,
      passwordChangedAt: null,
    });

    const result = await strategy.validate({
      sub: 'waiter-2',
      email: 'waiter2@test.com',
    });

    expect(result).toEqual({ id: 'waiter-2', email: 'waiter2@test.com' });
  });
});
