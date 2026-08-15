import {
  backfillSlugs,
  verifySlugInvariants,
} from '../../prisma/backfill-restaurant-slugs';

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
});

describe('verifySlugInvariants', () => {
  it('reports a restaurant with no primary slug', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'r9', name: 'Orphan' }])
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
        .mockResolvedValueOnce([{ slug: 'BadSlug' }]),
    } as any;

    const violations = await verifySlugInvariants(prisma);
    expect(violations.join(' ')).toContain('BadSlug');
    expect(violations.join(' ')).toContain('lowercase');
  });
});
