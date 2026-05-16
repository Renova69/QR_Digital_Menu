import { ForbiddenException, GoneException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { DeviceEnrollmentService } from './device-enrollment.service';

describe('DeviceEnrollmentService', () => {
  let service: DeviceEnrollmentService;
  let mockPrisma: any;
  let mockTokenStore: any;

  beforeEach(() => {
    mockTokenStore = {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    };
    mockPrisma = {
      restaurant: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      deviceEnrollmentToken: mockTokenStore,
    };
    service = new DeviceEnrollmentService(mockPrisma);
  });

  // ─── createEnrollment ────────────────────────────────────────────────────────

  describe('createEnrollment', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'OWNER', restaurantId: null });
      await expect(
        service.createEnrollment('rest1', 'user1', 'http://localhost:3001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is WAITER (not owner or manager)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ id: 'rest1', name: 'Test', ownerId: 'owner1' });
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'WAITER', restaurantId: 'rest1' });
      await expect(
        service.createEnrollment('rest1', 'waiter1', 'http://localhost:3001'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when MANAGER is assigned to a different restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ id: 'rest1', name: 'Test', ownerId: 'owner1' });
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'MANAGER', restaurantId: 'other-rest' });
      await expect(
        service.createEnrollment('rest1', 'mgr1', 'http://localhost:3001'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates token and returns enrollment URL for owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ id: 'rest1', name: 'Test', ownerId: 'user1' });
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'OWNER', restaurantId: null });

      const result = await service.createEnrollment('rest1', 'user1', 'http://localhost:3001');

      expect(result.enrollmentUrl).toMatch(/^http:\/\/localhost:3001\/device-enroll\?token=/);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(mockTokenStore.create).toHaveBeenCalled();
    });

    it('creates token for an assigned MANAGER', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ id: 'rest1', name: 'Test', ownerId: 'owner1' });
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'MANAGER', restaurantId: 'rest1' });

      const result = await service.createEnrollment('rest1', 'mgr1', 'http://localhost:3001');

      expect(result.enrollmentUrl).toMatch(/\/device-enroll\?token=/);
    });

    it('strips trailing slash from frontendBaseUrl', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ id: 'rest1', name: 'Test', ownerId: 'user1' });
      mockPrisma.user.findUnique.mockResolvedValue({ role: 'OWNER', restaurantId: null });

      const result = await service.createEnrollment('rest1', 'user1', 'http://localhost:3001/');

      expect(result.enrollmentUrl).toMatch(/^http:\/\/localhost:3001\/device-enroll\?token=/);
      // path segment must not contain double slash
      const pathname = new URL(result.enrollmentUrl).pathname;
      expect(pathname).not.toContain('//');
    });
  });

  // ─── verifyEnrollment ────────────────────────────────────────────────────────

  describe('verifyEnrollment', () => {
    it('throws UnauthorizedException when token not found', async () => {
      mockTokenStore.findUnique.mockResolvedValue(null);
      await expect(service.verifyEnrollment('bad-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws GoneException when token already used', async () => {
      mockTokenStore.findUnique.mockResolvedValue({
        id: 'tok1',
        usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        restaurant: { id: 'rest1', name: 'Test' },
      });
      await expect(service.verifyEnrollment('some-token')).rejects.toThrow(GoneException);
    });

    it('throws GoneException when token is expired', async () => {
      mockTokenStore.findUnique.mockResolvedValue({
        id: 'tok1',
        usedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        restaurant: { id: 'rest1', name: 'Test' },
      });
      await expect(service.verifyEnrollment('some-token')).rejects.toThrow(GoneException);
    });

    it('marks token as used and returns restaurant info on valid token', async () => {
      mockTokenStore.findUnique.mockResolvedValue({
        id: 'tok1',
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        restaurant: { id: 'rest1', name: 'Test Restaurant' },
      });

      const result = await service.verifyEnrollment('valid-token');

      expect(result.restaurantId).toBe('rest1');
      expect(result.restaurantName).toBe('Test Restaurant');
      expect(result.allowedModes).toEqual(['POS', 'KDS']);
      expect(mockTokenStore.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
      );
    });
  });
});
