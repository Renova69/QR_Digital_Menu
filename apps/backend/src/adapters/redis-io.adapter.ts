import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplicationContext, Logger } from '@nestjs/common';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/**
 * Strips credentials from a Redis connection URL before it is logged.
 * Never log a raw REDIS_URL — it typically embeds the auth password
 * (e.g. rediss://default:<password>@host:port) and logs are not a secret store.
 */
const REDIS_CONNECT_TIMEOUT_MS = 10_000;

function redactRedisUrl(redisUrl: string): string {
  try {
    const parsed = new URL(redisUrl);
    return `${parsed.protocol}//${parsed.hostname}:${parsed.port || '6379'}`;
  } catch {
    return '[unparseable REDIS_URL]';
  }
}

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      // An unreachable Redis already fails boot below. An ABSENT one is the
      // more dangerous case, because nothing downstream errors: the in-memory
      // adapter answers every call successfully while seeing only this
      // instance's sockets. fetchSockets() then returns a partial view instead
      // of throwing, so cross-instance behaviour degrades silently -- missed
      // order and reservation events on the "wrong" instance, print jobs routed
      // to an agent this process cannot see, and a print-agent retirement sweep
      // judging staleness against a fraction of the live agents.
      //
      // Production runs multiple instances, so this is a misconfiguration, not
      // a deployment shape. Fail at boot where readiness never goes green,
      // rather than days later through symptoms that look like anything else.
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'REDIS_URL is not set. Production runs multiple instances and requires ' +
            'the Socket.IO Redis adapter for cross-instance realtime; the in-memory ' +
            'fallback would silently see only one instance.',
        );
      }
      this.logger.warn(
        'REDIS_URL not set — using in-memory Socket.IO adapter (single-instance only)',
      );
      return;
    }

    try {
      // Bounded connect timeout so a blackholed/firewalled host fails
      // promptly instead of hanging boot indefinitely (ioredis's default
      // retry loop would otherwise keep trying with no 'ready'/'error'
      // ever firing for a connection that neither succeeds nor is refused).
      const pubClient = new Redis(redisUrl, {
        lazyConnect: false,
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      });
      const subClient = pubClient.duplicate();

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          pubClient.once('ready', resolve);
          pubClient.once('error', reject);
        }),
        new Promise<void>((resolve, reject) => {
          subClient.once('ready', resolve);
          subClient.once('error', reject);
        }),
      ]);

      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log(
        `Socket.IO Redis adapter connected to ${redactRedisUrl(redisUrl)}`,
      );
    } catch (err) {
      this.adapterConstructor = null;
      // REDIS_URL being set is an explicit operator signal that this
      // deployment is meant to run multi-instance with shared realtime
      // state and distributed rate limiting (see app.module.ts). Silently
      // falling back to in-memory here would mean production quietly loses
      // cross-instance correctness with no operator-visible failure — the
      // exact "silent degrade" this class exists to avoid. Fail boot
      // instead so a misconfigured/unreachable Redis is caught at deploy
      // time (readiness never goes green) rather than discovered later via
      // missed orders/reservations/print jobs on the "wrong" instance.
      // Outside production (dev/test), keep the softer fallback so a local
      // developer without Redis running isn't blocked.
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          `REDIS_URL is set but the Socket.IO Redis adapter failed to connect: ${(err as Error).message}`,
        );
      }
      this.logger.error(
        `Failed to connect Socket.IO Redis adapter — falling back to in-memory: ${(err as Error).message}`,
      );
    }
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
