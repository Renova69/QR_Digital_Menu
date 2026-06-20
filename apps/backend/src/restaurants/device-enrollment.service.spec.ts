import {
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DeviceEnrollmentService } from './device-enrollment.service';

describe('DeviceEnrollmentService', () => {
  let service: DeviceEnrollmentService;
  let mockPrisma: any;
  let mockTokenStore: any;
  let mockEvents: any;

  beforeEach(() => {
    mockTokenStore = {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      // L2.3 — token cap: default to 0 active tokens so creates succeed
      count: jest.fn().mockResolvedValue(0),
    };
    mockPrisma = {
      restaurant: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      deviceEnrollmentToken: mockTokenStore,
    };
    mockEvents = {
      evictDeviceToken: jest.fn().mockResolvedValue(undefined),
    };
    service = new DeviceEnrollmentService(mockPrisma, mockEvents);
  });

  // ─── createEnrollment ────────────────────────────────────────────────────────

  describe('createEnrollment', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
      });
      await expect(
        service.createEnrollment('rest1', 'user1', 'http://localhost:3001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is WAITER (not owner or manager)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        name: 'Test',
        ownerId: 'owner1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'WAITER',
        restaurantId: 'rest1',
      });
      await expect(
        service.createEnrollment('rest1', 'waiter1', 'http://localhost:3001'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when MANAGER is assigned to a different restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        name: 'Test',
        ownerId: 'owner1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'MANAGER',
        restaurantId: 'other-rest',
      });
      await expect(
        service.createEnrollment('rest1', 'mgr1', 'http://localhost:3001'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates token and returns enrollment URL for owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        name: 'Test',
        ownerId: 'user1',
        sharedDeviceModeEnabled: true,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
      });

      const result = await service.createEnrollment(
        'rest1',
        'user1',
        'http://localhost:3001',
      );

      expect(result.enrollmentUrl).toMatch(
        /^http:\/\/localhost:3001\/device-enroll\?token=/,
      );
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockTokenStore.create).toHaveBeenCalled();
    });

    it('throws ForbiddenException when Shared Device Mode is off', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        name: 'Test',
        ownerId: 'user1',
        sharedDeviceModeEnabled: false,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
      });

      await expect(
        service.createEnrollment('rest1', 'user1', 'http://localhost:3001'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockTokenStore.create).not.toHaveBeenCalled();
    });

    it('creates token for an assigned MANAGER', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        name: 'Test',
        ownerId: 'owner1',
        sharedDeviceModeEnabled: true,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'MANAGER',
        restaurantId: 'rest1',
      });

      const result = await service.createEnrollment(
        'rest1',
        'mgr1',
        'http://localhost:3001',
      );

      expect(result.enrollmentUrl).toMatch(/\/device-enroll\?token=/);
    });

    it('strips trailing slash from frontendBaseUrl', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        name: 'Test',
        ownerId: 'user1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
      });

      const result = await service.createEnrollment(
        'rest1',
        'user1',
        'http://localhost:3001/',
      );

      expect(result.enrollmentUrl).toMatch(
        /^http:\/\/localhost:3001\/device-enroll\?token=/,
      );
      // path segment must not contain double slash
      const pathname = new URL(result.enrollmentUrl).pathname;
      expect(pathname).not.toContain('//');
    });
  });

  // ─── verifyEnrollment ────────────────────────────────────────────────────────

  describe('verifyEnrollment', () => {
    it('throws UnauthorizedException when token not found', async () => {
      mockTokenStore.updateMany.mockResolvedValue({ count: 0 });
      mockTokenStore.findUnique.mockResolvedValue(null);
      await expect(service.verifyEnrollment('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws GoneException when token already used', async () => {
      mockTokenStore.updateMany.mockResolvedValue({ count: 0 });
      mockTokenStore.findUnique.mockResolvedValue({
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(service.verifyEnrollment('some-token')).rejects.toThrow(
        GoneException,
      );
    });

    it('throws GoneException when token is expired', async () => {
      mockTokenStore.updateMany.mockResolvedValue({ count: 0 });
      mockTokenStore.findUnique.mockResolvedValue({
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.verifyEnrollment('some-token')).rejects.toThrow(
        GoneException,
      );
    });

    it('claims the token atomically and returns restaurant info on valid token', async () => {
      mockTokenStore.updateMany.mockResolvedValue({ count: 1 });
      mockTokenStore.findUnique.mockResolvedValue({
        id: 'tok1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        restaurant: {
          id: 'rest1',
          name: 'Test Restaurant',
          sharedDeviceModeEnabled: true,
        },
      });

      const result = await service.verifyEnrollment('valid-token');

      expect(result.restaurantId).toBe('rest1');
      expect(result.restaurantName).toBe('Test Restaurant');
      expect(result.allowedModes).toEqual(['POS', 'KDS']);
      // The claim must be a guarded updateMany (usedAt: null) — not a blind update.
      expect(mockTokenStore.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ usedAt: null }),
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
    });

    it('does not consume the link a second time under concurrent use', async () => {
      // Second concurrent request: the guarded claim matches 0 rows.
      mockTokenStore.updateMany.mockResolvedValue({ count: 0 });
      mockTokenStore.findUnique.mockResolvedValue({
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      await expect(service.verifyEnrollment('valid-token')).rejects.toThrow(
        GoneException,
      );
    });

    it('throws ForbiddenException without consuming token when Shared Device Mode is off', async () => {
      mockTokenStore.findUnique.mockResolvedValue({
        id: 'tok1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        restaurant: {
          id: 'rest1',
          name: 'Test Restaurant',
          sharedDeviceModeEnabled: false,
        },
      });

      await expect(service.verifyEnrollment('valid-token')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockTokenStore.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('listEnrollments', () => {
    it('includes recent staff users who authenticated on each device', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        name: 'Test',
        ownerId: 'user1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
      });
      mockTokenStore.findMany.mockResolvedValue([]);

      await service.listEnrollments('rest1', 'user1');

      expect(mockTokenStore.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            createdBy: {
              select: { id: true, name: true, email: true },
            },
            staffBindings: {
              orderBy: { lastSeenAt: 'desc' },
              take: 5,
              select: {
                firstSeenAt: true,
                lastSeenAt: true,
                user: {
                  select: { id: true, name: true, email: true, role: true },
                },
              },
            },
          }),
        }),
      );
    });
  });

  describe('revokeEnrollment', () => {
    it('revokes the token and evicts sockets authenticated by that device', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest1',
        name: 'Test',
        ownerId: 'user1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'OWNER',
        restaurantId: null,
      });
      mockTokenStore.findFirst.mockResolvedValue({
        id: 'tok1',
        revokedAt: null,
      });

      const result = await service.revokeEnrollment('tok1', 'rest1', 'user1');
      const updateArgs = mockTokenStore.update.mock.calls[0][0];

      expect(updateArgs).toEqual({
        where: { id: 'tok1' },
        data: { revokedAt: expect.any(Date), sessionVersion: { increment: 1 } },
      });
      expect(mockEvents.evictDeviceToken).toHaveBeenCalledWith(
        'tok1',
        'device_revoked',
      );
      expect(result).toEqual({
        success: true,
        revokedAt: updateArgs.data.revokedAt,
      });
    });
  });

  describe('revokeRestaurantDevices', () => {
    it('revokes all restaurant device tokens and evicts their sockets', async () => {
      mockTokenStore.findMany.mockResolvedValue([{ id: 'tok1' }, { id: 'tok2' }]);

      const result = await service.revokeRestaurantDevices(
        'rest1',
        'shared_device_mode_disabled',
      );

      expect(mockTokenStore.updateMany).toHaveBeenCalledWith({
        where: { restaurantId: 'rest1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockEvents.evictDeviceToken).toHaveBeenCalledWith(
        'tok1',
        'shared_device_mode_disabled',
      );
      expect(mockEvents.evictDeviceToken).toHaveBeenCalledWith(
        'tok2',
        'shared_device_mode_disabled',
      );
      expect(result).toEqual({
        success: true,
        revokedAt: expect.any(Date),
        count: 2,
      });
    });
  });

  describe('evictRestaurantDevices', () => {
    it('expires active sessions and evicts used non-revoked device tokens without revoking them', async () => {
      mockTokenStore.findMany.mockResolvedValue([{ id: 'tok1' }, { id: 'tok2' }]);

      const result = await service.evictRestaurantDevices(
        'rest1',
        'shared_device_mode_disabled',
      );

      expect(mockTokenStore.findMany).toHaveBeenCalledWith({
        where: {
          restaurantId: 'rest1',
          revokedAt: null,
          usedAt: { not: null },
        },
        select: { id: true },
      });
      expect(mockTokenStore.updateMany).toHaveBeenCalledWith({
        where: {
          restaurantId: 'rest1',
          revokedAt: null,
          usedAt: { not: null },
        },
        data: { sessionVersion: { increment: 1 } },
      });
      expect(mockEvents.evictDeviceToken).toHaveBeenCalledWith(
        'tok1',
        'shared_device_mode_disabled',
      );
      expect(mockEvents.evictDeviceToken).toHaveBeenCalledWith(
        'tok2',
        'shared_device_mode_disabled',
      );
      expect(result).toEqual({ success: true, count: 2 });
    });
  });

  describe('getDeviceStatus', () => {
    it('returns shared-device status for an enrolled device without consuming it', async () => {
      mockTokenStore.findUnique.mockResolvedValue({
        id: 'tok1',
        usedAt: new Date(),
        revokedAt: null,
        restaurant: {
          id: 'rest1',
          name: 'Test Restaurant',
          sharedDeviceModeEnabled: false,
        },
      });

      const result = await service.getDeviceStatus('device-token');

      expect(mockTokenStore.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({
        restaurantId: 'rest1',
        restaurantName: 'Test Restaurant',
        sharedDeviceModeEnabled: false,
        enrolled: true,
        revoked: false,
      });
    });

    it('rejects revoked device tokens', async () => {
      mockTokenStore.findUnique.mockResolvedValue({
        id: 'tok1',
        usedAt: new Date(),
        revokedAt: new Date(),
        restaurant: {
          id: 'rest1',
          name: 'Test Restaurant',
          sharedDeviceModeEnabled: true,
        },
      });

      await expect(service.getDeviceStatus('device-token')).rejects.toThrow(
        GoneException,
      );
    });
  });
});
