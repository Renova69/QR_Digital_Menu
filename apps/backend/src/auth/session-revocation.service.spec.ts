import { UnauthorizedException } from '@nestjs/common';
import { SessionRevocationService } from './session-revocation.service';
import { PrismaService } from '../prisma/prisma.service';

describe('SessionRevocationService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    deviceEnrollmentToken: { findUnique: jest.fn() },
    impersonationSession: { findUnique: jest.fn() },
  };

  let service: SessionRevocationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SessionRevocationService(prisma as unknown as PrismaService);
  });

  const activeUser = (overrides: Record<string, unknown> = {}) => ({
    id: 'user-1',
    role: 'WAITER',
    isActive: true,
    disabledAt: null,
    passwordChangedAt: null,
    restaurantId: 'rest-1',
    staffRestaurant: null,
    ...overrides,
  });

  it('returns the user when the session is usable and no signals fire', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(activeUser());

    const result = await service.assertSessionUsable({ sub: 'user-1' });

    expect(result).toEqual(activeUser());
    expect(prisma.deviceEnrollmentToken.findUnique).not.toHaveBeenCalled();
  });

  it('queries the user with staffRestaurant included', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(activeUser());

    await service.assertSessionUsable({ sub: 'user-1' });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      include: {
        staffRestaurant: {
          select: { isActive: true, tier: true, forceTier: true },
        },
      },
    });
  });

  it('rejects a session whose user no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.assertSessionUsable({ sub: 'gone' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an account disabled via isActive=false', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(
      activeUser({ isActive: false }),
    );

    await expect(
      service.assertSessionUsable({ sub: 'user-1' }),
    ).rejects.toThrow('ACCOUNT_DISABLED');
  });

  it('rejects an account disabled via disabledAt', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(
      activeUser({ disabledAt: new Date() }),
    );

    await expect(
      service.assertSessionUsable({ sub: 'user-1' }),
    ).rejects.toThrow('ACCOUNT_DISABLED');
  });

  describe('device-bound sessions', () => {
    const deviceToken = (overrides: Record<string, unknown> = {}) => ({
      id: 'token-1',
      restaurantId: 'rest-1',
      usedAt: new Date(),
      revokedAt: null,
      sessionVersion: 2,
      restaurant: { isActive: true, sharedDeviceModeEnabled: true },
      ...overrides,
    });

    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(activeUser({ role: 'KITCHEN' }));
    });

    it('accepts a device session with matching version and pin role', async () => {
      prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce(
        deviceToken(),
      );

      const result = await service.assertSessionUsable({
        sub: 'user-1',
        deviceTokenId: 'token-1',
        deviceSessionVersion: 2,
      });

      expect(result.id).toBe('user-1');
    });

    it('rejects a missing device token', async () => {
      prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          deviceTokenId: 'token-1',
        }),
      ).rejects.toThrow('DEVICE_REVOKED');
    });

    it('rejects a never-used device token', async () => {
      prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce(
        deviceToken({ usedAt: null }),
      );

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          deviceTokenId: 'token-1',
        }),
      ).rejects.toThrow('DEVICE_REVOKED');
    });

    it('rejects a revoked device token', async () => {
      prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce(
        deviceToken({ revokedAt: new Date() }),
      );

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          deviceTokenId: 'token-1',
        }),
      ).rejects.toThrow('DEVICE_REVOKED');
    });

    it('rejects a token bound to a different restaurant', async () => {
      prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce(
        deviceToken({ restaurantId: 'other-rest' }),
      );

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          deviceTokenId: 'token-1',
        }),
      ).rejects.toThrow('DEVICE_REVOKED');
    });

    it('rejects a token whose session version changed', async () => {
      prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce(
        deviceToken({ sessionVersion: 2 }),
      );

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          deviceTokenId: 'token-1',
          deviceSessionVersion: 1,
        }),
      ).rejects.toThrow('DEVICE_SESSION_EXPIRED');
    });

    it('rejects a session for a suspended restaurant', async () => {
      prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce(
        deviceToken({
          restaurant: { isActive: false, sharedDeviceModeEnabled: true },
        }),
      );

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          deviceTokenId: 'token-1',
          deviceSessionVersion: 2,
        }),
      ).rejects.toThrow('ACCOUNT_SUSPENDED');
    });

    it('rejects a session when shared-device mode was disabled', async () => {
      prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce(
        deviceToken({
          restaurant: { isActive: true, sharedDeviceModeEnabled: false },
        }),
      );

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          deviceTokenId: 'token-1',
          deviceSessionVersion: 2,
        }),
      ).rejects.toThrow('SHARED_DEVICE_MODE_DISABLED');
    });

    it('rejects a device-bound session for a non-pin role', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser({ role: 'STAFF' }));
      prisma.deviceEnrollmentToken.findUnique.mockResolvedValueOnce(
        deviceToken(),
      );

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          deviceTokenId: 'token-1',
        }),
      ).rejects.toThrow('DEVICE_SESSION_EXPIRED');
    });
  });

  it('rejects a token issued before the last password change', async () => {
    const passwordChangedAt = new Date('2026-06-01T12:00:00Z');
    prisma.user.findUnique.mockResolvedValueOnce(
      activeUser({ passwordChangedAt }),
    );

    const staleIat = Math.floor(passwordChangedAt.getTime() / 1000) - 60;

    await expect(
      service.assertSessionUsable({ sub: 'user-1', iat: staleIat }),
    ).rejects.toThrow('PASSWORD_CHANGED');
  });

  it('accepts a token issued at or after the last password change', async () => {
    const passwordChangedAt = new Date('2026-06-01T12:00:00Z');
    prisma.user.findUnique.mockResolvedValueOnce(
      activeUser({ passwordChangedAt }),
    );

    const freshIat = Math.floor(passwordChangedAt.getTime() / 1000) + 60;

    const result = await service.assertSessionUsable({
      sub: 'user-1',
      iat: freshIat,
    });
    expect(result.id).toBe('user-1');
  });

  describe('impersonation payloads', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(
        activeUser({ role: 'SUPER_ADMIN' }),
      );
    });

    it('accepts a live impersonation session', async () => {
      prisma.impersonationSession.findUnique.mockResolvedValueOnce({
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });

      const result = await service.assertSessionUsable({
        sub: 'user-1',
        isImpersonation: true,
        impersonationSessionId: 'imp-1',
      });
      expect(result.id).toBe('user-1');
    });

    it('rejects a missing impersonation session', async () => {
      prisma.impersonationSession.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          isImpersonation: true,
          impersonationSessionId: 'imp-1',
        }),
      ).rejects.toThrow('IMPERSONATION_REVOKED');
    });

    it('rejects a revoked impersonation session', async () => {
      prisma.impersonationSession.findUnique.mockResolvedValueOnce({
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          isImpersonation: true,
          impersonationSessionId: 'imp-1',
        }),
      ).rejects.toThrow('IMPERSONATION_REVOKED');
    });

    it('rejects an expired impersonation session', async () => {
      prisma.impersonationSession.findUnique.mockResolvedValueOnce({
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(
        service.assertSessionUsable({
          sub: 'user-1',
          isImpersonation: true,
          impersonationSessionId: 'imp-1',
        }),
      ).rejects.toThrow('IMPERSONATION_REVOKED');
    });
  });

  it('rejects a staff user whose restaurant is suspended', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(
      activeUser({
        staffRestaurant: { isActive: false, tier: 'PRO', forceTier: null },
      }),
    );

    await expect(
      service.assertSessionUsable({ sub: 'user-1' }),
    ).rejects.toThrow('ACCOUNT_SUSPENDED');
  });

  it('skips the staff-restaurant suspension check for SUPER_ADMIN', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(
      activeUser({
        role: 'SUPER_ADMIN',
        staffRestaurant: { isActive: false, tier: 'PRO', forceTier: null },
      }),
    );

    const result = await service.assertSessionUsable({ sub: 'user-1' });
    expect(result.id).toBe('user-1');
  });
});
