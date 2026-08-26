import type { Logger } from '@nestjs/common';
import {
  ThrottlerStorageService,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import {
  createThrottlerStorage,
  ResilientThrottlerStorage,
  THROTTLER_REDIS_OPTIONS,
} from './resilient-throttler-storage';

const record = (totalHits: number): ThrottlerStorageRecord => ({
  totalHits,
  timeToExpire: 60,
  isBlocked: false,
  timeToBlockExpire: 0,
});

describe('ResilientThrottlerStorage', () => {
  const incrementArgs = ['key', 60_000, 100, 60_000, 'default'] as const;

  function setup() {
    const primary: jest.Mocked<ThrottlerStorage> = {
      increment: jest.fn(),
    };
    const fallback: jest.Mocked<ThrottlerStorageService> = {
      increment: jest.fn(),
      onApplicationShutdown: jest.fn(),
    } as unknown as jest.Mocked<ThrottlerStorageService>;
    const captureException = jest.fn();
    const logger = {
      log: jest.fn(),
      warn: jest.fn(),
    } as unknown as Pick<Logger, 'log' | 'warn'>;
    let now = 10_000;
    const storage = new ResilientThrottlerStorage(primary, fallback, {
      captureException,
      logger,
      now: () => now,
    });

    return {
      storage,
      primary,
      fallback,
      captureException,
      logger,
      setNow: (value: number) => {
        now = value;
      },
    };
  }

  it('uses bounded Redis commands without queueing requests during an outage', () => {
    expect(THROTTLER_REDIS_OPTIONS).toMatchObject({
      commandTimeout: 500,
      connectTimeout: 2_000,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      lazyConnect: false,
    });
  });

  it('uses the built-in limiter directly when REDIS_URL is absent', () => {
    const logger = { log: jest.fn(), warn: jest.fn() } as unknown as Pick<
      Logger,
      'log' | 'warn'
    >;

    const storage = createThrottlerStorage(undefined, logger);

    expect(storage).toBeInstanceOf(ThrottlerStorageService);
    expect(logger.warn).toHaveBeenCalledWith(
      'REDIS_URL not set; rate limiting is per-instance in-memory only',
    );
  });

  it('wraps configured Redis with the resilient local limiter', () => {
    const logger = { log: jest.fn(), warn: jest.fn() } as unknown as Pick<
      Logger,
      'log' | 'warn'
    >;

    const primary = {
      increment: jest.fn(),
      onModuleDestroy: jest.fn(),
    };
    const redisStorageFactory = jest.fn(() => primary);
    const storage = createThrottlerStorage(
      'redis://127.0.0.1:6379',
      logger,
      redisStorageFactory,
    );

    expect(storage).toBeInstanceOf(ResilientThrottlerStorage);
    expect(redisStorageFactory).toHaveBeenCalledWith(
      'redis://127.0.0.1:6379',
      THROTTLER_REDIS_OPTIONS,
    );
    expect(logger.log).toHaveBeenCalledWith(
      'Using Redis-backed distributed throttle storage',
    );
    (storage as ResilientThrottlerStorage).onModuleDestroy();
    expect(primary.onModuleDestroy).toHaveBeenCalledTimes(1);
  });

  it('returns the distributed Redis result while Redis is healthy', async () => {
    const { storage, primary, fallback } = setup();
    primary.increment.mockResolvedValue(record(3));

    await expect(storage.increment(...incrementArgs)).resolves.toEqual(
      record(3),
    );
    expect(fallback.increment).not.toHaveBeenCalled();
  });

  it('falls back to the local limiter when Redis rejects', async () => {
    const { storage, primary, fallback, captureException, logger } = setup();
    const redisError = new Error('Redis command timed out');
    primary.increment.mockRejectedValue(redisError);
    fallback.increment.mockResolvedValue(record(4));

    await expect(storage.increment(...incrementArgs)).resolves.toEqual(
      record(4),
    );

    expect(fallback.increment).toHaveBeenCalledWith(...incrementArgs);
    expect(captureException).toHaveBeenCalledWith(redisError, {
      tags: { subsystem: 'throttler-redis', phase: 'increment' },
    });
    expect(logger.warn).toHaveBeenCalledWith(
      'Redis throttle storage unavailable; enforcing limits per instance',
    );
  });

  it('does not report every request during one Redis outage', async () => {
    const { storage, primary, fallback, captureException } = setup();
    primary.increment.mockRejectedValue(new Error('Redis unavailable'));
    fallback.increment.mockResolvedValue(record(1));

    await storage.increment(...incrementArgs);
    await storage.increment(...incrementArgs);

    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it('reports a prolonged outage again after the observability interval', async () => {
    const { storage, primary, fallback, captureException, setNow } = setup();
    primary.increment.mockRejectedValue(new Error('Redis unavailable'));
    fallback.increment.mockResolvedValue(record(1));

    await storage.increment(...incrementArgs);
    setNow(10_000 + 15 * 60_000);
    await storage.increment(...incrementArgs);

    expect(captureException).toHaveBeenCalledTimes(2);
  });

  it('announces recovery once and returns to Redis', async () => {
    const { storage, primary, fallback, logger } = setup();
    primary.increment
      .mockRejectedValueOnce(new Error('Redis unavailable'))
      .mockResolvedValue(record(2));
    fallback.increment.mockResolvedValue(record(1));

    await storage.increment(...incrementArgs);
    await expect(storage.increment(...incrementArgs)).resolves.toEqual(
      record(2),
    );

    expect(logger.log).toHaveBeenCalledWith(
      'Redis throttle storage recovered; distributed limits restored',
    );
  });

  it('still enforces the fallback when observability itself throws', async () => {
    const { storage, primary, fallback, captureException, logger } = setup();
    primary.increment.mockRejectedValue(new Error('Redis unavailable'));
    fallback.increment.mockResolvedValue(record(5));
    captureException.mockImplementation(() => {
      throw new Error('Sentry unavailable');
    });
    (logger.warn as jest.Mock).mockImplementation(() => {
      throw new Error('logger unavailable');
    });

    await expect(storage.increment(...incrementArgs)).resolves.toEqual(
      record(5),
    );
  });

  it('delegates shutdown to both storage implementations', () => {
    const primary = {
      increment: jest.fn(),
      onModuleDestroy: jest.fn(),
    };
    const fallback = {
      increment: jest.fn(),
      onApplicationShutdown: jest.fn(),
    };
    const storage = new ResilientThrottlerStorage(
      primary,
      fallback as unknown as ThrottlerStorageService,
    );

    storage.onModuleDestroy();
    storage.onApplicationShutdown();

    expect(primary.onModuleDestroy).toHaveBeenCalledTimes(1);
    expect(fallback.onApplicationShutdown).toHaveBeenCalledTimes(1);
  });
});
