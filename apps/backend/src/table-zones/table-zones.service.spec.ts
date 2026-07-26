import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TableZonesService } from './table-zones.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

describe('TableZonesService', () => {
  let service: TableZonesService;

  const mockPrisma = {
    tableZone: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregate: jest.fn(),
    },
    restaurantTable: { updateMany: jest.fn() },
    restaurant: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest
      .fn()
      .mockImplementation((args: any) => Promise.all(args)),
  };

  const mockEvents = { emitZoneChanged: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TableZonesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsGateway, useValue: mockEvents },
      ],
    }).compile();
    service = module.get<TableZonesService>(TableZonesService);
  });

  describe('findAll', () => {
    it('allows owner to list zones', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'owner-1',
      });
      mockPrisma.tableZone.findMany.mockResolvedValue([{ id: 'z1' }]);

      const result = await service.findAll('r1', {
        id: 'owner-1',
        role: 'OWNER',
      });

      expect(result).toEqual([{ id: 'z1' }]);
    });

    it('allows assigned user to list zones', async () => {
      mockPrisma.tableZone.findMany.mockResolvedValue([{ id: 'z1' }]);

      await service.findAll('r1', {
        id: 'staff-1',
        role: 'WAITER',
        restaurantId: 'r1',
      });

      expect(mockPrisma.restaurant.findUnique).not.toHaveBeenCalled();
      expect(mockPrisma.tableZone.findMany).toHaveBeenCalled();
    });

    it('rejects unauthorized user', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'owner-1',
      });

      await expect(
        service.findAll('r1', {
          id: 'staff-2',
          role: 'WAITER',
          restaurantId: 'other',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows SUPER_ADMIN', async () => {
      mockPrisma.tableZone.findMany.mockResolvedValue([]);

      await service.findAll('r1', {
        id: 'admin-1',
        role: 'SUPER_ADMIN',
      });

      expect(mockPrisma.tableZone.findMany).toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('throws ConflictException for duplicate name', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'owner-1',
      });
      mockPrisma.tableZone.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.create('r1', { name: 'Main' }, 'owner-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('creates zone and emits event', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'owner-1',
      });
      mockPrisma.tableZone.findFirst.mockResolvedValue(null);
      mockPrisma.tableZone.aggregate.mockResolvedValue({
        _max: { displayOrder: 100 },
      });
      mockPrisma.tableZone.create.mockResolvedValue({
        id: 'z1',
        name: 'Patio',
        displayOrder: 1100,
      });

      const result = await service.create('r1', { name: 'Patio' }, 'owner-1');

      expect(result.name).toBe('Patio');
      expect(mockEvents.emitZoneChanged).toHaveBeenCalledWith('r1');
    });
  });

  describe('update', () => {
    it('updates zone name', async () => {
      mockPrisma.tableZone.findUnique.mockResolvedValue({
        id: 'z1',
        name: 'Old',
        restaurantId: 'r1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'u1',
      });
      mockPrisma.tableZone.update.mockResolvedValue({ id: 'z1', name: 'New' });

      const result = await service.update('z1', { name: 'New' }, 'u1');

      expect(result.name).toBe('New');
      expect(mockEvents.emitZoneChanged).toHaveBeenCalledWith('r1');
    });

    it('throws NotFoundException for missing zone', async () => {
      mockPrisma.tableZone.findUnique.mockResolvedValue(null);
      await expect(service.update('z99', { name: 'X' }, 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException for duplicate name on update', async () => {
      mockPrisma.tableZone.findUnique.mockResolvedValue({
        id: 'z1',
        name: 'Old',
        restaurantId: 'r1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'u1',
      });
      mockPrisma.tableZone.findFirst.mockResolvedValue({
        id: 'z2',
        name: 'New',
      });

      await expect(service.update('z1', { name: 'New' }, 'u1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('removes zone and reassigns tables to default', async () => {
      mockPrisma.tableZone.findUnique.mockResolvedValue({
        id: 'z2',
        restaurantId: 'r1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'u1',
      });
      mockPrisma.tableZone.findMany.mockResolvedValue([
        { id: 'z1', displayOrder: 100 },
        { id: 'z2', displayOrder: 200 },
      ]);

      const result = await service.remove('z2', 'u1');

      expect(result.movedToZoneId).toBe('z1');
      expect(mockEvents.emitZoneChanged).toHaveBeenCalledWith('r1');
    });

    it('throws when deleting last zone', async () => {
      mockPrisma.tableZone.findUnique.mockResolvedValue({
        id: 'z1',
        restaurantId: 'r1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'u1',
      });
      mockPrisma.tableZone.findMany.mockResolvedValue([
        { id: 'z1', displayOrder: 100 },
      ]);

      await expect(service.remove('z1', 'u1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws when deleting default zone', async () => {
      mockPrisma.tableZone.findUnique.mockResolvedValue({
        id: 'z1',
        restaurantId: 'r1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'u1',
      });
      mockPrisma.tableZone.findMany.mockResolvedValue([
        { id: 'z1', displayOrder: 100 },
        { id: 'z2', displayOrder: 200 },
      ]);

      await expect(service.remove('z1', 'u1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('reorder', () => {
    it('updates displayOrder for valid zone ids', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'u1',
      });
      mockPrisma.tableZone.findMany.mockResolvedValue([
        { id: 'z1' },
        { id: 'z2' },
      ]);

      await service.reorder(
        'r1',
        {
          items: [
            { id: 'z1', displayOrder: 200 },
            { id: 'z2', displayOrder: 100 },
          ],
        },
        'u1',
      );

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockEvents.emitZoneChanged).toHaveBeenCalledWith('r1');
    });

    it('throws NotFoundException for unknown zone ids', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'u1',
      });
      mockPrisma.tableZone.findMany.mockResolvedValue([{ id: 'z1' }]);

      await expect(
        service.reorder(
          'r1',
          {
            items: [
              { id: 'z1', displayOrder: 100 },
              { id: 'z99', displayOrder: 200 },
            ],
          },
          'u1',
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getDefaultZone', () => {
    it('returns first zone by displayOrder', async () => {
      mockPrisma.tableZone.findFirst.mockResolvedValue({
        id: 'z1',
        name: 'Main',
      });
      const result = await service.getDefaultZone('r1');
      expect(result).toEqual({ id: 'z1', name: 'Main' });
    });
  });

  describe('ownership', () => {
    it('allows owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'u1',
      });
      mockPrisma.tableZone.findFirst.mockResolvedValue(null);
      mockPrisma.tableZone.aggregate.mockResolvedValue({
        _max: { displayOrder: 0 },
      });
      mockPrisma.tableZone.create.mockResolvedValue({ id: 'z1' });

      await expect(
        service.create('r1', { name: 'Test' }, 'u1'),
      ).resolves.toBeDefined();
    });

    it('allows MANAGER for same restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'owner-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'MANAGER',
        restaurantId: 'r1',
      });
      mockPrisma.tableZone.findFirst.mockResolvedValue(null);
      mockPrisma.tableZone.aggregate.mockResolvedValue({
        _max: { displayOrder: 0 },
      });
      mockPrisma.tableZone.create.mockResolvedValue({ id: 'z1' });

      await expect(
        service.create('r1', { name: 'Bar' }, 'mgr-1'),
      ).resolves.toBeDefined();
    });

    it('rejects MANAGER from different restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'r1',
        ownerId: 'owner-1',
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'MANAGER',
        restaurantId: 'r2',
      });

      await expect(
        service.create('r1', { name: 'Bar' }, 'mgr-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
