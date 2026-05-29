import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;

  const mockUser = {
    id: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    role: 'WAITER',
    restaurantId: 'rest-1',
    pinHash: null,
    phone: null,
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([mockUser]),
        create: jest.fn().mockResolvedValue(mockUser),
        delete: jest.fn().mockResolvedValue(mockUser),
        count: jest.fn().mockResolvedValue(0),
      },
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'FREE' }),
      },
      $transaction: jest.fn().mockImplementation((fn: (tx: any) => Promise<any>) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        FeatureService,
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findByEmail', () => {
    it('normalizes email to lowercase before querying', async () => {
      await service.findByEmail('ALICE@Example.COM');
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'alice@example.com' } }),
      );
    });

    it('returns null when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.findByEmail('ghost@example.com');
      expect(result).toBeNull();
    });
  });

  describe('findByPhone', () => {
    it('queries by phone number', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      const result = await service.findByPhone('+35912345678');
      expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { phone: '+35912345678' } });
      expect(result).toEqual(mockUser);
    });
  });

  describe('create', () => {
    it('normalizes email to lowercase on create', async () => {
      await service.create({ email: 'BOB@Example.COM', name: 'Bob' } as any);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'bob@example.com' }),
        }),
      );
    });

    it('skips normalization when email is absent', async () => {
      await service.create({ name: 'No Email' } as any);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'No Email' }) }),
      );
    });
  });

  describe('createStaffMember', () => {
    it('issues a PIN (no password) for WAITER device role', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // no email collision
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'ENTERPRISE' });
      const result = await service.createStaffMember('rest-1', { name: 'Bob', role: 'WAITER' });
      expect(result.rawPin).toMatch(/^\d{4}$/);
      expect(result.tempPassword).toBeUndefined();
      expect(result.user).toHaveProperty('id');
      // pinHash persisted for device roles
      expect(prisma.user.create.mock.calls[0][0].data.pinHash).toEqual(expect.any(String));
    });

    it('issues a PIN for KITCHEN device role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'ENTERPRISE' });
      const result = await service.createStaffMember('rest-1', { name: 'Kim', role: 'KITCHEN' });
      expect(result.rawPin).toMatch(/^\d{4}$/);
      expect(result.tempPassword).toBeUndefined();
    });

    it('issues a temp password (no PIN) for STAFF dashboard role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'ENTERPRISE' });
      const result = await service.createStaffMember('rest-1', { name: 'Sam', role: 'STAFF' });
      expect(result.tempPassword).toEqual(expect.any(String));
      expect(result.rawPin).toBeUndefined();
      // dashboard roles must NOT carry a pinHash — keeps them out of pinLogin
      expect(prisma.user.create.mock.calls[0][0].data.pinHash).toBeNull();
    });

    it('issues a temp password (no PIN) for MANAGER dashboard role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'ENTERPRISE' });
      const result = await service.createStaffMember('rest-1', { name: 'Mary', role: 'MANAGER' });
      expect(result.tempPassword).toEqual(expect.any(String));
      expect(result.rawPin).toBeUndefined();
      expect(prisma.user.create.mock.calls[0][0].data.pinHash).toBeNull();
    });

    it('generates synthetic email when none provided', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'ENTERPRISE' });
      await service.createStaffMember('rest-1', { name: 'Carl', role: 'KITCHEN' });
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.email).toMatch(/@rest-1\.local$/);
    });

    it('generates fallback email when synthetic email already exists', async () => {
      // findUnique returns user (collision), create still succeeds
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'ENTERPRISE' });
      await service.createStaffMember('rest-1', { name: 'Dan', role: 'WAITER' });
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.email).toMatch(/@rest-1\.local$/);
    });

    it('throws ForbiddenException when STARTER tier staff limit (1) is reached', async () => {
      prisma.user.count.mockResolvedValue(1); // 1 existing STAFF = at limit
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'STARTER' });
      await expect(
        service.createStaffMember('rest-1', { name: 'Eve', role: 'STAFF' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows STARTER tier to create 1 STAFF seat', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'STARTER' });
      const result = await service.createStaffMember('rest-1', { name: 'Frank', role: 'STAFF' });
      expect(result.tempPassword).toEqual(expect.any(String));
    });

    it('throws ForbiddenException when PROFESSIONAL tier staff limit (5) is reached', async () => {
      prisma.user.count.mockResolvedValue(5); // 5 existing staff = at limit
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'PROFESSIONAL' });
      await expect(
        service.createStaffMember('rest-1', { name: 'Eve', role: 'MANAGER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows PROFESSIONAL tier to create up to 5 staff', async () => {
      prisma.user.count.mockResolvedValue(4); // 4 existing, limit is 5
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'PROFESSIONAL' });
      const result = await service.createStaffMember('rest-1', { name: 'Frank', role: 'MANAGER' });
      expect(result.tempPassword).toEqual(expect.any(String));
    });

    it('counts STAFF role against the seat limit', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-1', tier: 'STARTER' });
      await service.createStaffMember('rest-1', { name: 'Grace', role: 'STAFF' });
      expect(prisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: { in: expect.arrayContaining(['STAFF']) } }),
        }),
      );
    });
  });

  describe('listStaffMembers', () => {
    it('includes STAFF role in query', async () => {
      await service.listStaffMembers('rest-1');
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: { in: expect.arrayContaining(['STAFF', 'WAITER', 'MANAGER', 'KITCHEN']) } }),
        }),
      );
    });
  });

  describe('removeStaffMember', () => {
    it('removes staff member and returns info', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      const result = await service.removeStaffMember('rest-1', 'user-1');
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(result).toHaveProperty('id', 'user-1');
    });

    it('throws NotFoundException when staff member not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.removeStaffMember('rest-1', 'ghost')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when trying to remove OWNER', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'OWNER' });
      await expect(service.removeStaffMember('rest-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('verifyRestaurantAccess', () => {
    it('passes silently when user is the owner', async () => {
      await expect(service.verifyRestaurantAccess('rest-1', 'owner-1')).resolves.toBeUndefined();
    });

    it('passes when user is assigned staff of the restaurant', async () => {
      prisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });
      await expect(service.verifyRestaurantAccess('rest-1', 'user-1')).resolves.toBeUndefined();
    });

    it('throws NotFoundException when restaurant not found', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(null);
      await expect(service.verifyRestaurantAccess('bad-id', 'owner-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user belongs to different restaurant', async () => {
      prisma.user.findUnique.mockResolvedValue({ restaurantId: 'other-rest' });
      await expect(service.verifyRestaurantAccess('rest-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });
});
