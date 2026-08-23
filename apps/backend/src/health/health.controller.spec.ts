import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  const mockPrisma = { $queryRaw: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('check (liveness)', () => {
    it('should return ok status with timestamp', () => {
      const result = controller.check();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(new Date(result.timestamp).getTime()).not.toBeNaN();
    });

    // Liveness answers "is this process still running", nothing more. It must
    // stay dependency-free: if it failed during a database outage, Cloud Run
    // would restart every container at once and turn a recoverable outage into
    // a restart storm against an already-struggling database.
    it('does not touch the database', () => {
      controller.check();

      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('ready (readiness)', () => {
    it('reports ok when the database answers', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([{ ok: 1 }]);

      const result = await controller.ready();

      expect(result.status).toBe('ok');
      expect(result.checks.database).toBe('ok');
      expect(mockPrisma.$queryRaw).toHaveBeenCalled();
    });

    // The whole point. On 23 Aug 2026 the database was unreachable for roughly
    // five hours while /health returned 200 the entire time, so nothing alerted.
    // Readiness has to fail when a dependency is down.
    it('fails with 503 when the database is unreachable', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(
        new Error("Can't reach database server"),
      );

      await expect(controller.ready()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    // A hung connection is not the same as a refused one: without its own
    // deadline the probe hangs until the caller gives up, which reads as a
    // network timeout rather than "this instance is wedged".
    it('fails rather than hanging when the database never answers', async () => {
      jest.useFakeTimers();
      mockPrisma.$queryRaw.mockImplementation(() => new Promise(() => {}));

      const pending = controller.ready();
      const assertion = expect(pending).rejects.toThrow(
        ServiceUnavailableException,
      );
      await jest.advanceTimersByTimeAsync(6000);
      await assertion;

      jest.useRealTimers();
    });

    // This endpoint is unauthenticated so an uptime monitor can poll it. A
    // driver error carries the host, user and sometimes the query — none of
    // which belongs in a public response.
    it('never leaks the underlying database error', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(
        new Error(
          "Can't reach database server at postgres.abc:hunter2@db.internal:5432",
        ),
      );

      await expect(controller.ready()).rejects.toMatchObject({
        response: expect.objectContaining({
          checks: { database: 'unavailable' },
        }),
      });
      await expect(controller.ready()).rejects.not.toThrow(/hunter2/);
    });
  });
});
