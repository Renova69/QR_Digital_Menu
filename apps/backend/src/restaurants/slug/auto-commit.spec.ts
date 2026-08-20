import { RestaurantSlugService } from './restaurant-slug.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function makePrisma(primary: any) {
  const tx = {
    restaurantSlug: {
      findFirst: jest.fn().mockResolvedValue(primary),
      update: jest.fn(),
    },
  };
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) } as any;
  return { service: new RestaurantSlugService(prisma), tx, prisma };
}

describe('commitOnActivity', () => {
  it('resolves normally when the underlying commit succeeds', async () => {
    const { service, tx } = makePrisma({
      slug: 's',
      committedAt: null,
      createdAt: new Date(),
    });

    await expect(service.commitOnActivity('r1')).resolves.toBeUndefined();
    expect(tx.restaurantSlug.update).toHaveBeenCalledWith({
      where: { slug: 's' },
      data: { committedAt: expect.any(Date) },
    });
  });

  it('is a no-op when already committed', async () => {
    const { service, tx } = makePrisma({
      slug: 's',
      committedAt: new Date('2026-01-01'),
    });

    await service.commitOnActivity('r1');

    expect(tx.restaurantSlug.update).not.toHaveBeenCalled();
  });

  // Auto-commit rides along on customer-facing writes. It must never be
  // able to fail an order, a reservation, or a menu view. The key
  // assertion is that the returned promise RESOLVES — a synchronous
  // try/catch around a call that merely doesn't throw synchronously would
  // still let an async rejection escape; `resolves.toBeUndefined()` proves
  // the promise itself never rejects.
  it('never throws, and never rejects, even when the underlying commit fails', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('db down')),
    } as any;
    const service = new RestaurantSlugService(prisma);

    await expect(service.commitOnActivity('r1')).resolves.toBeUndefined();
  });

  // Guards against a regression where the rejection is only caught
  // "accidentally" by an async/await try/catch shape that could later be
  // refactored into something that leaks a rejected promise (e.g. returning
  // `this.commitSlug(restaurantId)` directly instead of awaiting it inside
  // the try). Attaching a rejection handler after the fact must find
  // nothing to handle.
  it('leaves no unhandled rejection behind', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('db down')),
    } as any;
    const service = new RestaurantSlugService(prisma);

    const result = service.commitOnActivity('r1');
    await expect(result).resolves.toBeUndefined();
  });
});

describe('commitExpiredUncommittedSlugs', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('atomically commits primaries after durable activity or 24h', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const service = new RestaurantSlugService({
      restaurantSlug: { updateMany },
    } as any);

    await expect(service.commitExpiredUncommittedSlugs()).resolves.toBe(2);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        isPrimary: true,
        committedAt: null,
        restaurant: {
          deletedAt: null,
          OR: [
            { createdAt: { lte: new Date('2026-08-19T12:00:00.000Z') } },
            { menuViews: { some: {} } },
            { orders: { some: {} } },
            { reservations: { some: {} } },
          ],
        },
      },
      data: { committedAt: new Date('2026-08-20T12:00:00.000Z') },
    });
  });
});

// commitSlug itself remains unconditional: every real activity or QR request
// commits immediately, while commitExpiredUncommittedSlugs covers restaurants
// with no observed activity at all. Both paths are idempotent because their
// writes are restricted to rows whose committedAt is still null.
describe('commitSlug remains unconditional and idempotent regardless of age', () => {
  it('commits an uncommitted slug whether it is brand new or long abandoned', async () => {
    const freshPrimary = {
      slug: 'brand-new-restaurant',
      committedAt: null,
      createdAt: new Date(),
    };
    const fresh = makePrisma(freshPrimary);
    await fresh.service.commitSlug('r1');
    expect(fresh.tx.restaurantSlug.update).toHaveBeenCalledWith({
      where: { slug: 'brand-new-restaurant' },
      data: { committedAt: expect.any(Date) },
    });

    const oldPrimary = {
      slug: 'long-abandoned-restaurant',
      committedAt: null,
      createdAt: new Date(Date.now() - 90 * DAY_MS),
    };
    const old = makePrisma(oldPrimary);
    await old.service.commitSlug('r1');
    expect(old.tx.restaurantSlug.update).toHaveBeenCalledWith({
      where: { slug: 'long-abandoned-restaurant' },
      data: { committedAt: expect.any(Date) },
    });
  });

  it('is idempotent regardless of how old the primary is — a second call never moves committedAt or writes again', async () => {
    const committedAt = new Date('2026-01-01');
    const primary = {
      slug: 'already-committed',
      committedAt,
      createdAt: new Date(Date.now() - 90 * DAY_MS),
    };
    const { service, tx } = makePrisma(primary);

    const result = await service.commitSlug('r1');

    expect(tx.restaurantSlug.update).not.toHaveBeenCalled();
    expect(result.committedAt).toEqual(committedAt);
  });
});
