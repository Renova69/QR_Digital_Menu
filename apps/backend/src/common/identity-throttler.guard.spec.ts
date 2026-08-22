import { IdentityThrottlerGuard } from './identity-throttler.guard';

// P1-1: the stock tracker keys on req.ip alone. On Cloud Run that resolved to
// Google's front end — the same value for every caller — collapsing every
// limit in the application into one shared bucket. And where X-Forwarded-For
// *is* used, it is only trustworthy on the path through Vercel; a caller
// hitting the run.app origin directly sets it freely. Preferring the
// authenticated identity removes the header from the equation entirely for
// anyone who is logged in.
describe('IdentityThrottlerGuard', () => {
  const guard = Object.create(
    IdentityThrottlerGuard.prototype,
  ) as IdentityThrottlerGuard;
  const track = (req: Record<string, any>) =>
    (guard as any).getTracker(req) as Promise<string>;

  it('keys an authenticated caller on the user id, not the address', async () => {
    await expect(
      track({ ip: '203.0.113.9', user: { id: 'user-1' } }),
    ).resolves.toBe('user:user-1');
  });

  it('accepts the raw JWT payload shape as well', async () => {
    await expect(
      track({ ip: '203.0.113.9', user: { sub: 'user-2' } }),
    ).resolves.toBe('user:user-2');
  });

  it('gives one user the same bucket from two different addresses', async () => {
    const first = await track({ ip: '198.51.100.1', user: { id: 'user-3' } });
    const second = await track({ ip: '203.0.113.7', user: { id: 'user-3' } });

    // The point of the change: rotating source addresses no longer multiplies
    // an authenticated abuser's budget.
    expect(first).toBe(second);
  });

  it('falls back to the address for anonymous callers', async () => {
    await expect(track({ ip: '198.51.100.4' })).resolves.toBe(
      'ip:198.51.100.4',
    );
  });

  it('never lets a user id collide with an address', async () => {
    const asUser = await track({ user: { id: '198.51.100.4' } });
    const asIp = await track({ ip: '198.51.100.4' });

    expect(asUser).not.toBe(asIp);
  });

  it('degrades to a stable key rather than undefined when nothing is known', async () => {
    await expect(track({})).resolves.toBe('ip:unknown');
  });

  it('ignores a non-string user id rather than keying on it', async () => {
    await expect(track({ ip: '198.51.100.5', user: { id: 42 } })).resolves.toBe(
      'ip:198.51.100.5',
    );
  });
});
