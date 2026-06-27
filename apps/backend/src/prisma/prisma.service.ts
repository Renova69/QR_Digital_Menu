import {
  INestApplication,
  Injectable,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { setTimeout as sleep } from 'timers/promises';

function jitteredDelay(attempt: number, baseMs = 500, maxMs = 30_000): number {
  const exp = Math.min(baseMs * 2 ** attempt, maxMs);
  return exp * (0.5 + Math.random() * 0.5); // 50–100% of exponential cap
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: ['warn', 'error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  }

  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  async onModuleInit() {
    const isDev = process.env.NODE_ENV !== 'production';
    const maxRetries = isDev ? 8 : 15;
    const baseMs = isDev ? 200 : 1_000;
    const maxMs = isDev ? 2_000 : 30_000;

    for (let i = 0; i < maxRetries; i++) {
      const t0 = Date.now();
      try {
        await this.$connect();
        this.logger.log(
          `Connected to database (attempt ${i + 1}, ${Date.now() - t0}ms)`,
        );
        this.startKeepAlive();
        await this.ensureCriticalIndexes();
        return;
      } catch (error) {
        const duration = Date.now() - t0;
        const code =
          (error as Record<string, unknown>)?.code ??
          (error as Record<string, unknown>)?.errorCode ??
          'UNKNOWN';
        const delay = jitteredDelay(i, baseMs, maxMs);
        this.logger.warn(
          `DB connection attempt ${i + 1}/${maxRetries} failed [${code}] after ${duration}ms — retrying in ${Math.round(delay)}ms`,
        );
        if (i === maxRetries - 1) {
          this.logger.error(
            'Failed to connect to database after maximum retries',
          );
          throw error;
        }
        await sleep(delay);
      }
    }
  }

  /**
   * Ping Neon every 4 minutes to prevent scale-to-zero cold starts.
   * Neon suspends compute after 5 min of inactivity on free tier.
   * Silent failure — keep-alive is best-effort, not critical.
   */
  private startKeepAlive(): void {
    const INTERVAL_MS = 4 * 60 * 1000; // 4 min (Neon suspends at 5 min)
    this.keepAliveTimer = setInterval(async () => {
      try {
        await this.$executeRawUnsafe('SELECT 1');
      } catch {
        // best-effort — silence failures
      }
    }, INTERVAL_MS);
    this.logger.log(
      `Neon keep-alive started (ping every ${INTERVAL_MS / 60_000}min)`,
    );
  }

  /**
   * Ensure DB-level invariants that Prisma's schema cannot express. The
   * one-OPEN-session-per-table partial unique index uses a `WHERE status =
   * 'OPEN'` predicate, which `@@unique` does not support — so it lives only in
   * raw migration SQL and would be missed by `prisma db push` deploys. The
   * concurrent-session race guard in PaymentService relies on it (catches
   * P2002), so we (re)create it idempotently at boot. `IF NOT EXISTS` matches by
   * index name, making this a no-op wherever it already exists. A failure here
   * (e.g. pre-existing duplicate OPEN rows block creation) is logged loudly but
   * must not crash the service — the rest of the app stays available.
   */
  private async ensureCriticalIndexes(): Promise<void> {
    try {
      await this.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "table_session_one_open_per_table_restaurant_idx" ` +
          `ON "table_session" ("restaurantId", "tableId") WHERE "status" = 'OPEN'`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to ensure one-open-session-per-table unique index. ' +
          'The concurrent-session race guard is NOT enforced until this is resolved ' +
          '(likely duplicate OPEN sessions already exist).',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async onModuleDestroy() {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  async enableShutdownHooks(app: INestApplication) {
    process.on('SIGINT', async () => {
      await app.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await app.close();
      process.exit(0);
    });
  }
}
