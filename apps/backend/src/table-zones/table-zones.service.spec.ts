import { ForbiddenException } from '@nestjs/common';
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
      },
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
  });
});
