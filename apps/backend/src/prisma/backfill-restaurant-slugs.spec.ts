// The implementation under test lives at prisma/backfill-restaurant-slugs.ts
// (top-level prisma/, matching seed.ts's convention), not next to this spec.
// This spec sits under src/prisma/ rather than the top-level prisma/
// directory because apps/backend's jest config sets rootDir: "src", which
// cannot discover spec files outside it — see src/prisma/schema-integrity.spec.ts
// for the established precedent this file follows.
import { Prisma } from '@prisma/client';
import {
  backfillSlugs,
  runSlugRollout,
  verifySlugInvariants,
} from '../../prisma/backfill-restaurant-slugs';

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.0.0',
  });
}

describe('backfillSlugs', () => {
  it('creates one primary slug per restaurant lacking one', async () => {
    const created: any[] = [];
    const prisma = {
      restaurant: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'r1', name: 'Бистро Оранж' },
          { id: 'r2', name: 'Restaurant OWEN' },
        ]),
        update: jest.fn(),
      },
      restaurantSlug: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn((args: any) => created.push(args.data)),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    } as any;

    const result = await backfillSlugs(prisma);

    expect(result.created).toBe(2);
    expect(created.map((c) => c.slug)).toEqual([
      'bistro-oranzh',
      'restaurant-owen',
    ]);
  });

  it('is idempotent — restaurants that already have a slug are skipped', async () => {
    const prisma = {
      restaurant: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      restaurantSlug: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    } as any;

    const result = await backfillSlugs(prisma);

    expect(result.created).toBe(0);
    expect(prisma.restaurantSlug.create).not.toHaveBeenCalled();
  });

  // Genuinely exercises the retry path: the advisory pre-check sees no
  // clash (findUnique always resolves null), but the create itself hits a
  // real unique-constraint race on the first attempt — proving the P2002
  // catch, not the pre-check, is what drives the retry.
  it('retries with a deterministic suffix when the insert collides', async () => {
    const created: any[] = [];
    const prisma = {
      restaurant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'r1', name: 'Бистро Оранж' }]),
        update: jest.fn(),
      },
      restaurantSlug: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementationOnce(() => {
            throw uniqueViolation();
          })
          .mockImplementationOnce((args: any) => created.push(args.data)),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    } as any;

    const result = await backfillSlugs(prisma);

    expect(result.created).toBe(1);
    expect(prisma.restaurantSlug.create).toHaveBeenCalledTimes(2);
    expect(created.map((c) => c.slug)).toEqual(['bistro-oranzh-2']);
  });

  it('rethrows a non-collision error rather than swallowing it as a retry', async () => {
    const prisma = {
      restaurant: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'r1', name: 'Бистро Оранж' }]),
        update: jest.fn(),
      },
      restaurantSlug: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(() => {
          throw new Error('connection lost');
        }),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
    } as any;

    await expect(backfillSlugs(prisma)).rejects.toThrow('connection lost');
    expect(prisma.restaurantSlug.create).toHaveBeenCalledTimes(1);
  });
});

describe('verifySlugInvariants', () => {
  it('reports a restaurant with no primary slug', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'r9', name: 'Orphan' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    } as any;

    const violations = await verifySlugInvariants(prisma);
    expect(violations.join(' ')).toContain('r9');
  });

  it('returns an empty array when every invariant holds', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as any;

    await expect(verifySlugInvariants(prisma)).resolves.toEqual([]);
  });

  // The partial unique index can only enforce AT MOST one primary slug per
  // restaurant — it cannot detect a denormalized Restaurant.slug that has
  // drifted from the primary RestaurantSlug row, or a slug that bypassed the
  // lowercase CHECK constraint (e.g. via a raw admin query). These two tests
  // exercise those checks in isolation so this function cannot silently
  // regress into always returning [] regardless of input.
  it('reports a restaurant whose denormalized slug is out of sync', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'r5' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    } as any;

    const violations = await verifySlugInvariants(prisma);
    expect(violations.join(' ')).toContain('r5');
    expect(violations.join(' ')).toContain('out of sync');
  });

  it('reports a slug that is not lowercase', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ slug: 'BadSlug' }])
        .mockResolvedValueOnce([]),
    } as any;

    const violations = await verifySlugInvariants(prisma);
    expect(violations.join(' ')).toContain('BadSlug');
    expect(violations.join(' ')).toContain('lowercase');
  });

  it('reports multiple primaries if the partial unique index is missing or drifted', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'r7', name: 'Drifted', primaryCount: BigInt(2) },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]),
    } as any;

    const violations = await verifySlugInvariants(prisma);
    expect(violations.join(' ')).toContain('2 primary slugs');
  });

  it('reports reserved, numeric, punycode, and malformed namespace rows', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { slug: 'admin' },
          { slug: '12345' },
          { slug: 'xn--fake' },
          { slug: 'bad_slug' },
        ]),
    } as any;

    const violations = await verifySlugInvariants(prisma);
    expect(violations).toHaveLength(4);
    expect(violations.join(' ')).toContain('reserved');
    expect(violations.join(' ')).toContain('numeric');
    expect(violations.join(' ')).toContain('punycode');
    expect(violations.join(' ')).toContain('format');
  });
});

describe('runSlugRollout', () => {
  it('runs the additive backfill twice and requires the second pass to be a no-op', async () => {
    const prisma = {
      restaurant: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 'r1', name: 'New Place' }])
          .mockResolvedValueOnce([]),
        update: jest.fn(),
      },
      restaurantSlug: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $transaction: jest.fn((fn: any) => fn(prisma)),
      $queryRaw: jest.fn().mockResolvedValue([]),
    } as any;

    await expect(runSlugRollout(prisma)).resolves.toEqual({
      firstPass: { created: 1, skipped: 0 },
      secondPass: { created: 0, skipped: 0 },
      violations: [],
    });
    expect(prisma.restaurant.findMany).toHaveBeenCalledTimes(2);
  });
});
