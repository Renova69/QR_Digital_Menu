import { ForbiddenException, ConflictException } from '@nestjs/common';
import { TableZonesService } from './table-zones.service';

describe('TableZonesService', () => {
  let service: TableZonesService;
  let prisma: any;
  let events: any;

  beforeEach(() => {
    prisma = {
      restaurant: {
        findUnique: jest.fn(),
      },
      tableZone: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
        delete: jest.fn(),
        findUnique: jest.fn(),
      },
      restaurantTable: {
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((args) => Promise.all(args)),
    };
    events = {
      emitZoneChanged: jest.fn(),
    };
    service = new TableZonesService(prisma, events);
  });

  describe('findAll', () => {
    it('allows the restaurant owner to list zones', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
      prisma.tableZone.findMany.mockResolvedValue([{ id: 'zone-1' }]);

      const result = await service.findAll('rest-1', {
        id: 'owner-1',
        role: 'OWNER',
      });

      expect(result).toEqual([{ id: 'zone-1' }]);
      expect(prisma.tableZone.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restaurantId: 'rest-1' } }),
      );
    });

    it('allows a user assigned to the restaurant to list zones', async () => {
      prisma.tableZone.findMany.mockResolvedValue([{ id: 'zone-1' }]);

      await service.findAll('rest-1', {
        id: 'staff-1',
        role: 'WAITER',
        restaurantId: 'rest-1',
      });

      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
      expect(prisma.tableZone.findMany).toHaveBeenCalled();
    });

    it('rejects users who do not own or belong to the restaurant', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner-1' });

      await expect(
        service.findAll('rest-1', {
          id: 'staff-2',
          role: 'WAITER',
          restaurantId: 'other-rest',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.tableZone.findMany).not.toHaveBeenCalled();
    });

    describe('create', () => {
      it('throws ConflictException if zone with same name exists', async () => {
        prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
        prisma.tableZone.findFirst.mockResolvedValue({ id: 'existing-zone' });

        await expect(
          service.create('rest-1', { name: 'Main' }, 'owner-1'),
        ).rejects.toThrow(ConflictException);
      });

      it('creates a new zone successfully', async () => {
        prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
        prisma.tableZone.findFirst.mockResolvedValue(null);
        prisma.tableZone.aggregate.mockResolvedValue({
          _max: { displayOrder: 100 },
        });
        prisma.tableZone.create.mockResolvedValue({
          id: 'new-zone',
          displayOrder: 1100,
        });

        const result = await service.create(
          'rest-1',
          { name: 'Patio' },
          'owner-1',
        );

        expect(result).toEqual({ id: 'new-zone', displayOrder: 1100 });
        expect(prisma.tableZone.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            name: 'Patio',
            displayOrder: 1100,
            restaurantId: 'rest-1',
          }),
        });
        expect(events.emitZoneChanged).toHaveBeenCalledWith('rest-1');
      });
    });

    describe('remove', () => {
      it('throws ConflictException when trying to delete the last zone', async () => {
        prisma.tableZone.findUnique.mockResolvedValue({
          id: 'zone-1',
          restaurantId: 'rest-1',
        });
        prisma.restaurant.findUnique.mockResolvedValue({ ownerId: 'owner-1' });
        prisma.tableZone.findMany.mockResolvedValue([{ id: 'zone-1' }]); // Only 1 zone

        await expect(service.remove('zone-1', 'owner-1')).rejects.toThrow(
          ConflictException,
        );
      });
    });
  });
});
