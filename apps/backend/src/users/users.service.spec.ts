import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';
import { EventsGateway } from '../events/events.gateway';

jest.mock('bcryptjs', () => {
  const real = jest.requireActual('bcryptjs');
  return { ...real, compare: jest.fn(real.compare), hash: jest.fn(real.hash) };
});

const mockBcryptCompare = bcrypt.compare as jest.Mock;
const mockBcryptHash = bcrypt.hash as jest.Mock;

describe('UsersService', () => {
  let service: UsersService;
  let prisma: any;
  let events: any;

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
    // Reset bcrypt mocks to real implementations between tests
    const real = jest.requireActual('bcryptjs');
    mockBcryptCompare.mockImplementation(real.compare);
    mockBcryptHash.mockImplementation(real.hash);

    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([mockUser]),
        create: jest.fn().mockResolvedValue(mockUser),
        update: jest.fn().mockResolvedValue(mockUser),
        delete: jest.fn().mockResolvedValue(mockUser),
        count: jest.fn().mockResolvedValue(0),
      },
      restaurant: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rest-1',
          ownerId: 'owner-1',
          tier: 'FREE',
        }),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fn: (tx: any) => Promise<any>) => fn(prisma)),
    };

    events = { evictUser: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        FeatureService,
        { provide: EventsGateway, useValue: events },
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
      expect(prisma.user.findFirst).toHaveBeenCalledWith({
        where: { phone: '+35912345678' },
      });
      expect(result).toEqual(mockUser);
    });
  });

  describe('create', () => {
    it('normalizes email to lowercase on create', async () => {
      await service.create({
        email: 'BOB@Example.COM',
        name: 'Bob',
      } as unknown as Parameters<typeof service.create>[0]);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ email: 'bob@example.com' }),
        }),
      );
    });

    it('skips normalization when email is absent', async () => {
      await service.create({ name: 'No Email' } as unknown as Parameters<
        typeof service.create
      >[0]);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'No Email' }),
        }),
      );
    });
  });

  describe('createStaffMember', () => {
    it('issues a PIN (no password) for WAITER device role', async () => {
      prisma.user.findUnique.mockResolvedValue(null); // no email collision
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'ENTERPRISE',
      });
      const result = await service.createStaffMember('rest-1', {
        name: 'Bob',
        role: 'WAITER',
      });
      expect(result.rawPin).toMatch(/^\d{4}$/);
      expect(result.tempPassword).toBeUndefined();
      expect(result.user).toHaveProperty('id');
      // pinHash persisted for device roles
      expect(prisma.user.create.mock.calls[0][0].data.pinHash).toEqual(
        expect.any(String),
      );
    });

    it('issues a PIN for KITCHEN device role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'ENTERPRISE',
      });
      const result = await service.createStaffMember('rest-1', {
        name: 'Kim',
        role: 'KITCHEN',
      });
      expect(result.rawPin).toMatch(/^\d{4}$/);
      expect(result.tempPassword).toBeUndefined();
    });

    it('issues a temp password (no PIN) for STAFF dashboard role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'ENTERPRISE',
      });
      const result = await service.createStaffMember('rest-1', {
        name: 'Sam',
        role: 'STAFF',
      });
      expect(result.tempPassword).toEqual(expect.any(String));
      expect(result.rawPin).toBeUndefined();
      // dashboard roles must NOT carry a pinHash — keeps them out of pinLogin
      expect(prisma.user.create.mock.calls[0][0].data.pinHash).toBeNull();
    });

    it('issues a temp password (no PIN) for MANAGER dashboard role', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'ENTERPRISE',
      });
      const result = await service.createStaffMember('rest-1', {
        name: 'Mary',
        role: 'MANAGER',
      });
      expect(result.tempPassword).toEqual(expect.any(String));
      expect(result.rawPin).toBeUndefined();
      expect(prisma.user.create.mock.calls[0][0].data.pinHash).toBeNull();
    });

    it('generates synthetic email when none provided', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'ENTERPRISE',
      });
      await service.createStaffMember('rest-1', {
        name: 'Carl',
        role: 'KITCHEN',
      });
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.email).toMatch(/@rest-1\.local$/);
    });

    it('generates fallback email when synthetic email already exists', async () => {
      // findUnique returns user (collision), create still succeeds
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'ENTERPRISE',
      });
      await service.createStaffMember('rest-1', {
        name: 'Dan',
        role: 'WAITER',
      });
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.email).toMatch(/@rest-1\.local$/);
    });

    it('throws ForbiddenException when STARTER tier staff limit (1) is reached', async () => {
      prisma.user.count.mockResolvedValue(1); // 1 existing STAFF = at limit
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'STARTER',
      });
      await expect(
        service.createStaffMember('rest-1', { name: 'Eve', role: 'STAFF' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows STARTER tier to create 1 STAFF seat', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'STARTER',
      });
      const result = await service.createStaffMember('rest-1', {
        name: 'Frank',
        role: 'STAFF',
      });
      expect(result.tempPassword).toEqual(expect.any(String));
    });

    it('throws ForbiddenException when PROFESSIONAL tier staff limit (5) is reached', async () => {
      prisma.user.count.mockResolvedValue(5); // 5 existing staff = at limit
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'PROFESSIONAL',
      });
      await expect(
        service.createStaffMember('rest-1', { name: 'Eve', role: 'MANAGER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows PROFESSIONAL tier to create up to 5 staff', async () => {
      prisma.user.count.mockResolvedValue(4); // 4 existing, limit is 5
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'PROFESSIONAL',
      });
      const result = await service.createStaffMember('rest-1', {
        name: 'Frank',
        role: 'MANAGER',
      });
      expect(result.tempPassword).toEqual(expect.any(String));
    });

    it('counts STAFF role against the seat limit', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'STARTER',
      });
      await service.createStaffMember('rest-1', {
        name: 'Grace',
        role: 'STAFF',
      });
      expect(prisma.user.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: { in: expect.arrayContaining(['STAFF']) },
          }),
        }),
      );
    });
  });

  // Issue 56 — PIN entropy: padStart ensures 4-digit format including leading zeros
  describe('PIN entropy — Issue 56', () => {
    beforeEach(() => {
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'ENTERPRISE',
      });
      prisma.user.findMany.mockResolvedValue([]); // no existing PINs
    });

    it('always generates a 4-character string (including PINs with leading zeros)', async () => {
      // Run 20 iterations to sample a spread of random values
      for (let i = 0; i < 20; i++) {
        prisma.user.create.mockResolvedValue({
          ...mockUser,
          role: 'WAITER',
        });
        const result = await service.createStaffMember('rest-1', {
          name: `Waiter${i}`,
          role: 'WAITER',
        });
        expect(result.rawPin).toMatch(/^\d{4}$/);
      }
      // createStaffMember bcrypt-hashes both the PIN and the always-random
      // password column, so 20 samples is ~40 hashes. That fits inside Jest's
      // 5s default on a warm machine but not under `--coverage`, where
      // instrumentation pushes it over and the suite fails only in CI. Sample
      // count is the point of the test, so raise the budget rather than thin it.
    }, 30_000);

    it('padStart preserves leading zeros (42 → "0042")', () => {
      // Unit-level assertion: the padStart formula used in the service is correct
      // This proves values 0–999 get padded to 4 chars without mocking randomInt
      expect((42).toString().padStart(4, '0')).toBe('0042');
      expect((0).toString().padStart(4, '0')).toBe('0000');
      expect((9999).toString().padStart(4, '0')).toBe('9999');
    });
  });

  // Issue 41 — PIN uniqueness per restaurant
  describe('PIN uniqueness — Issue 41', () => {
    beforeEach(() => {
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'ENTERPRISE',
      });
      prisma.user.create.mockResolvedValue({ ...mockUser, role: 'WAITER' });
    });

    it('regenerates PIN when first candidate collides with an existing hash', async () => {
      // Simulate collision on first compare, no collision on second
      let compareCallCount = 0;
      mockBcryptCompare.mockImplementation(async () => {
        compareCallCount++;
        return compareCallCount === 1; // true = collision on first, false on subsequent
      });
      // Return one existing hash so the collision path is triggered
      prisma.user.findMany.mockResolvedValue([
        { pinHash: 'some-existing-hash' },
      ]);

      const result = await service.createStaffMember('rest-1', {
        name: 'Waiter',
        role: 'WAITER',
      });

      // Should have succeeded with a 4-digit PIN on the second attempt
      expect(result.rawPin).toMatch(/^\d{4}$/);
      // bcrypt.compare must have been called at least twice (one collision + success)
      expect(mockBcryptCompare).toHaveBeenCalledTimes(2);
    });

    it('checks inactive staff PIN hashes when generating a new PIN', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.createStaffMember('rest-1', {
        name: 'Waiter',
        role: 'WAITER',
      });

      const pinLookupArgs = prisma.user.findMany.mock.calls.find(
        ([args]: [any]) => args?.select?.pinHash,
      )?.[0];
      expect(pinLookupArgs.where).toMatchObject({
        restaurantId: 'rest-1',
        pinHash: { not: null },
      });
      expect(pinLookupArgs.where).not.toHaveProperty('isActive');
    });

    it('throws ConflictException when all 20 attempts produce collisions', async () => {
      // Make every bcrypt.compare return true — every candidate PIN is a "duplicate"
      mockBcryptCompare.mockResolvedValue(true as never);
      // Return one existing hash so the uniqueness check runs
      prisma.user.findMany.mockResolvedValue([
        { pinHash: 'some-existing-hash' },
      ]);

      await expect(
        service.createStaffMember('rest-1', {
          name: 'Unlucky',
          role: 'WAITER',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listStaffMembers', () => {
    it('includes STAFF role in query', async () => {
      await service.listStaffMembers('rest-1');
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: {
              in: expect.arrayContaining([
                'STAFF',
                'WAITER',
                'MANAGER',
                'KITCHEN',
              ]),
            },
          }),
        }),
      );
    });
  });

  describe('resetStaffPin', () => {
    it('resets PIN for a device role (WAITER)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u',
        name: 'W',
        email: 'w@x',
        role: 'WAITER',
      });
      const result = await service.resetStaffPin('rest-1', 'u');
      expect(result.rawPin).toMatch(/^\d{4}$/);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pinHash: expect.any(String),
            passwordChangedAt: expect.any(Date),
          }),
        }),
      );
      expect(events.evictUser).toHaveBeenCalledWith('u', 'pin_reset');
    });

    it('refuses to set a PIN for a dashboard role (STAFF)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u',
        name: 'S',
        email: 's@x',
        role: 'STAFF',
      });
      await expect(service.resetStaffPin('rest-1', 'u')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses to set a PIN for a dashboard role (MANAGER)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u',
        name: 'M',
        email: 'm@x',
        role: 'MANAGER',
      });
      await expect(service.resetStaffPin('rest-1', 'u')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('writes an admin audit log when an actor resets a staff PIN', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u',
        name: 'W',
        email: 'w@x',
        role: 'WAITER',
      });

      await service.resetStaffPin('rest-1', 'u', 'OWNER', 'owner-1');

      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          actorUserId: 'owner-1',
          action: 'STAFF_PIN_RESET',
          targetType: 'USER',
          targetId: 'u',
          metadata: {
            restaurantId: 'rest-1',
            targetRole: 'WAITER',
          },
        },
      });
    });
  });

  describe('updateStaffMember', () => {
    beforeEach(() => {
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'ENTERPRISE',
      });
    });

    it('throws NotFoundException if staff member not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.updateStaffMember('rest-1', 'user-1', { role: 'STAFF' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if user.role is OWNER', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'OWNER' });
      await expect(
        service.updateStaffMember('rest-1', 'user-1', { role: 'STAFF' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if user is MANAGER and caller is not OWNER', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'MANAGER' });
      await expect(
        service.updateStaffMember(
          'rest-1',
          'user-1',
          { role: 'STAFF' },
          'MANAGER',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException if the requested role is not allowed on the current tier', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'WAITER' });
      prisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-1',
        tier: 'STARTER',
      });
      // STARTER tier usually does not allow MANAGER role
      await expect(
        service.updateStaffMember('rest-1', 'user-1', { role: 'MANAGER' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('clears pinHash when changing a device role to a dashboard role (WAITER → STAFF)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u',
        email: 'w@x',
        name: 'W',
        role: 'WAITER',
      });
      const result = await service.updateStaffMember('rest-1', 'u', {
        role: 'STAFF',
      });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pinHash: null }),
        }),
      );
      expect((result as { rawPin?: string }).rawPin).toBeUndefined();
    });

    it('mints a PIN when changing a dashboard role to a device role (STAFF → WAITER)', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u',
        email: 's@x',
        name: 'S',
        role: 'STAFF',
      });
      const result = await service.updateStaffMember('rest-1', 'u', {
        role: 'WAITER',
      });
      expect((result as { rawPin?: string }).rawPin).toMatch(/^\d{4}$/);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pinHash: expect.any(String),
            password: expect.any(String),
            passwordChangedAt: expect.any(Date),
          }),
        }),
      );
    });

    it('evicts live sockets when a staff role changes', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u',
        email: 'w@x',
        name: 'W',
        role: 'WAITER',
      });
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        id: 'u',
        role: 'STAFF',
      });

      await service.updateStaffMember('rest-1', 'u', { role: 'STAFF' });

      expect(events.evictUser).toHaveBeenCalledWith('u', 'role_changed');
    });

    it('evicts live sockets when a staff account is disabled', async () => {
      prisma.user.findFirst.mockResolvedValue({
        id: 'u',
        email: 'w@x',
        name: 'W',
        role: 'WAITER',
      });
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        id: 'u',
        isActive: false,
      });

      await service.updateStaffMember('rest-1', 'u', { isActive: false });

      expect(events.evictUser).toHaveBeenCalledWith('u', 'account_disabled');
    });
  });

  describe('removeStaffMember', () => {
    it('soft-removes staff member by default and returns info', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      const result = await service.removeStaffMember('rest-1', 'user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          isActive: false,
          disabledAt: expect.any(Date),
          disabledReason: 'Removed by staff manager',
        }),
      });
      expect(result).toHaveProperty('id', 'user-1');
      expect(events.evictUser).toHaveBeenCalledWith(
        'user-1',
        'account_removed',
      );
    });

    it('hard-deletes staff member when requested and writes audit log', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);
      const result = await service.removeStaffMember(
        'rest-1',
        'user-1',
        'OWNER',
        'owner-1',
        true,
      );
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-1' },
      });
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          actorUserId: 'owner-1',
          action: 'STAFF_HARD_DELETE',
          targetType: 'USER',
          targetId: 'user-1',
          metadata: {
            restaurantId: 'rest-1',
            targetRole: mockUser.role,
            hardDelete: true,
          },
        },
      });
      expect(events.evictUser).toHaveBeenCalledWith(
        'user-1',
        'account_deleted',
      );
      expect(result).toHaveProperty('id', 'user-1');
    });

    it('throws NotFoundException when staff member not found', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.removeStaffMember('rest-1', 'ghost'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when trying to remove OWNER', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'OWNER' });
      await expect(
        service.removeStaffMember('rest-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when trying to remove MANAGER and caller is not OWNER', async () => {
      prisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'MANAGER' });
      await expect(
        service.removeStaffMember('rest-1', 'user-1', 'MANAGER'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('verifyRestaurantAccess', () => {
    it('passes silently when user is the owner', async () => {
      await expect(
        service.verifyRestaurantAccess('rest-1', 'owner-1'),
      ).resolves.toBeUndefined();
    });

    it('passes when user is assigned staff of the restaurant', async () => {
      prisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });
      await expect(
        service.verifyRestaurantAccess('rest-1', 'user-1'),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundException when restaurant not found', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(null);
      await expect(
        service.verifyRestaurantAccess('bad-id', 'owner-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user belongs to different restaurant', async () => {
      prisma.user.findUnique.mockResolvedValue({ restaurantId: 'other-rest' });
      await expect(
        service.verifyRestaurantAccess('rest-1', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
