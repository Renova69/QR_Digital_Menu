import { withKeyLock } from './key-mutex';

describe('withKeyLock', () => {
  it('serializes calls for the same key — the second never starts until the first resolves', async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstStarted = new Promise<void>((resolve) => {
      void withKeyLock('shared-url', async () => {
        order.push('first-start');
        resolve();
        await new Promise<void>((r) => {
          releaseFirst = r;
        });
        order.push('first-end');
      });
    });
    await firstStarted;

    const second = withKeyLock('shared-url', async () => {
      order.push('second-start');
    });

    // First call is still holding the lock — second must not have run yet.
    expect(order).toEqual(['first-start']);

    releaseFirst();
    await second;

    expect(order).toEqual(['first-start', 'first-end', 'second-start']);
  });

  it('runs calls for different keys fully in parallel', async () => {
    const order: string[] = [];
    let releaseA!: () => void;

    const a = withKeyLock('url-a', async () => {
      order.push('a-start');
      await new Promise<void>((r) => {
        releaseA = r;
      });
      order.push('a-end');
    });

    // Give the first call's microtask a tick to actually start.
    await Promise.resolve();
    await Promise.resolve();

    const b = withKeyLock('url-b', async () => {
      order.push('b-start');
    });
    await b;

    // b (different key) completed while a was still pending.
    expect(order).toEqual(['a-start', 'b-start']);

    releaseA();
    await a;
    expect(order).toEqual(['a-start', 'b-start', 'a-end']);
  });

  it('continues the chain for a key even if a prior call throws', async () => {
    await expect(
      withKeyLock('failing-key', async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const result = await withKeyLock('failing-key', async () => 'ok');
    expect(result).toBe('ok');
  });

  it('returns the value produced by fn', async () => {
    const result = await withKeyLock('value-key', async () => 42);
    expect(result).toBe(42);
  });
});
