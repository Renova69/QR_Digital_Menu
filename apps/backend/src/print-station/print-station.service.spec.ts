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
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
  },
  order: { findUnique: jest.fn() },
};

const mockEvents = { emitPrintJob: jest.fn().mockReturnValue(true) };

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
                printStation: { id: 'station1', name: 'Kitchen', isActive: true },
              },
            },
            selectedOptions: [],
          },
        ],
      });
      mockPrisma.printJob.create.mockResolvedValue({ id: 'job1', ticketBase64: 'abc' });
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
                printStation: { id: 'station1', name: 'Kitchen', isActive: true },
              },
            },
            selectedOptions: [],
          },
        ],
      });
      mockPrisma.printJob.create.mockResolvedValue({ id: 'job2', ticketBase64: 'xyz' });

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
      mockPrisma.printJob.findUnique.mockResolvedValue({ id: 'j1', attempts: 1 });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck('j1', true);

      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PRINTED' }),
        }),
      );
    });

    it('sets status to FAILED when max attempts reached', async () => {
      mockPrisma.printJob.findUnique.mockResolvedValue({ id: 'j2', attempts: 3 });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck('j2', false, 'connection refused');

      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('sets status back to PENDING for retry when under max attempts', async () => {
      mockPrisma.printJob.findUnique.mockResolvedValue({ id: 'j3', attempts: 1 });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck('j3', false, 'timeout');

      expect(mockPrisma.printJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });
  });

  describe('revokeToken', () => {
    it('throws NotFoundException when token not in restaurant', async () => {
      mockPrisma.printAgentToken.findFirst.mockResolvedValue(null);
      await expect(service.revokeToken('r1', 'bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
