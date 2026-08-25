import { EventEmitter } from 'events';
import { RedisIoAdapter } from './redis-io.adapter';

class FakeRedisClient extends EventEmitter {
  duplicate(): FakeRedisClient {
    return this;
  }
}

let fakeClient: FakeRedisClient;

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => fakeClient),
  };
});

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn().mockReturnValue('fake-adapter-constructor'),
}));

describe('RedisIoAdapter.connectToRedis', () => {
  const originalEnv = { ...process.env };
  const app = {} as never;

  beforeEach(() => {
    fakeClient = new FakeRedisClient();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('warns and returns without connecting when REDIS_URL is not set', async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'development';
    const adapter = new RedisIoAdapter(app);

    await expect(adapter.connectToRedis()).resolves.toBeUndefined();
  });

  // An unreachable Redis already failed boot; an ABSENT one only warned, which
  // is the more dangerous of the two because nothing downstream errors. The
  // in-memory adapter answers every call successfully while seeing only this
  // instance's sockets, so cross-instance behaviour degrades silently:
  // fetchSockets() returns a partial view rather than throwing, and the
  // print-agent retirement sweep would judge staleness on a fraction of the
  // live agents.
  it('fails boot in production when REDIS_URL is absent — no silent single-instance degrade', async () => {
    delete process.env.REDIS_URL;
    process.env.NODE_ENV = 'production';
    const adapter = new RedisIoAdapter(app);

    await expect(adapter.connectToRedis()).rejects.toThrow(/REDIS_URL/);
  });

  it('redacts credentials from the connected-log line', async () => {
    process.env.REDIS_URL =
      'redis://default:super-secret-password@my-host:6379';
    const adapter = new RedisIoAdapter(app);
    const logSpy = jest
      .spyOn(
        (adapter as unknown as { logger: { log: jest.Mock } }).logger,
        'log',
      )
      .mockImplementation(() => undefined);

    const connectPromise = adapter.connectToRedis();
    fakeClient.emit('ready');
    await connectPromise;

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('redis://my-host:6379'),
    );
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('super-secret-password'),
    );
  });

  it('falls back to in-memory outside production when Redis is unreachable', async () => {
    process.env.NODE_ENV = 'development';
    process.env.REDIS_URL = 'redis://bad-host:6379';
    const adapter = new RedisIoAdapter(app);
    jest
      .spyOn(
        (adapter as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    const connectPromise = adapter.connectToRedis();
    fakeClient.emit('error', new Error('ECONNREFUSED'));

    await expect(connectPromise).resolves.toBeUndefined();
  });

  it('fails boot in production when REDIS_URL is set but unreachable — no silent degrade', async () => {
    // Regression: REDIS_URL being set is an explicit multi-instance signal
    // (it also backs distributed rate limiting — app.module.ts). Silently
    // falling back to in-memory in production would hide a real
    // misconfiguration behind working-looking single-instance behavior.
    process.env.NODE_ENV = 'production';
    process.env.REDIS_URL = 'redis://bad-host:6379';
    const adapter = new RedisIoAdapter(app);
    jest
      .spyOn(
        (adapter as unknown as { logger: { error: jest.Mock } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    const connectPromise = adapter.connectToRedis();
    fakeClient.emit('error', new Error('ECONNREFUSED'));

    await expect(connectPromise).rejects.toThrow(/failed to connect/);
  });
});
