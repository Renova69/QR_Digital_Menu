import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

import { FeatureService } from '../subscription/feature.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionRevocationService } from './session-revocation.service';

describe('JwtStrategy', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
    deviceEnrollmentToken: {
      findUnique: jest.fn(),
    },
    userSession: { findFirst: jest.fn() },
    authSessionRollout: { findUnique: jest.fn() },
  };

  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.authSessionRollout.findUnique.mockResolvedValue({
      legacyAcceptedUntil: new Date(Date.now() + 60_000),
    });
    // A real SessionRevocationService over the same prisma mock: the revocation
    // rules moved out of the strategy, and driving them through the real
    // collaborator keeps this suite testing the behaviour rather than a stub
    // that would happily agree with a broken implementation.
    strategy = new JwtStrategy(
      new SessionRevocationService(prisma as unknown as PrismaService),
      {
        get: jest.fn().mockReturnValue('test-secret'),
      } as unknown as ConfigService,
      {
        getEffectiveTier: jest.fn().mockImplementation((tier) => tier),
        getAllowedStaffRoles: jest
          .fn()
          .mockReturnValue(['STAFF', 'MANAGER', 'WAITER', 'KITCHEN']),
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

    await expect(
      strategy.validate({ sub: 'admin-1', email: 'admin@test.com' }),
    ).rejects.toThrow(UnauthorizedException);
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
      strategy.validate({
        sub: 'owner-1',
        email: 'owner@test.com',
        iat: staleIat,
      }),
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
    // Issue 21: restaurants[] is no longer fetched by the query; mock omits it.
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'admin-1',
      email: 'admin@test.com',
      password: 'hash',
      role: 'SUPER_ADMIN',
      isActive: true,
      disabledAt: null,
      disabledReason: null,
      staffRestaurant: null,
    });

    const result = await strategy.validate({
      sub: 'admin-1',
      email: 'admin@test.com',
    });

    expect(result).toMatchObject({
      id: 'admin-1',
      email: 'admin@test.com',
      role: 'SUPER_ADMIN',
      isActive: true,
    });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('staffRestaurant');
    expect(result).not.toHaveProperty('restaurants');
    expect(result).not.toHaveProperty('lastLoginDeviceTokenId');
  });

  it('accepts active staff device tokens bound to the same active restaurant', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'staff-1',
      email: 'staff@test.com',
      password: 'hash',
      role: 'WAITER',
      restaurantId: 'rest-1',
      isActive: true,
      disabledAt: null,
      disabledReason: null,
      staffRestaurant: {
        isActive: true,
        tier: 'ENTERPRISE',
        forceTier: null,
      },
    });
    prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce({
      restaurantId: 'rest-1',
      usedAt: new Date(),
      revokedAt: null,
      sessionVersion: 2,
      restaurant: {
        isActive: true,
        sharedDeviceModeEnabled: true,
      },
    });

    const result = await strategy.validate({
      sub: 'staff-1',
      email: 'staff@test.com',
      deviceTokenId: 'token-1',
      deviceSessionVersion: 2,
    });

    expect(result).toMatchObject({ id: 'staff-1', role: 'WAITER' });
    expect(prisma.deviceEnrollmentToken.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'token-1' } }),
    );
  });

  it('rejects revoked staff device tokens', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'staff-1',
      email: 'staff@test.com',
      password: 'hash',
      role: 'WAITER',
      restaurantId: 'rest-1',
      isActive: true,
      disabledAt: null,
      staffRestaurant: {
        isActive: true,
        tier: 'ENTERPRISE',
        forceTier: null,
      },
    });
    prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce({
      restaurantId: 'rest-1',
      usedAt: new Date(),
      revokedAt: new Date(),
      sessionVersion: 0,
      restaurant: {
        isActive: true,
        sharedDeviceModeEnabled: true,
      },
    });

    await expect(
      strategy.validate({
        sub: 'staff-1',
        email: 'staff@test.com',
        deviceTokenId: 'token-1',
      }),
    ).rejects.toThrow('DEVICE_REVOKED');
  });

  it('rejects staff device tokens when Shared Device Mode is disabled', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'staff-1',
      email: 'staff@test.com',
      password: 'hash',
      role: 'WAITER',
      restaurantId: 'rest-1',
      isActive: true,
      disabledAt: null,
      staffRestaurant: {
        isActive: true,
        tier: 'ENTERPRISE',
        forceTier: null,
      },
    });
    prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce({
      restaurantId: 'rest-1',
      usedAt: new Date(),
      revokedAt: null,
      sessionVersion: 0,
      restaurant: {
        isActive: true,
        sharedDeviceModeEnabled: false,
      },
    });

    await expect(
      strategy.validate({
        sub: 'staff-1',
        email: 'staff@test.com',
        deviceTokenId: 'token-1',
      }),
    ).rejects.toThrow('SHARED_DEVICE_MODE_DISABLED');
  });

  it('rejects stale staff device sessions after Shared Device Mode was paused', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      id: 'staff-1',
      email: 'staff@test.com',
      password: 'hash',
      role: 'WAITER',
      restaurantId: 'rest-1',
      isActive: true,
      disabledAt: null,
      staffRestaurant: {
        isActive: true,
        tier: 'ENTERPRISE',
        forceTier: null,
      },
    });
    prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce({
      restaurantId: 'rest-1',
      usedAt: new Date(),
      revokedAt: null,
      sessionVersion: 3,
      restaurant: {
        isActive: true,
        sharedDeviceModeEnabled: true,
      },
    });

    await expect(
      strategy.validate({
        sub: 'staff-1',
        email: 'staff@test.com',
        deviceTokenId: 'token-1',
        deviceSessionVersion: 2,
      }),
    ).rejects.toThrow('DEVICE_SESSION_EXPIRED');
  });

  // P0-4: validate()'s return value becomes req.user and is serialised
  // verbatim by GET /auth/me. It must therefore be an explicit allowlist, not
  // a destructure-the-few-bad-fields blocklist — a blocklist silently leaks
  // every column added to User afterwards. pinHash is the acute case: it is
  // bcrypt over a 4-digit PIN (users.service.ts issues crypto.randomInt(0,
  // 10000)), a 10,000-candidate keyspace that is brute-forced offline in
  // seconds, and a recovered PIN mints a WAITER/KITCHEN JWT.
  describe('validate() response shape', () => {
    const fullUserRow = {
      id: 'waiter-1',
      email: 'waiter@test.com',
      phone: '+359888000111',
      name: 'Waiter One',
      role: 'WAITER',
      restaurantId: 'rest-1',
      onboardingComplete: true,
      onboardingStep: null,
      isActive: true,
      // Everything below must never reach the client.
      password: 'bcrypt-password-hash',
      pinHash: 'bcrypt-pin-hash',
      pinAttempts: 2,
      pinLockedUntil: null,
      googleId: 'google-oauth-subject-id',
      disabledAt: null,
      disabledReason: null,
      passwordChangedAt: new Date('2026-01-01T00:00:00Z'),
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      lastLoginDeviceTokenId: null,
      sharedDeviceModeEnabled: false,
      staffRestaurant: {
        isActive: true,
        tier: 'PROFESSIONAL',
        forceTier: null,
      },
    };

    it('never returns pinHash or any other credential material', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...fullUserRow });

      const result: any = await strategy.validate({
        sub: 'waiter-1',
        email: 'waiter@test.com',
      });

      for (const leaked of [
        'pinHash',
        'password',
        'pinAttempts',
        'pinLockedUntil',
        'googleId',
        'passwordChangedAt',
        'disabledReason',
        'lastLoginDeviceTokenId',
        'staffRestaurant',
      ]) {
        expect(result).not.toHaveProperty(leaked);
      }
    });

    it('returns exactly the allowlisted identity fields and nothing else', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...fullUserRow });

      const result: any = await strategy.validate({
        sub: 'waiter-1',
        email: 'waiter@test.com',
      });

      // Pinned deliberately: adding a field here is a conscious decision to
      // expose it to the browser, not an accident of a new schema column.
      expect(Object.keys(result).sort()).toEqual(
        [
          'email',
          'id',
          'isActive',
          'name',
          'onboardingComplete',
          'onboardingStep',
          'phone',
          'restaurantId',
          'role',
        ].sort(),
      );
    });

    it('keeps the fields the app actually consumes off req.user', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ ...fullUserRow });

      const result: any = await strategy.validate({
        sub: 'waiter-1',
        email: 'waiter@test.com',
      });

      // id/role/isActive are read by guards and services; restaurantId scopes
      // tenant queries (orders.service, assistance.service, menu-crud);
      // email/name/phone/onboardingComplete back the frontend User contract.
      expect(result.id).toBe('waiter-1');
      expect(result.role).toBe('WAITER');
      expect(result.isActive).toBe(true);
      expect(result.restaurantId).toBe('rest-1');
      expect(result.email).toBe('waiter@test.com');
      expect(result.phone).toBe('+359888000111');
      expect(result.onboardingComplete).toBe(true);
    });

    it('still surfaces the in-flight role demotion, not the stored role', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        ...fullUserRow,
        role: 'WAITER',
        staffRestaurant: { isActive: true, tier: 'FREE', forceTier: null },
      });
      (strategy as any).featureService.getAllowedStaffRoles.mockReturnValueOnce(
        ['STAFF'],
      );

      const result: any = await strategy.validate({
        sub: 'waiter-1',
        email: 'waiter@test.com',
      });

      expect(result.role).toBe('STAFF');
    });

    it('appends impersonation markers when the token carries them', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        ...fullUserRow,
        role: 'OWNER',
        staffRestaurant: null,
      });
      (prisma as any).impersonationSession = {
        findUnique: jest.fn().mockResolvedValueOnce({
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
      };

      const result: any = await strategy.validate({
        sub: 'waiter-1',
        email: 'waiter@test.com',
        isImpersonation: true,
        impersonationSessionId: 'imp-1',
      });

      expect(result.isImpersonation).toBe(true);
      expect(result.impersonationSessionId).toBe('imp-1');
      expect(result).not.toHaveProperty('pinHash');
    });
  });
});
