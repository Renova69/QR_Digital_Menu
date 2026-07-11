import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TablesService } from './tables.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { FeatureService } from '../subscription/feature.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';

describe('TablesService', () => {
  let service: TablesService;
  let prisma: any;
  let events: any;
  let featureService: any;

  const mockRestaurant = {
    id: 'rest-1',
    ownerId: 'owner-1',
    tier: 'STARTER',
    forceTier: null,
  };
  const mockTable = {
    id: 'table-1',
    name: 'T1',
    type: 'TABLE',
    restaurantId: 'rest-1',
    updatedAt: new Date(),
  };
  const mockOwner = { id: 'owner-1', role: 'OWNER' };

  beforeEach(async () => {
    prisma = {
      restaurant: { findUnique: jest.fn().mockResolvedValue(mockRestaurant) },
      restaurantTable: {
        create: jest.fn().mockResolvedValue(mockTable),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([mockTable]),
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...mockTable, restaurant: mockRestaurant }),
        update: jest.fn().mockResolvedValue({
          ...mockTable,
          type: 'ROOM',
          publicToken: 'new-token',
        }),
        delete: jest.fn().mockResolvedValue(mockTable),
      },
      tableSession: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      order: { findMany: jest.fn().mockResolvedValue([]) },
      tableZone: { findFirst: jest.fn().mockResolvedValue({ id: 'zone-1' }) },
      // Non-owner table ops now look up the user to allow assigned MANAGERs
      // (#19). Default null → not a manager → ForbiddenException as before.
      user: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    events = {
      emitToRestaurant: jest.fn(),
      emitTableStatusChanged: jest.fn(),
      emitZoneChanged: jest.fn(),
    };

    featureService = {
      restaurantHasFeature: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TablesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsGateway, useValue: events },
        { provide: FeatureService, useValue: featureService },
      ],
    }).compile();

    service = module.get<TablesService>(TablesService);
  });

  describe('create', () => {
    it('creates table and emits event when owner', async () => {
      const result = await service.create('rest-1', { name: 'T1' }, 'owner-1');
      expect(prisma.restaurantTable.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'T1', restaurantId: 'rest-1' }),
        }),
      );
      expect(events.emitToRestaurant).toHaveBeenCalledWith(
        'rest-1',
        'table:created',
        expect.any(Object),
      );
      expect(result).toEqual(mockTable);
    });

    it('allows an assigned MANAGER to create a table (#19)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'MANAGER',
        restaurantId: 'rest-1',
      });
      await expect(
        service.create('rest-1', { name: 'T9' }, 'manager-1'),
      ).resolves.toBeDefined();
      expect(prisma.restaurantTable.create).toHaveBeenCalled();
    });

    it('rejects a MANAGER assigned to a different restaurant (#19)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'MANAGER',
        restaurantId: 'other-rest',
      });
      await expect(
        service.create('rest-1', { name: 'T9' }, 'manager-x'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when restaurant does not exist', async () => {
      prisma.restaurant.findUnique.mockResolvedValue(null);
      await expect(
        service.create('bad-id', { name: 'T1' }, 'owner-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not owner', async () => {
      await expect(
        service.create('rest-1', { name: 'T1' }, 'other-user'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for a soft-deleted/suspended restaurant, even for its own owner', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        isActive: false,
        deletedAt: new Date(),
      });
      await expect(
        service.create('rest-1', { name: 'T1' }, 'owner-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.restaurantTable.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when table name already exists for restaurant', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'existing-table',
      });

      await expect(
        service.create('rest-1', { name: '  T1  ' }, 'owner-1'),
      ).rejects.toThrow(ConflictException);
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
      const result = await service.findAll('rest-1', mockOwner);
      expect(prisma.restaurantTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: 'rest-1', type: 'TABLE' },
          orderBy: { name: 'asc' },
        }),
      );
      expect(result).toEqual([mockTable]);
    });
  });

  describe('service points', () => {
    it('rejects creating a service point when the restaurant plan does not include them', async () => {
      featureService.restaurantHasFeature.mockReturnValue(false);

      await expect(
        service.create('rest-1', { name: 'Room 304', type: 'ROOM' }, 'owner-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FEATURE_LOCKED' }),
      });
      expect(featureService.restaurantHasFeature).toHaveBeenCalledWith(
        mockRestaurant,
        FeatureFlag.SERVICE_POINTS,
      );
      expect(prisma.restaurantTable.create).not.toHaveBeenCalled();
    });

    it('returns only non-table service points', async () => {
      await service.findServicePoints('rest-1', mockOwner);
      expect(prisma.restaurantTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { restaurantId: 'rest-1', type: { not: 'TABLE' } },
        }),
      );
    });

    it('rejects listing service points when the restaurant plan does not include them', async () => {
      featureService.restaurantHasFeature.mockReturnValue(false);

      await expect(
        service.findServicePoints('rest-1', mockOwner),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FEATURE_LOCKED' }),
      });
      expect(prisma.restaurantTable.findMany).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when a non-owner, non-staff user requests another restaurant service points', async () => {
      await expect(
        service.findServicePoints('rest-1', {
          id: 'stranger-1',
          role: 'OWNER',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.restaurantTable.findMany).not.toHaveBeenCalled();
    });

    it('resolves an active public service point by token', async () => {
      prisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'room-304',
        name: 'Room 304',
        type: 'ROOM',
        publicToken: 'sp-token',
        fulfillmentModes: ['ROOM_DELIVERY', 'PICKUP'],
        paymentMethods: ['ONLINE', 'PAY_ON_DELIVERY'],
        restaurant: mockRestaurant,
      });

      await expect(
        service.resolvePublicServicePoint('rest-1', 'sp-token'),
      ).resolves.toMatchObject({ id: 'room-304', name: 'Room 304' });
      expect(prisma.restaurantTable.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            restaurantId: 'rest-1',
            publicToken: 'sp-token',
            isActive: true,
            type: { not: 'TABLE' },
          }),
        }),
      );
    });

    it('does not resolve a public service-point token after the feature is removed', async () => {
      featureService.restaurantHasFeature.mockReturnValue(false);
      prisma.restaurantTable.findFirst.mockResolvedValue({
        id: 'room-304',
        name: 'Room 304',
        type: 'ROOM',
        publicToken: 'sp-token',
        fulfillmentModes: ['ROOM_DELIVERY'],
        paymentMethods: ['PAY_ON_DELIVERY'],
        restaurant: { ...mockRestaurant, tier: 'FREE' },
      });

      await expect(
        service.resolvePublicServicePoint('rest-1', 'sp-token'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rotates a service point public token for the owner', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue({
        ...mockTable,
        type: 'ROOM',
        restaurant: mockRestaurant,
      });

      await service.rotatePublicToken('room-304', 'owner-1');
      expect(prisma.restaurantTable.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'room-304' },
          data: { publicToken: expect.any(String) },
        }),
      );
    });

    it('rejects rotating a service-point token after the feature is removed', async () => {
      featureService.restaurantHasFeature.mockReturnValue(false);
      prisma.restaurantTable.findUnique.mockResolvedValue({
        ...mockTable,
        type: 'ROOM',
        restaurant: { ...mockRestaurant, tier: 'FREE' },
      });

      await expect(
        service.rotatePublicToken('room-304', 'owner-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FEATURE_LOCKED' }),
      });
      expect(prisma.restaurantTable.update).not.toHaveBeenCalled();
    });

    it('rejects updating a service point after the feature is removed', async () => {
      featureService.restaurantHasFeature.mockReturnValue(false);
      prisma.restaurantTable.findUnique.mockResolvedValue({
        ...mockTable,
        type: 'ROOM',
        restaurant: { ...mockRestaurant, tier: 'FREE' },
      });

      await expect(
        service.update('room-304', { name: 'Room 305' }, 'owner-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FEATURE_LOCKED' }),
      });
      expect(prisma.restaurantTable.update).not.toHaveBeenCalled();
    });
  });

  describe('getTablesWithStatus', () => {
    it('returns empty status for tables with no session', async () => {
      const result = await service.getTablesWithStatus(
        'rest-1',
        undefined,
        mockOwner,
      );
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

      const result = await service.getTablesWithStatus(
        'rest-1',
        undefined,
        mockOwner,
      );
      expect(result[0].status).toBe('occupied');
      expect(result[0].orderCount).toBe(2);
      expect(result[0].totalAmount).toBe(30);
      expect(result[0].customerNames).toEqual(
        expect.arrayContaining(['Alice', 'Bob']),
      );
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

      const result = await service.getTablesWithStatus(
        'rest-1',
        undefined,
        mockOwner,
      );
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

      const result = await service.getTablesWithStatus(
        'rest-1',
        undefined,
        mockOwner,
      );
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

      const result = await service.getTablesWithStatus(
        'rest-1',
        undefined,
        mockOwner,
      );
      expect(result[0].customerNames).toEqual(['Alice']);
    });

    it('blocks assigned staff from status reads when restaurant is soft-deleted', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        isActive: true,
        deletedAt: new Date(),
      });

      await expect(
        service.getTablesWithStatus('rest-1', undefined, {
          id: 'waiter-1',
          role: 'WAITER',
          restaurantId: 'rest-1',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.restaurantTable.findMany).not.toHaveBeenCalled();
      expect(prisma.tableSession.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getTableOrders', () => {
    it('returns empty array when no open session', async () => {
      const result = await service.getTableOrders(
        'table-1',
        'rest-1',
        mockOwner,
      );
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
            {
              quantity: 2,
              unitPriceWithOptions: 5,
              selectedOptions: [],
              menuItem: { name: 'Burger', price: 5 },
            },
          ],
        },
      ];
      prisma.tableSession.findFirst.mockResolvedValue(session);
      prisma.order.findMany.mockResolvedValue(mockOrders);

      const result = await service.getTableOrders(
        'table-1',
        'rest-1',
        mockOwner,
      );
      expect(result).toHaveLength(1);
      expect(result[0].items[0]).toEqual({
        name: 'Burger',
        quantity: 2,
        totalPrice: 10,
        options: [],
      });
    });

    it('blocks assigned staff from order reads when restaurant is suspended', async () => {
      prisma.restaurant.findUnique.mockResolvedValue({
        ...mockRestaurant,
        isActive: false,
        deletedAt: null,
      });

      await expect(
        service.getTableOrders('table-1', 'rest-1', {
          id: 'waiter-1',
          role: 'WAITER',
          restaurantId: 'rest-1',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.tableSession.findFirst).not.toHaveBeenCalled();
      expect(prisma.order.findMany).not.toHaveBeenCalled();
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
          items: [
            {
              quantity: 1,
              unitPriceWithOptions: 5,
              selectedOptions: [],
              menuItem: null,
            },
          ],
        },
      ]);

      const result = await service.getTableOrders(
        'table-1',
        'rest-1',
        mockOwner,
      );
      expect(result[0].items[0].name).toBe('Unknown item');
    });
  });

  describe('remove', () => {
    it('deletes table and emits event when owner', async () => {
      const result = await service.remove('table-1', 'owner-1');
      expect(prisma.restaurantTable.delete).toHaveBeenCalledWith({
        where: { id: 'table-1' },
      });
      expect(events.emitToRestaurant).toHaveBeenCalledWith(
        'rest-1',
        'table:deleted',
        { tableId: 'table-1' },
      );
      expect(result).toEqual(mockTable);
    });

    it('allows delete when the table only has closed (non-active) historical sessions', async () => {
      // No OPEN/PAID session exists, but the table has taken orders in the
      // past. Deletion must still be allowed: Payment.tableSessionId and the
      // CashPaymentRequest table/session pointers are SetNull on delete, so this
      // preserves payment history instead of requiring the table to have
      // never been used.
      prisma.tableSession.findFirst.mockResolvedValue(null);

      const result = await service.remove('table-1', 'owner-1');

      expect(prisma.restaurantTable.delete).toHaveBeenCalledWith({
        where: { id: 'table-1' },
      });
      expect(result).toEqual(mockTable);
    });

    it('blocks delete when table has an active (OPEN/PAID) session', async () => {
      prisma.tableSession.findFirst.mockResolvedValue({ id: 'sess-active' });

      await expect(service.remove('table-1', 'owner-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.restaurantTable.delete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when table does not exist', async () => {
      prisma.restaurantTable.findUnique.mockResolvedValue(null);
      await expect(service.remove('bad-id', 'owner-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user is not owner', async () => {
      await expect(service.remove('table-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('rejects deleting a service point after the feature is removed', async () => {
      featureService.restaurantHasFeature.mockReturnValue(false);
      prisma.restaurantTable.findUnique.mockResolvedValue({
        ...mockTable,
        type: 'ROOM',
        restaurant: { ...mockRestaurant, tier: 'FREE' },
      });

      await expect(service.remove('room-304', 'owner-1')).rejects.toMatchObject(
        {
          response: expect.objectContaining({ code: 'FEATURE_LOCKED' }),
        },
      );
      expect(prisma.restaurantTable.delete).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases (Additional)', () => {
    it('getTablesWithStatus returns correct orderCount when orders contain null customerNames', async () => {
      const session = {
        id: 'sess-2',
        tableId: 'table-1',
        status: 'OPEN',
        createdAt: new Date(),
        orders: [
          { customerName: null, totalPrice: 15, status: 'NEW' },
          { customerName: '', totalPrice: 10, status: 'NEW' },
        ],
      };
      prisma.tableSession.findMany.mockResolvedValue([session]);

      const result = await service.getTablesWithStatus(
        'rest-1',
        undefined,
        mockOwner,
      );

      expect(result[0].orderCount).toBe(2);
      expect(result[0].totalAmount).toBe(25);
    });

    it('getTablesWithStatus applies zoneId filter to restaurantTable.findMany', async () => {
      prisma.tableSession.findMany.mockResolvedValue([]);

      await service.getTablesWithStatus('rest-1', 'zone-x', mockOwner);

      expect(prisma.restaurantTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            restaurantId: 'rest-1',
            zoneId: 'zone-x',
          }),
        }),
      );
    });
  });
});
