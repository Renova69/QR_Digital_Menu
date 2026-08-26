import {
  Logger,
  type OnApplicationShutdown,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import * as Sentry from '@sentry/nestjs';
import {
  ThrottlerStorageService,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import type { RedisOptions } from 'ioredis';

const REDIS_OUTAGE_REPORT_INTERVAL_MS = 15 * 60_000;

export const THROTTLER_REDIS_OPTIONS = Object.freeze({
  // Rate limiting is on every request. Do not let a sick Redis connection
  // hold the request path while the local limiter is available.
  commandTimeout: 500,
  connectTimeout: 2_000,
  maxRetriesPerRequest: 0,
  enableOfflineQueue: false,
  lazyConnect: false,
}) satisfies RedisOptions;

type DestroyableStorage = ThrottlerStorage & {
  onModuleDestroy?: () => void;
};

interface ResilientStorageDependencies {
  captureException: typeof Sentry.captureException;
  logger: Pick<Logger, 'log' | 'warn'>;
  now: () => number;
}

type RedisStorageFactory = (
  redisUrl: string,
  options: RedisOptions,
) => DestroyableStorage;

/**
 * Redis remains the distributed source while healthy. During an outage the
 * built-in limiter enforces the same policy per Cloud Run instance instead of
 * allowing every request through or turning a Redis timeout into a 500.
 */
export class ResilientThrottlerStorage
  implements ThrottlerStorage, OnModuleDestroy, OnApplicationShutdown
{
  private readonly captureException: typeof Sentry.captureException;
  private readonly logger: Pick<Logger, 'log' | 'warn'>;
  private readonly now: () => number;
  private degraded = false;
  private lastReportedAt = 0;

  constructor(
    private readonly primary: DestroyableStorage,
    private readonly fallback = new ThrottlerStorageService(),
    dependencies: Partial<ResilientStorageDependencies> = {},
  ) {
    this.captureException =
      dependencies.captureException ?? Sentry.captureException;
    this.logger =
      dependencies.logger ?? new Logger(ResilientThrottlerStorage.name);
    this.now = dependencies.now ?? Date.now;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const result = await this.primary.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
      this.reportRecovery();
      return result;
    } catch (error) {
      this.reportFailure(error);
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  onModuleDestroy(): void {
    this.primary.onModuleDestroy?.();
  }

  onApplicationShutdown(): void {
    this.fallback.onApplicationShutdown();
  }

  private reportFailure(error: unknown): void {
    let currentTime: number;
    try {
      currentTime = this.now();
    } catch {
      currentTime = Date.now();
    }

    const shouldReport =
      !this.degraded ||
      currentTime - this.lastReportedAt >= REDIS_OUTAGE_REPORT_INTERVAL_MS;
    this.degraded = true;
    if (!shouldReport) return;
    this.lastReportedAt = currentTime;

    try {
      this.captureException(error, {
        tags: { subsystem: 'throttler-redis', phase: 'increment' },
      });
    } catch {
      // Observability is best effort; local enforcement is not.
    }
    try {
      this.logger.warn(
        'Redis throttle storage unavailable; enforcing limits per instance',
      );
    } catch {
      // A logging transport failure must not disable the fallback limiter.
    }
  }

  private reportRecovery(): void {
    if (!this.degraded) return;
    this.degraded = false;
    this.lastReportedAt = 0;
    try {
      this.logger.log(
        'Redis throttle storage recovered; distributed limits restored',
      );
    } catch {
      // Recovery logging is advisory and must not affect request handling.
    }
  }
}

export function createThrottlerStorage(
  redisUrl: string | undefined,
  logger: Pick<Logger, 'log' | 'warn'> = new Logger('ThrottlerModule'),
  createRedisStorage: RedisStorageFactory = (url, options) =>
    new ThrottlerStorageRedisService(url, options),
): ThrottlerStorage {
  const fallback = new ThrottlerStorageService();
  if (!redisUrl) {
    logger.warn(
      'REDIS_URL not set; rate limiting is per-instance in-memory only',
    );
    return fallback;
  }

  const primary = createRedisStorage(redisUrl, THROTTLER_REDIS_OPTIONS);
  logger.log('Using Redis-backed distributed throttle storage');
  return new ResilientThrottlerStorage(primary, fallback, { logger });
}
