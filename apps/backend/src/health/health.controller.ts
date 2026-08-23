import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

/**
 * A database that has stopped answering must not be allowed to look healthy.
 *
 * On 23 Aug 2026 the database was unreachable for roughly five hours while this
 * controller returned 200 the whole time, because it never touched one. The
 * outage was found by hand. Splitting the two probes is what makes an automated
 * monitor able to tell the difference.
 */
const DATABASE_PROBE_TIMEOUT_MS = 5_000;

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liveness: is this process still running and able to serve?
   *
   * Deliberately dependency-free. If this failed during a database outage,
   * Cloud Run would restart every container at once and turn a recoverable
   * outage into a restart storm against an already-struggling database. Point
   * container liveness probes here, and uptime monitoring at /health/ready.
   */
  @Get()
  @SkipThrottle()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness: can this instance actually do its job?
   *
   * Returns 503 when a dependency it cannot work without is unavailable, which
   * is the signal an uptime monitor should alert on.
   */
  @Get('ready')
  @SkipThrottle()
  async ready() {
    const timestamp = new Date().toISOString();
    try {
      await this.probeDatabase();
    } catch (error) {
      // Logged in full server-side; never returned. This endpoint is
      // unauthenticated so a monitor can poll it, and driver errors carry the
      // host, the user and sometimes the query itself.
      this.logger.error(
        `Readiness probe failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { database: 'unavailable' },
        timestamp,
      });
    }

    return { status: 'ok', checks: { database: 'ok' }, timestamp };
  }

  /**
   * `SELECT 1` with its own deadline. A hung connection is a different failure
   * from a refused one, and without a timeout the probe simply never returns —
   * the monitor records a network timeout instead of "this instance is wedged",
   * which is precisely the distinction the probe exists to make.
   */
  private async probeDatabase(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.prisma.$queryRaw`SELECT 1`,
        new Promise((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `database did not answer within ${DATABASE_PROBE_TIMEOUT_MS}ms`,
                ),
              ),
            DATABASE_PROBE_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      // Without this the timer keeps the event loop busy for the full timeout
      // on every successful probe — once a minute, forever.
      if (timer) clearTimeout(timer);
    }
  }
}
