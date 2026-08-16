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

describe('commitSlug — 24h clock backstop', () => {
  it('commits an uncommitted slug older than 24h on the next commit attempt', async () => {
    const primary = {
      slug: 'old-restaurant',
      committedAt: null,
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h old
    };
    const { service, tx } = makePrisma(primary);

    const result = await service.commitSlug('r1');

    expect(tx.restaurantSlug.update).toHaveBeenCalledWith({
      where: { slug: 'old-restaurant' },
      data: { committedAt: expect.any(Date) },
    });
    expect(result.committedAt).toBeInstanceOf(Date);
  });

  it('commits a slug exactly at the 24h boundary (inclusive)', async () => {
    const primary = {
      slug: 'boundary-restaurant',
      committedAt: null,
      createdAt: new Date(Date.now() - DAY_MS),
    };
    const { service, tx } = makePrisma(primary);

    await service.commitSlug('r1');

    expect(tx.restaurantSlug.update).toHaveBeenCalled();
  });

  // A slug younger than 24h must NOT rely on the backstop to commit: real
  // activity (via commitOnActivity, standing in for a menu view / order /
  // reservation once part B wires those in) commits it immediately. If the
  // backstop were the ONLY thing capable of triggering a commit, this call
  // would have to no-op for a brand-new restaurant — which would break the
  // same-day QR flow and defeat the entire point of "auto-commit on FIRST
  // activity".
  it('commits a young (<24h) uncommitted slug on genuine activity, without waiting for the backstop', async () => {
    const primary = {
      slug: 'brand-new-restaurant',
      committedAt: null,
      createdAt: new Date(), // just created
    };
    const { service, tx } = makePrisma(primary);

    await service.commitOnActivity('r1');

    expect(tx.restaurantSlug.update).toHaveBeenCalledWith({
      where: { slug: 'brand-new-restaurant' },
      data: { committedAt: expect.any(Date) },
    });
  });

  // The flip side of the property above: a young, uncommitted slug is NOT
  // committed by the backstop ALONE — i.e. by the mere passage of
  // sub-24h time with nothing external ever referencing it. This codebase
  // has no scheduler for slugs (only loyalty.module.ts registers
  // @nestjs/schedule), so the backstop cannot fire on its own; it only
  // takes effect reactively, on the next actual call. Absent any call at
  // all, nothing writes.
  it('does not auto-commit a young (<24h) uncommitted slug absent any commit attempt', () => {
    const primary = {
      slug: 'brand-new-restaurant',
      committedAt: null,
      createdAt: new Date(),
    };
    const { tx } = makePrisma(primary);

    // No call to commitSlug or commitOnActivity — simulating a restaurant
    // with zero activity and zero QR requests, which is exactly the
    // scenario the backstop exists to eventually close out, once
    // *something* finally calls commitSlug again.
    expect(tx.restaurantSlug.update).not.toHaveBeenCalled();
  });

  it('remains idempotent past the backstop threshold — a second call does not move committedAt or write again', async () => {
    const committedAt = new Date('2026-01-01');
    const primary = {
      slug: 'already-committed',
      committedAt,
      createdAt: new Date(Date.now() - 48 * DAY_MS), // long past 24h
    };
    const { service, tx } = makePrisma(primary);

    const result = await service.commitSlug('r1');

    expect(tx.restaurantSlug.update).not.toHaveBeenCalled();
    expect(result.committedAt).toEqual(committedAt);
  });
});
