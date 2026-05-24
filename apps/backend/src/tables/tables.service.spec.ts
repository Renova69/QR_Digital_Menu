import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TablesService } from './tables.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

describe('TablesService', () => {
  let service: TablesService;
  let prisma: any;
  let events: any;

  const mockRestaurant = { id: 'rest-1', ownerId: 'owner-1' };
  const mockTable = { id: 'table-1', name: 'T1', restaurantId: 'rest-1', updatedAt: new Date() };

  beforeEach(async () => {
    prisma = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(mockRestaurant) },
      restaurantTable: {
        create: jest.fn().mockResolvedValue(mockTable),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([mockTable]),
        findUnique: jest.fn().mockResolvedValue({ ...mockTable, restaurant: mockRestaurant }),
        delete: jest.fn().mockResolvedValue(mockTable),
      },
      tableSession: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      tableZone: { findFirst: jest.fn().mockResolvedValue({ id: 'zone-1' }) },
    };

    events = {
      emitToRestaurant: jest.fn(),
      emitTableStatusChanged: jest.fn(),
      emitZoneChanged: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsGateway, useValue: events },
      ],
    }).compile();

    service = module.get<TablesService>(TablesService);
  });

  describe('create', () => {
    it('creates table and emits event when owner', async () => {
      const result = await service.create('rest-1', { name: 'T1' }, 'owner-1');
      expect(prisma.restaurantTable.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: 'T1', restaurantId: 'rest-1' }) }),
      );
      expect(events.emitToRestaurant).toHaveBeenCalledWith('rest-1', 'table:created', expect.any(Object));
      expect(result).toEqual(mockTable);
    });

    it('throws NotFoundException when restaurant does not exist', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(null);
      await expect(service.create('bad-id', { name: 'T1' }, 'owner-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not owner', async () => {
      await expect(service.create('rest-1', { name: 'T1' }, 'other-user')).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when table name already exists for restaurant', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({ id: 'existing-table' });

      await expect(service.create('rest-1', { name: '  T1  ' }, 'owner-1')).rejects.toThrow(ConflictException);
      expect(prisma.restaurantTable.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            restaurantId: 'rest-1',
            name: { equals: 'T1', mode: 'insensitive' },
          }),
        }),
      );
      expect(prisma.restaurantTable.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('returns all tables ordered by name', async () => {
      const result = await service.findAll('rest-1');
      expect(prisma.restaurantTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { restaurantId: 'rest-1' }, orderBy: { name: 'asc' } }),
      );
      expect(result).toEqual([mockTable]);
    });
  });

  describe('getTablesWithStatus', () => {
    it('returns empty status for tables with no session', async () => {
      const result = await service.getTablesWithStatus('rest-1');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('empty');
      expect(result[0].orderCount).toBe(0);
    });

    it('returns occupied status for table with open session and orders', async () => {
      const session = {
        id: 'sess-1',
        tableId: 'table-1',
        status: 'OPEN',
        createdAt: new Date(),
        orders: [
          { customerName: 'Alice', totalPrice: 20, status: 'NEW' },
          { customerName: 'Bob', totalPrice: 10, status: 'SERVED' },
        ],
      };
      prisma.tableSession.findMany.mockResolvedValue([session]);

      const result = await service.getTablesWithStatus('rest-1');
      expect(result[0].status).toBe('occupied');
      expect(result[0].orderCount).toBe(2);
      expect(result[0].totalAmount).toBe(30);
      expect(result[0].customerNames).toEqual(expect.arrayContaining(['Alice', 'Bob']));
    });

    it('returns waiting status for open session with no orders', async () => {
      const session = {
        id: 'sess-1',
        tableId: 'table-1',
        status: 'OPEN',
        createdAt: new Date(),
        orders: [],
      };
      prisma.tableSession.findMany.mockResolvedValue([session]);

      const result = await service.getTablesWithStatus('rest-1');
      expect(result[0].status).toBe('occupied');
    });

    it('returns paid status for PAID session', async () => {
      const session = {
        id: 'sess-1',
        tableId: 'table-1',
        status: 'PAID',
        createdAt: new Date(),
        orders: [{ customerName: 'Alice', totalPrice: 15, status: 'SERVED' }],
      };
      prisma.tableSession.findMany.mockResolvedValue([session]);

      const result = await service.getTablesWithStatus('rest-1');
      expect(result[0].status).toBe('paid');
    });

    it('deduplicates customer names', async () => {
      const session = {
        id: 'sess-1',
        tableId: 'table-1',
        status: 'OPEN',
        createdAt: new Date(),
        orders: [
          { customerName: 'Alice', totalPrice: 10, status: 'NEW' },
          { customerName: 'Alice', totalPrice: 5, status: 'NEW' },
        ],
      };
      prisma.tableSession.findMany.mockResolvedValue([session]);

      const result = await service.getTablesWithStatus('rest-1');
      expect(result[0].customerNames).toEqual(['Alice']);
    });
  });

  describe('getTableOrders', () => {
    it('returns empty array when no open session', async () => {
      const result = await service.getTableOrders('table-1', 'rest-1');
      expect(result).toEqual([]);
    });

    it('returns mapped orders when open session exists', async () => {
      const session = { id: 'sess-1' };
      const mockOrders = [
        {
          id: 'ord-1',
          customerName: 'Alice',
          totalPrice: 20,
          status: 'NEW',
          specialRequests: null,
          createdAt: new Date(),
          items: [
            { quantity: 2, selectedOptions: [], menuItem: { name: 'Burger', price: 5 } },
          ],
        },
      ];
      prisma.tableSession.findFirst.mockResolvedValue(session);
      prisma.order.findMany.mockResolvedValue(mockOrders);

      const result = await service.getTableOrders('table-1', 'rest-1');
      expect(result).toHaveLength(1);
      expect(result[0].items[0]).toEqual({ name: 'Burger', quantity: 2, totalPrice: 10, options: [] });
    });

    it('falls back to "Unknown item" when menuItem is null', async () => {
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'sess-1' });
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'ord-1',
          customerName: 'Bob',
          totalPrice: 5,
          status: 'NEW',
          specialRequests: null,
          createdAt: new Date(),
          items: [{ quantity: 1, selectedOptions: [], menuItem: null }],
        },
      ]);

      const result = await service.getTableOrders('table-1', 'rest-1');
      expect(result[0].items[0].name).toBe('Unknown item');
    });
  });

  describe('remove', () => {
    it('deletes table and emits event when owner', async () => {
      const result = await service.remove('table-1', 'owner-1');
      expect(prisma.restaurantTable.delete).toHaveBeenCalledWith({ where: { id: 'table-1' } });
      expect(events.emitToRestaurant).toHaveBeenCalledWith('rest-1', 'table:deleted', { tableId: 'table-1' });
      expect(result).toEqual(mockTable);
    });

    it('throws NotFoundException when table does not exist', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue(null);
      await expect(service.remove('bad-id', 'owner-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not owner', async () => {
      await expect(service.remove('table-1', 'other-user')).rejects.toThrow(ForbiddenException);
    });
  });
});
