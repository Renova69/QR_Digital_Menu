import { Test } from '@nestjs/testing';
import { PrintStationService } from './print-station.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { ConflictException, NotFoundException } from '@nestjs/common';

const mockPrisma = {
  printStation: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  printAgentToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  printJob: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  order: { findUnique: jest.fn() },
};

const mockEvents = {
  emitPrintJob: jest.fn().mockReturnValue(true),
  disconnectAgentByTokenId: jest.fn().mockResolvedValue(undefined),
};

describe('PrintStationService', () => {
  let service: PrintStationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PrintStationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsGateway, useValue: mockEvents },
      ],
    }).compile();
    service = module.get(PrintStationService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('throws ConflictException when name already exists', async () => {
      mockPrisma.printStation.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.create('r1', { name: 'Kitchen', printerIp: '192.168.1.1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates station with default port 9100', async () => {
      mockPrisma.printStation.findUnique.mockResolvedValue(null);
      mockPrisma.printStation.create.mockResolvedValue({
        id: 'new',
        name: 'Kitchen',
        printerPort: 9100,
      });
      const result = await service.create('r1', {
        name: 'Kitchen',
        printerIp: '192.168.1.1',
      });
      expect(result.printerPort).toBe(9100);
    });
  });

  describe('routeOrderToPrinters', () => {
    it('does nothing when order has no items', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order_empty',
        restaurantId: 'r1',
        tableName: 'T1',
        customerName: 'C1',
        items: [],
      });
      await service.routeOrderToPrinters('order_empty');
      expect(mockPrisma.printJob.create).not.toHaveBeenCalled();
    });

    it('creates PrintJob and emits when agent connected', async () => {
      mockEvents.emitPrintJob.mockReturnValue(true);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order123',
        restaurantId: 'r1',
        tableName: 'T5',
        customerName: 'Alice',
        items: [
          {
            quantity: 2,
            menuItem: {
              name: 'Burger',
              category: {
                printStation: {
                  id: 'station1',
                  name: 'Kitchen',
                  isActive: true,
                },
              },
            },
            selectedOptions: [],
          },
        ],
      });
      mockPrisma.printJob.create.mockResolvedValue({
        id: 'job1',
        ticketBase64: 'abc',
      });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.routeOrderToPrinters('order123');

      expect(mockPrisma.printJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'SENT' }),
        }),
      );
    });

    it('leaves job as PENDING when no agent connected', async () => {
      mockEvents.emitPrintJob.mockReturnValue(false);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order456',
        restaurantId: 'r1',
        tableName: null,
        customerName: 'Bob',
        items: [
          {
            quantity: 1,
            menuItem: {
              name: 'Salad',
              category: {
                printStation: {
                  id: 'station1',
                  name: 'Kitchen',
                  isActive: true,
                },
              },
            },
            selectedOptions: [],
          },
        ],
      });
      mockPrisma.printJob.create.mockResolvedValue({
        id: 'job2',
        ticketBase64: 'xyz',
      });

      await service.routeOrderToPrinters('order456');

      expect(mockPrisma.printJob.update).not.toHaveBeenCalled();
    });

    it('skips items with no station assigned', async () => {
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order789',
        restaurantId: 'r1',
        tableName: null,
        customerName: 'Eve',
        items: [
          {
            quantity: 1,
            menuItem: { name: 'Water', category: { printStation: null } },
            selectedOptions: [],
          },
        ],
      });

      await service.routeOrderToPrinters('order789');
      expect(mockPrisma.printJob.create).not.toHaveBeenCalled();
    });
  });

  describe('handlePrintAck', () => {
    it('sets status to PRINTED on success', async () => {
      mockPrisma.printJob.findFirst.mockResolvedValue({
        id: 'j1',
        attempts: 1,
      });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck(
        'j1',
        true,
        undefined,
        'station-1',
        'rest-1',
      );

      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PRINTED' }),
        }),
      );
    });

    it('sets status to FAILED when max attempts reached', async () => {
      mockPrisma.printJob.findFirst.mockResolvedValue({
        id: 'j2',
        attempts: 3,
      });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck(
        'j2',
        false,
        'connection refused',
        'station-1',
        'rest-1',
      );

      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('sets status back to PENDING for retry when under max attempts', async () => {
      mockPrisma.printJob.findFirst.mockResolvedValue({
        id: 'j3',
        attempts: 1,
      });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck(
        'j3',
        false,
        'timeout',
        'station-1',
        'rest-1',
      );

      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('silently ignores ack for a job that does not belong to the station (IDOR guard)', async () => {
      mockPrisma.printJob.findFirst.mockResolvedValue(null);

      await service.handlePrintAck(
        'j-other',
        true,
        undefined,
        'station-1',
        'rest-1',
      );

      expect(mockPrisma.printJob.update).not.toHaveBeenCalled();
    });
  });

  describe('retryPendingJobs', () => {
    it('leaves job as PENDING if agent connection drops (emit fails)', async () => {
      mockEvents.emitPrintJob.mockReturnValue(false); // Connection dropped
      mockPrisma.printJob.findMany.mockResolvedValue([
        { id: 'job1', ticketBase64: 'abc', attempts: 0, status: 'PENDING' },
      ]);
      await service.retryPendingJobs('r1', 'station1');
      expect(mockPrisma.printJob.update).not.toHaveBeenCalled();
    });
  });

  describe('retryStuckPrintJobs', () => {
    it('retries distinct stations with pending or stale sent jobs', async () => {
      mockPrisma.printJob.findMany.mockResolvedValue([
        { restaurantId: 'r1', printStationId: 'station-1' },
        { restaurantId: 'r2', printStationId: 'station-2' },
      ]);
      const retrySpy = jest
        .spyOn(service, 'retryPendingJobs')
        .mockResolvedValue(undefined);

      await service.retryStuckPrintJobs();

      expect(mockPrisma.printJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            printStationId: { not: null },
            attempts: { lt: 3 },
            OR: [
              { status: 'PENDING' },
              { status: 'SENT', lastAttemptAt: { lt: expect.any(Date) } },
            ],
          }),
          select: { restaurantId: true, printStationId: true },
          distinct: ['restaurantId', 'printStationId'],
        }),
      );
      expect(retrySpy).toHaveBeenCalledWith('r1', 'station-1');
      expect(retrySpy).toHaveBeenCalledWith('r2', 'station-2');
    });
  });

  describe('revokeToken', () => {
    it('throws NotFoundException when token not in restaurant', async () => {
      mockPrisma.printAgentToken.findFirst.mockResolvedValue(null);
      await expect(service.revokeToken('r1', 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('awaits live agent eviction after deleting a token', async () => {
      mockPrisma.printAgentToken.findFirst.mockResolvedValue({
        id: 'token-1',
        restaurantId: 'r1',
        printStationId: 'station-1',
      });
      mockPrisma.printAgentToken.delete.mockResolvedValue({});

      await service.revokeToken('r1', 'token-1');

      expect(mockPrisma.printAgentToken.delete).toHaveBeenCalledWith({
        where: { id: 'token-1' },
      });
      expect(mockEvents.disconnectAgentByTokenId).toHaveBeenCalledWith(
        'r1',
        'station-1',
        'token-1',
      );
    });
  });

  describe('generateToken', () => {
    it('generates a token and saves its hash', async () => {
      mockPrisma.printStation.findUnique.mockResolvedValue({
        id: 'station-1',
        restaurantId: 'r1',
      });
      mockPrisma.printAgentToken.create.mockResolvedValue({
        id: 'token-1',
        restaurantId: 'r1',
        printStationId: 'station-1',
        label: 'My Token',
      });

      const result = await service.generateToken('r1', 'station-1', 'My Token');

      expect(result).toHaveProperty('token');
      expect(mockPrisma.printAgentToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          restaurantId: 'r1',
          printStationId: 'station-1',
          label: 'My Token',
          tokenHash: expect.any(String),
        }),
        select: expect.any(Object),
      });
    });
  });

  describe('remove', () => {
    it('throws ConflictException if there are active print jobs', async () => {
      mockPrisma.printStation.findUnique.mockResolvedValue({
        id: 'station-1',
        restaurantId: 'r1',
      });
      mockPrisma.printJob.count.mockResolvedValue(2);

      await expect(service.remove('r1', 'station-1')).rejects.toThrow(
        ConflictException,
      );
      expect(mockPrisma.printJob.count).toHaveBeenCalledWith({
        where: {
          printStationId: 'station-1',
          status: { in: ['PENDING', 'SENT'] },
        },
      });
    });

    it('deletes the print station if no active jobs exist', async () => {
      mockPrisma.printStation.findUnique.mockResolvedValue({
        id: 'station-1',
        restaurantId: 'r1',
      });
      mockPrisma.printJob.count.mockResolvedValue(0);
      mockPrisma.printStation.delete.mockResolvedValue({});

      await service.remove('r1', 'station-1');

      expect(mockPrisma.printStation.delete).toHaveBeenCalledWith({
        where: { id: 'station-1' },
      });
    });
  });

  describe('getJobs', () => {
    it('returns jobs filtered by status', async () => {
      mockPrisma.printStation.findUnique.mockResolvedValue({
        id: 'station-1',
        restaurantId: 'r1',
      });
      mockPrisma.printJob.findMany.mockResolvedValue([
        { id: 'job1', status: 'PRINTED' },
      ]);
      const result = await service.getJobs('r1', 'station-1', 'PRINTED');
      expect(mockPrisma.printJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            restaurantId: 'r1',
            printStationId: 'station-1',
            status: 'PRINTED',
          },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('getStationHealth', () => {
    it('returns station health including status counts', async () => {
      mockPrisma.printStation.findMany.mockResolvedValue([
        {
          id: 's1',
          name: 'Bar',
          isActive: true,
          agentTokens: [{ lastSeenAt: new Date('2026-07-08T10:00:00Z') }],
          _count: { printJobs: 5 },
          printJobs: [
            { status: 'FAILED', createdAt: new Date() },
            { status: 'PRINTED', createdAt: new Date() },
          ],
        },
      ]);
      const result = await service.getStationHealth('r1');
      expect(result).toHaveLength(1);
      expect(result[0].pending).toBe(5);
      expect(result[0].failed).toBe(1);
      expect(result[0].isActive).toBe(true);
      expect(result[0].lastSeen).toEqual(new Date('2026-07-08T10:00:00Z'));
    });
  });
});
