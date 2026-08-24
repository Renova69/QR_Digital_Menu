import { Test } from '@nestjs/testing';
import { PrintStationService } from './print-station.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FeatureService } from '../subscription/feature.service';

const mockPrisma: any = {
  printStation: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  printAgentToken: {
    create: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  printJob: {
    create: jest.fn(),
    upsert: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  order: { findUnique: jest.fn(), findMany: jest.fn() },
  restaurant: { findUnique: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn((operation: any) =>
    Array.isArray(operation) ? Promise.all(operation) : operation(mockPrisma),
  ),
};

const mockEvents = {
  findPrintAgentToken: jest.fn().mockResolvedValue('agent-token-1'),
  emitPrintJob: jest.fn().mockReturnValue(true),
  disconnectAgentByTokenId: jest.fn().mockResolvedValue(undefined),
  listConnectedAgentTokenIds: jest.fn().mockResolvedValue([]),
};

const mockFeatureService = {
  restaurantHasFeature: jest.fn().mockReturnValue(true),
};

describe('PrintStationService', () => {
  let service: PrintStationService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PrintStationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventsGateway, useValue: mockEvents },
        { provide: FeatureService, useValue: mockFeatureService },
      ],
    }).compile();
    service = module.get(PrintStationService);
    jest.clearAllMocks();
    mockEvents.emitPrintJob.mockResolvedValue(true);
    mockEvents.findPrintAgentToken.mockResolvedValue('agent-token-1');
    mockFeatureService.restaurantHasFeature.mockReturnValue(true);
    mockPrisma.restaurant.findUnique.mockResolvedValue({
      tier: 'ENTERPRISE',
      forceTier: null,
    });
    mockPrisma.$queryRaw.mockResolvedValue([{ id: 'station-1' }]);
    mockPrisma.printAgentToken.count.mockResolvedValue(0);
    mockPrisma.printAgentToken.update.mockResolvedValue({});
    mockPrisma.printJob.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.printJob.findMany.mockResolvedValue([]);
    mockPrisma.order.findMany.mockResolvedValue([]);
    mockPrisma.printJob.upsert.mockImplementation(
      ({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'job-upserted',
          lastAttemptAt: null,
          assignedAgentTokenId: null,
          outcomeUncertain: false,
          ...create,
        }),
    );
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
    it('does nothing when the restaurant tier lacks thermal printers', async () => {
      mockFeatureService.restaurantHasFeature.mockReturnValue(false);
      mockPrisma.order.findUnique.mockResolvedValue({
        id: 'order_locked',
        restaurantId: 'r1',
        restaurant: { tier: 'PROFESSIONAL', forceTier: null },
        items: [{ quantity: 1, menuItem: null }],
      });

      await service.routeOrderToPrinters('order_locked');

      expect(mockPrisma.printJob.create).not.toHaveBeenCalled();
    });

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

      expect(mockPrisma.printJob.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'PENDING' }),
          update: {},
        }),
      );
      expect(mockPrisma.printJob.updateMany).toHaveBeenCalledWith(
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

  describe('validateAgentToken', () => {
    it('rejects an otherwise valid agent token after an Enterprise downgrade', async () => {
      mockFeatureService.restaurantHasFeature.mockReturnValue(false);
      mockPrisma.printAgentToken.findUnique.mockResolvedValue({
        id: 'token-1',
        restaurant: { tier: 'PROFESSIONAL', forceTier: null },
        printStation: { id: 'station-1', isActive: true },
      });

      await expect(service.validateAgentToken('secret')).resolves.toBeNull();
    });

    // A quarantined token belongs to a device nobody has seen in months --
    // lost, replaced or decommissioned. It must stop being a credential.
    it('rejects a quarantined token', async () => {
      mockFeatureService.restaurantHasFeature.mockReturnValue(true);
      mockPrisma.printAgentToken.findUnique.mockResolvedValue({
        id: 'token-1',
        quarantinedAt: new Date('2026-01-01'),
        restaurant: { tier: 'ENTERPRISE', forceTier: null },
        printStation: { id: 'station-1', isActive: true },
      });

      await expect(service.validateAgentToken('secret')).resolves.toBeNull();
    });

    // Only quarantine blocks. A warning is a nudge to the owner, never an
    // interruption to printing -- that distinction is the whole design.
    it('still accepts a token that is merely warned as stale', async () => {
      mockFeatureService.restaurantHasFeature.mockReturnValue(true);
      mockPrisma.printAgentToken.findUnique.mockResolvedValue({
        id: 'token-1',
        staleWarnedAt: new Date('2026-01-01'),
        quarantinedAt: null,
        restaurant: { tier: 'ENTERPRISE', forceTier: null },
        printStation: { id: 'station-1', isActive: true },
      });

      await expect(
        service.validateAgentToken('secret'),
      ).resolves.not.toBeNull();
    });

    // Reconnecting proves the device is alive, so a warning must not persist
    // and quietly mature into a quarantine.
    it('clears a staleness warning when the agent reconnects', async () => {
      mockFeatureService.restaurantHasFeature.mockReturnValue(true);
      mockPrisma.printAgentToken.findUnique.mockResolvedValue({
        id: 'token-1',
        staleWarnedAt: new Date('2026-01-01'),
        quarantinedAt: null,
        restaurant: { tier: 'ENTERPRISE', forceTier: null },
        printStation: { id: 'station-1', isActive: true },
      });

      await service.validateAgentToken('secret');

      expect(mockPrisma.printAgentToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-1' },
          data: { staleWarnedAt: null },
        }),
      );
    });
  });

  describe('retireStalePrintAgents', () => {
    // A station can hold a live socket for months without ever printing -- a
    // quiet counter, or one with no categories assigned. lastSeenAt only moved
    // on connect and on a successful print, so such an agent would be
    // quarantined while demonstrably connected.
    it('refreshes currently connected agents before judging staleness', async () => {
      mockEvents.listConnectedAgentTokenIds.mockResolvedValue(['live-1']);
      mockPrisma.printAgentToken.updateMany.mockResolvedValue({ count: 0 });

      await service.retireStalePrintAgents();

      expect(mockPrisma.printAgentToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['live-1'] } },
          data: expect.objectContaining({ lastSeenAt: expect.any(Date) }),
        }),
      );
    });

    // Grace is a property of each token, not a date in this file. A token is
    // only ever quarantined once its own window has opened, so every
    // environment -- staging, a fresh self-host, a restore -- gets a correct
    // timeline instead of inheriting one that began before its data existed.
    it('only quarantines tokens whose own grace window has opened', async () => {
      mockEvents.listConnectedAgentTokenIds.mockResolvedValue([]);
      mockPrisma.printAgentToken.updateMany.mockResolvedValue({ count: 0 });

      const now = new Date('2027-06-01T00:00:00Z');
      await service.retireStalePrintAgents(now);

      const quarantineCall =
        mockPrisma.printAgentToken.updateMany.mock.calls.find(
          (c: any) => c[0].data.quarantinedAt instanceof Date,
        );
      expect(quarantineCall[0].where.stalenessEnforcedAt).toEqual({
        not: null,
        lte: now,
      });
    });

    // NULL only happens for rows created between the deploy and the backfill.
    // A token whose grace window is unknown must never be revoked.
    it('never quarantines a token with no recorded grace window', async () => {
      mockEvents.listConnectedAgentTokenIds.mockResolvedValue([]);
      mockPrisma.printAgentToken.updateMany.mockResolvedValue({ count: 0 });

      await service.retireStalePrintAgents(new Date('2027-06-01T00:00:00Z'));

      const quarantineCall =
        mockPrisma.printAgentToken.updateMany.mock.calls.find(
          (c: any) => c[0].data.quarantinedAt instanceof Date,
        );
      expect(quarantineCall[0].where.stalenessEnforcedAt.not).toBeNull();
    });

    // Warnings are advisory and never block, so they are safe from day one --
    // and they are what gives an owner notice before enforcement begins.
    it('still warns during the rollout grace period', async () => {
      mockEvents.listConnectedAgentTokenIds.mockResolvedValue([]);
      mockPrisma.printAgentToken.updateMany.mockResolvedValue({ count: 0 });

      await service.retireStalePrintAgents(new Date('2026-09-01T00:00:00Z'));

      const warnCall = mockPrisma.printAgentToken.updateMany.mock.calls.find(
        (c: any) => c[0].data.staleWarnedAt instanceof Date,
      );
      expect(warnCall).toBeDefined();
    });

    it('quarantines once the grace period has passed', async () => {
      mockEvents.listConnectedAgentTokenIds.mockResolvedValue([]);
      mockPrisma.printAgentToken.updateMany.mockResolvedValue({ count: 1 });

      await service.retireStalePrintAgents(new Date('2027-06-01T00:00:00Z'));

      const quarantineCall =
        mockPrisma.printAgentToken.updateMany.mock.calls.find(
          (c: any) => c[0].data.quarantinedAt instanceof Date,
        );
      expect(quarantineCall).toBeDefined();
    });
  });

  describe('reactivateAgentToken', () => {
    // A quarantined agent that comes back must have a way home that does not
    // require re-flashing the device.
    it('clears quarantine and staleness for the owning restaurant', async () => {
      mockPrisma.printAgentToken.findFirst.mockResolvedValue({
        id: 'token-1',
        restaurantId: 'rest-1',
      });
      mockPrisma.printAgentToken.update.mockResolvedValue({ id: 'token-1' });

      await service.reactivateAgentToken('rest-1', 'token-1');

      expect(mockPrisma.printAgentToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-1' },
          data: expect.objectContaining({
            quarantinedAt: null,
            staleWarnedAt: null,
          }),
        }),
      );
    });

    it('refuses a token belonging to another restaurant', async () => {
      mockPrisma.printAgentToken.findFirst.mockResolvedValue(null);

      await expect(
        service.reactivateAgentToken('rest-1', 'token-of-other'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('retireStalePrintAgents windows', () => {
    beforeEach(() => {
      mockEvents.listConnectedAgentTokenIds.mockResolvedValue([]);
    });

    it('warns tokens unseen past the warning window', async () => {
      mockPrisma.printAgentToken.updateMany.mockResolvedValue({ count: 2 });

      await service.retireStalePrintAgents();

      const warnCall = mockPrisma.printAgentToken.updateMany.mock.calls.find(
        (c: any) => c[0].data.staleWarnedAt instanceof Date,
      );
      expect(warnCall).toBeDefined();
      expect(warnCall[0].where).toMatchObject({
        staleWarnedAt: null,
        quarantinedAt: null,
      });
    });

    it('quarantines tokens unseen past the quarantine window', async () => {
      mockPrisma.printAgentToken.updateMany.mockResolvedValue({ count: 1 });

      // Past the rollout grace period, or quarantine is suppressed by design.
      await service.retireStalePrintAgents(new Date('2027-06-01T00:00:00Z'));

      const quarantineCall =
        mockPrisma.printAgentToken.updateMany.mock.calls.find(
          (c: any) => c[0].data.quarantinedAt instanceof Date,
        );
      expect(quarantineCall).toBeDefined();
      expect(quarantineCall[0].where.quarantinedAt).toBeNull();
    });

    // A token that has never connected has no lastSeenAt. Its age must be
    // judged from createdAt, or a token issued and never used would sit
    // untouched forever -- exactly the credential worth retiring.
    it('judges a never-connected token by when it was created', async () => {
      mockPrisma.printAgentToken.updateMany.mockResolvedValue({ count: 0 });

      await service.retireStalePrintAgents();

      const call = mockPrisma.printAgentToken.updateMany.mock.calls[0][0];
      expect(JSON.stringify(call.where)).toContain('createdAt');
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
        'token-1',
        'delivery-1',
      );

      expect(mockPrisma.printJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ claimToken: 'delivery-1' }),
          data: expect.objectContaining({ status: 'PRINTED' }),
        }),
      );
    });

    it('sets status to FAILED when max attempts reached', async () => {
      mockPrisma.printJob.findFirst.mockResolvedValue({
        id: 'j2',
        attempts: 3,
        status: 'SENT',
        claimToken: 'delivery-2',
      });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck(
        'j2',
        false,
        'connection refused',
        'station-1',
        'rest-1',
        undefined,
        'delivery-2',
      );

      expect(mockPrisma.printJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' }),
        }),
      );
    });

    it('sets status back to PENDING for retry when under max attempts', async () => {
      mockPrisma.printJob.findFirst.mockResolvedValue({
        id: 'j3',
        attempts: 1,
        status: 'SENT',
        claimToken: 'delivery-3',
      });
      mockPrisma.printJob.update.mockResolvedValue({});

      await service.handlePrintAck(
        'j3',
        false,
        'timeout',
        'station-1',
        'rest-1',
        undefined,
        'delivery-3',
      );

      expect(mockPrisma.printJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('releases the device pin on a retryable NACK so the retry is not stuck on the same agent', async () => {
      // Regression: an explicit NACK means the assigned agent itself
      // confirms it did not print — there is no duplicate-print ambiguity,
      // so the pin can be released. Without this, a lost/replaced device
      // would keep findPrintAgentToken() returning null forever.
      mockPrisma.printJob.findFirst.mockResolvedValue({
        id: 'j4',
        attempts: 1,
        status: 'SENT',
        claimToken: 'delivery-4',
      });

      await service.handlePrintAck(
        'j4',
        false,
        'printer offline',
        'station-1',
        'rest-1',
        'agent-token-1',
        'delivery-4',
      );

      expect(mockPrisma.printJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            assignedAgentTokenId: null,
          }),
        }),
      );
    });

    it('does not touch the device pin when the NACK is a permanent failure', async () => {
      mockPrisma.printJob.findFirst.mockResolvedValue({
        id: 'j5',
        attempts: 3,
        status: 'SENT',
        claimToken: 'delivery-5',
      });

      await service.handlePrintAck(
        'j5',
        false,
        'connection refused',
        'station-1',
        'rest-1',
        'agent-token-1',
        'delivery-5',
      );

      const call = mockPrisma.printJob.updateMany.mock.calls.find(
        ([args]: any) => args.data.status === 'FAILED',
      );
      expect(call[0].data).not.toHaveProperty('assignedAgentTokenId');
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

    it('marks an uncertain printer outcome permanently failed and visible', async () => {
      mockPrisma.printJob.findFirst.mockResolvedValue({
        id: 'j-uncertain',
        attempts: 1,
        status: 'SENT',
        claimToken: 'delivery-1',
      });

      await service.handlePrintAck(
        'j-uncertain',
        false,
        'printing may have started',
        'station-1',
        'rest-1',
        'token-1',
        'delivery-1',
        false,
      );

      expect(mockPrisma.printJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ claimToken: 'delivery-1' }),
          data: expect.objectContaining({
            status: 'FAILED',
            errorMessage: 'printing may have started',
          }),
        }),
      );
    });
  });

  describe('retryPendingJobs', () => {
    it('does not retry queued jobs after an Enterprise downgrade', async () => {
      mockFeatureService.restaurantHasFeature.mockReturnValue(false);

      await service.retryPendingJobs('r1', 'station1');

      expect(mockPrisma.printJob.findMany).not.toHaveBeenCalled();
      expect(mockEvents.emitPrintJob).not.toHaveBeenCalled();
    });

    it('leaves job as PENDING if agent connection drops (emit fails)', async () => {
      mockEvents.emitPrintJob.mockReturnValue(false); // Connection dropped
      mockPrisma.printJob.findMany.mockResolvedValue([
        {
          id: 'job1',
          restaurantId: 'r1',
          printStationId: 'station1',
          ticketBase64: 'abc',
          attempts: 0,
          status: 'PENDING',
          lastAttemptAt: null,
        },
      ]);
      await service.retryPendingJobs('r1', 'station1');
      expect(mockPrisma.printJob.updateMany).toHaveBeenCalledTimes(3);
      expect(mockPrisma.printJob.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: { assignedAgentTokenId: 'agent-token-1' },
        }),
      );
      expect(mockPrisma.printJob.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: { claimToken: null, claimExpiresAt: null },
        }),
      );
    });

    it('does not emit when another worker wins the durable claim', async () => {
      mockPrisma.printJob.findMany.mockResolvedValue([
        {
          id: 'job1',
          restaurantId: 'r1',
          printStationId: 'station1',
          ticketBase64: 'abc',
          attempts: 0,
          status: 'PENDING',
          lastAttemptAt: null,
        },
      ]);
      mockPrisma.printJob.updateMany.mockResolvedValueOnce({ count: 0 });

      await service.retryPendingJobs('r1', 'station1');

      expect(mockEvents.emitPrintJob).not.toHaveBeenCalled();
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
            createdAt: { gte: expect.any(Date) },
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

    it('expires pending jobs by wall-clock age without consuming fake attempts', async () => {
      mockPrisma.printJob.findMany.mockResolvedValue([]);

      await service.retryStuckPrintJobs();

      expect(mockPrisma.printJob.updateMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: {
            status: 'PENDING',
            createdAt: { lt: expect.any(Date) },
          },
          data: {
            status: 'FAILED',
            outcomeUncertain: false,
            errorMessage: 'Print job expired before a delivery was confirmed',
          },
        }),
      );
      expect(mockPrisma.printJob.updateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: {
            status: 'SENT',
            createdAt: { lt: expect.any(Date) },
          },
          data: expect.objectContaining({
            status: 'FAILED',
            outcomeUncertain: true,
          }),
        }),
      );
    });

    it('logs and ends the cycle when the station retry query fails', async () => {
      mockPrisma.printJob.findMany.mockRejectedValue(
        new Error('database down'),
      );
      const loggerError = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation();

      await expect(service.retryStuckPrintJobs()).resolves.toBeUndefined();

      expect(loggerError).toHaveBeenCalledWith(
        'Failed to load print stations needing retries',
        expect.objectContaining({ message: 'database down' }),
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
      mockPrisma.printAgentToken.create.mockResolvedValue({
        id: 'token-1',
        restaurantId: 'r1',
        printStationId: 'station-1',
        label: 'My Token',
      });

      const result = await service.generateToken('r1', 'station-1', 'My Token');

      expect(result).toHaveProperty('token');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.printAgentToken.count).toHaveBeenCalledWith({
        where: { printStationId: 'station-1' },
      });
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

    it('rejects token creation when a station already has five tokens', async () => {
      mockPrisma.printAgentToken.count.mockResolvedValue(5);

      await expect(
        service.generateToken('r1', 'station-1', 'Sixth token'),
      ).rejects.toThrow(ConflictException);
      expect(mockPrisma.printAgentToken.create).not.toHaveBeenCalled();
    });

    it('rejects token creation when the locked station is outside the tenant', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await expect(
        service.generateToken('r1', 'station-other'),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.printAgentToken.count).not.toHaveBeenCalled();
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

  describe('retryFailedJob', () => {
    it('releases the device pin as part of the operator retry override', async () => {
      // Regression: without clearing assignedAgentTokenId here, an
      // operator retrying a job whose device was lost/replaced would have
      // no way to get it un-stuck — findPrintAgentToken() only matches
      // sockets with the exact pinned agentTokenId.
      mockPrisma.printStation.findUnique.mockResolvedValue({
        id: 'station-1',
        restaurantId: 'r1',
      });
      mockPrisma.printJob.findFirst.mockResolvedValue({
        status: 'FAILED',
        outcomeUncertain: false,
        orderId: 'order-1',
      });
      mockPrisma.printJob.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.order.findUnique.mockResolvedValue(null);

      await service.retryFailedJob('r1', 'station-1', 'job-1');

      expect(mockPrisma.printJob.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'job-1', status: 'FAILED' }),
          data: expect.objectContaining({
            status: 'PENDING',
            assignedAgentTokenId: null,
          }),
        }),
      );
    });

    it('refuses to retry a job whose printer outcome is still uncertain', async () => {
      mockPrisma.printStation.findUnique.mockResolvedValue({
        id: 'station-1',
        restaurantId: 'r1',
      });
      mockPrisma.printJob.findFirst.mockResolvedValue({
        status: 'FAILED',
        outcomeUncertain: true,
        orderId: 'order-1',
      });

      await expect(
        service.retryFailedJob('r1', 'station-1', 'job-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mockPrisma.printJob.updateMany).not.toHaveBeenCalled();
    });
  });
});
