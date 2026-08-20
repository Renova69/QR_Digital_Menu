import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RestaurantSlugService } from './restaurant-slug.service';

function makePrisma() {
  return {
    restaurant: {
      findUnique: jest.fn(),
    },
    restaurantSlug: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  } as any;
}

describe('RestaurantSlugService.resolve', () => {
  it('returns the restaurant and its canonical slug for a primary hit', async () => {
    const prisma = makePrisma();
    prisma.restaurantSlug.findUnique.mockResolvedValue({
      slug: 'bistro-oranzh',
      restaurantId: 'r1',
      isPrimary: true,
      releasedAt: null,
      restaurant: { slug: 'bistro-oranzh' },
    });
    const service = new RestaurantSlugService(prisma);

    await expect(service.resolve('bistro-oranzh')).resolves.toEqual({
      restaurantId: 'r1',
      canonicalSlug: 'bistro-oranzh',
      releasedAt: null,
    });
  });

  it('resolves an alias to the current canonical slug', async () => {
    const prisma = makePrisma();
    prisma.restaurantSlug.findUnique.mockResolvedValue({
      slug: 'old-name',
      restaurantId: 'r1',
      isPrimary: false,
      releasedAt: null,
      restaurant: { slug: 'bistro-oranzh' },
    });
    const service = new RestaurantSlugService(prisma);

    const result = await service.resolve('old-name');
    expect(result?.canonicalSlug).toBe('bistro-oranzh');
  });

  it('lowercases and trims before lookup', async () => {
    const prisma = makePrisma();
    prisma.restaurantSlug.findUnique.mockResolvedValue(null);
    const service = new RestaurantSlugService(prisma);

    await service.resolve('  BISTRO-ORANZH  ');

    expect(prisma.restaurantSlug.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'bistro-oranzh' } }),
    );
  });

  it('returns null for an unknown slug', async () => {
    const prisma = makePrisma();
    prisma.restaurantSlug.findUnique.mockResolvedValue(null);
    const service = new RestaurantSlugService(prisma);

    await expect(service.resolve('nope')).resolves.toBeNull();
  });

  it('surfaces a tombstone rather than hiding it', async () => {
    const prisma = makePrisma();
    const releasedAt = new Date('2026-01-01');
    prisma.restaurantSlug.findUnique.mockResolvedValue({
      slug: 'gone',
      restaurantId: 'r1',
      isPrimary: false,
      releasedAt,
      restaurant: { slug: 'bistro-oranzh' },
    });
    const service = new RestaurantSlugService(prisma);

    const result = await service.resolve('gone');
    expect(result?.releasedAt).toEqual(releasedAt);
  });

  it('returns null when the underlying restaurant is soft-deleted', async () => {
    const prisma = makePrisma();
    prisma.restaurantSlug.findUnique.mockResolvedValue({
      slug: 'ghost-diner',
      restaurantId: 'r1',
      isPrimary: true,
      releasedAt: null,
      restaurant: { slug: 'ghost-diner', deletedAt: new Date('2026-01-01') },
    });
    const service = new RestaurantSlugService(prisma);

    await expect(service.resolve('ghost-diner')).resolves.toBeNull();
  });

  // Guard against over-filtering: a live restaurant (deletedAt: null) must
  // still resolve normally once the deletedAt select/check is in place.
  it('still resolves normally when the restaurant is live', async () => {
    const prisma = makePrisma();
    prisma.restaurantSlug.findUnique.mockResolvedValue({
      slug: 'bistro-oranzh',
      restaurantId: 'r1',
      isPrimary: true,
      releasedAt: null,
      restaurant: { slug: 'bistro-oranzh', deletedAt: null },
    });
    const service = new RestaurantSlugService(prisma);

    await expect(service.resolve('bistro-oranzh')).resolves.toEqual({
      restaurantId: 'r1',
      canonicalSlug: 'bistro-oranzh',
      releasedAt: null,
    });
  });
});

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.0.0',
  });
}

describe('RestaurantSlugService.createRestaurantWithInitialSlug', () => {
  function makeAtomicCreatePrisma(options?: { slugCollision?: boolean }) {
    const committedRestaurants: Array<Record<string, unknown>> = [];
    let sequence = 0;

    const prisma = {
      $transaction: jest.fn(async (fn: (tx: any) => Promise<unknown>) => {
        sequence += 1;
        const created = {
          id: `restaurant-${sequence}`,
          name: 'New Place',
          ownerId: 'owner-1',
          slug: null,
        };
        const tx = {
          restaurant: {
            create: jest.fn().mockResolvedValue(created),
            update: jest
              .fn()
              .mockImplementation(({ data }: { data: { slug: string } }) =>
                Promise.resolve({ ...created, slug: data.slug }),
              ),
          },
          restaurantSlug: {
            create: options?.slugCollision
              ? jest.fn().mockRejectedValue(uniqueViolation())
              : jest.fn().mockResolvedValue(undefined),
          },
        };

        const result = await fn(tx);
        committedRestaurants.push(result as Record<string, unknown>);
        return result;
      }),
    } as any;

    return { prisma, committedRestaurants };
  }

  it('returns a restaurant whose primary slug was created in the same transaction', async () => {
    const { prisma, committedRestaurants } = makeAtomicCreatePrisma();
    const service = new RestaurantSlugService(prisma);

    const restaurant = await service.createRestaurantWithInitialSlug({
      name: 'New Place',
      ownerId: 'owner-1',
    });

    expect(restaurant).toMatchObject({
      id: 'restaurant-1',
      slug: 'new-place',
    });
    expect(committedRestaurants).toEqual([restaurant]);
  });

  it('leaves no committed restaurant when slug allocation is exhausted', async () => {
    const { prisma, committedRestaurants } = makeAtomicCreatePrisma({
      slugCollision: true,
    });
    const service = new RestaurantSlugService(prisma);

    await expect(
      service.createRestaurantWithInitialSlug({
        name: 'New Place',
        ownerId: 'owner-1',
      }),
    ).rejects.toThrow('Could not allocate a unique slug');
    expect(committedRestaurants).toEqual([]);
  });

  it('claims an owner-edited onboarding slug exactly, in the restaurant transaction', async () => {
    const slugCreate = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      $transaction: jest.fn((fn: (tx: any) => Promise<unknown>) =>
        fn({
          restaurant: {
            create: jest.fn().mockResolvedValue({
              id: 'r1',
              name: 'New Place',
              ownerId: 'owner-1',
              slug: null,
            }),
            update: jest.fn().mockResolvedValue({
              id: 'r1',
              name: 'New Place',
              ownerId: 'owner-1',
              slug: 'owners-choice',
            }),
          },
          restaurantSlug: { create: slugCreate },
        }),
      ),
    } as any;
    const service = new RestaurantSlugService(prisma);

    await service.createRestaurantWithInitialSlug(
      { name: 'New Place', ownerId: 'owner-1' },
      'owners-choice',
    );

    expect(slugCreate).toHaveBeenCalledWith({
      data: {
        slug: 'owners-choice',
        restaurantId: 'r1',
        isPrimary: true,
      },
    });
  });

  it('does not silently suffix an owner-edited slug when the namespace race is lost', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(uniqueViolation()),
    } as any;
    const service = new RestaurantSlugService(prisma);

    await expect(
      service.createRestaurantWithInitialSlug(
        { name: 'New Place', ownerId: 'owner-1' },
        'owners-choice',
      ),
    ).rejects.toThrow('This slug is already taken');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid owner-edited slug before opening a transaction', async () => {
    const prisma = { $transaction: jest.fn() } as any;
    const service = new RestaurantSlugService(prisma);

    await expect(
      service.createRestaurantWithInitialSlug(
        { name: 'New Place', ownerId: 'owner-1' },
        'admin',
      ),
    ).rejects.toThrow('reserved');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('RestaurantSlugService.claimInitialSlug', () => {
  function makeClaimPrisma() {
    return {
      $transaction: jest.fn((fn: any) =>
        fn({
          restaurantSlug: { create: jest.fn() },
          restaurant: { update: jest.fn() },
        }),
      ),
    } as any;
  }

  it('claims the derived slug when it is free', async () => {
    const prisma = makeClaimPrisma();
    const service = new RestaurantSlugService(prisma);

    await expect(service.claimInitialSlug('r1', 'Бистро Оранж')).resolves.toBe(
      'bistro-oranzh',
    );
  });

  it('retries with a deterministic suffix on collision', async () => {
    const prisma = makeClaimPrisma();
    prisma.$transaction
      .mockImplementationOnce(() => Promise.reject(uniqueViolation()))
      .mockImplementationOnce(() => Promise.resolve(undefined));
    const service = new RestaurantSlugService(prisma);

    await expect(service.claimInitialSlug('r1', 'Бистро Оранж')).resolves.toBe(
      'bistro-oranzh-2',
    );
  });

  it('gives up with a clear error after the retry budget', async () => {
    const prisma = makeClaimPrisma();
    prisma.$transaction.mockRejectedValue(uniqueViolation());
    const service = new RestaurantSlugService(prisma);

    await expect(
      service.claimInitialSlug('r1', 'Бистро Оранж'),
    ).rejects.toThrow('Could not allocate a unique slug');
  });

  it('rethrows errors that are not unique violations', async () => {
    const prisma = makeClaimPrisma();
    prisma.$transaction.mockRejectedValue(new Error('connection lost'));
    const service = new RestaurantSlugService(prisma);

    await expect(
      service.claimInitialSlug('r1', 'Бистро Оранж'),
    ).rejects.toThrow('connection lost');
  });
});

describe('RestaurantSlugService.assertOwner', () => {
  it('resolves silently when the caller is the owner', async () => {
    const prisma = makePrisma();
    prisma.restaurant.findUnique.mockResolvedValue({
      ownerId: 'owner-1',
      deletedAt: null,
    });
    const service = new RestaurantSlugService(prisma);

    await expect(service.assertOwner('r1', 'owner-1')).resolves.toBeUndefined();
  });

  // This is the case the brief calls out as the trap: a MANAGER is a valid,
  // assigned staff member of the restaurant under findOneForManagement's
  // OWNER-or-MANAGER rule, but must be rejected here since assertOwner is
  // strictly OWNER-only.
  it('rejects a non-owner (e.g. an assigned MANAGER) with ForbiddenException', async () => {
    const prisma = makePrisma();
    prisma.restaurant.findUnique.mockResolvedValue({
      ownerId: 'owner-1',
      deletedAt: null,
    });
    const service = new RestaurantSlugService(prisma);

    await expect(service.assertOwner('r1', 'manager-1')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('404s on a missing restaurant rather than leaking a 403', async () => {
    const prisma = makePrisma();
    prisma.restaurant.findUnique.mockResolvedValue(null);
    const service = new RestaurantSlugService(prisma);

    await expect(service.assertOwner('missing', 'owner-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('404s on a soft-deleted restaurant rather than leaking a 403', async () => {
    const prisma = makePrisma();
    prisma.restaurant.findUnique.mockResolvedValue({
      ownerId: 'owner-1',
      deletedAt: new Date('2026-01-01'),
    });
    const service = new RestaurantSlugService(prisma);

    await expect(service.assertOwner('r1', 'owner-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('RestaurantSlugService.isSlugAvailable', () => {
  it('returns true when the slug passes validation and is unclaimed', async () => {
    const prisma = makePrisma();
    prisma.restaurantSlug.findUnique.mockResolvedValue(null);
    const service = new RestaurantSlugService(prisma);

    await expect(service.isSlugAvailable('free-name')).resolves.toBe(true);
  });

  it('returns false when the slug is already claimed', async () => {
    const prisma = makePrisma();
    prisma.restaurantSlug.findUnique.mockResolvedValue({ slug: 'taken' });
    const service = new RestaurantSlugService(prisma);

    await expect(service.isSlugAvailable('taken')).resolves.toBe(false);
  });

  it('returns false for a rule-invalid slug without hitting the DB', async () => {
    const prisma = makePrisma();
    const service = new RestaurantSlugService(prisma);

    await expect(service.isSlugAvailable('a')).resolves.toBe(false);
    expect(prisma.restaurantSlug.findUnique).not.toHaveBeenCalled();
  });

  it('tolerates a null Restaurant.slug column (nullable field)', async () => {
    // Sanity check on the nullable-slug contract via resolve(), which is the
    // method that reads Restaurant.slug back out.
    const prisma = makePrisma();
    prisma.restaurantSlug.findUnique.mockResolvedValue({
      slug: 'alias',
      restaurantId: 'r1',
      isPrimary: false,
      releasedAt: null,
      restaurant: { slug: null },
    });
    const service = new RestaurantSlugService(prisma);

    const result = await service.resolve('alias');
    expect(result?.canonicalSlug).toBe('alias');
  });
});

describe('RestaurantSlugService.listAliases', () => {
  it('returns live and released non-primary URLs newest first', async () => {
    const aliases = [
      {
        slug: 'recent-name',
        committedAt: new Date('2026-08-01'),
        releasedAt: null,
        createdAt: new Date('2026-08-01'),
      },
      {
        slug: 'released-name',
        committedAt: new Date('2026-01-01'),
        releasedAt: new Date('2026-07-01'),
        createdAt: new Date('2026-01-01'),
      },
    ];
    const prisma = {
      restaurantSlug: { findMany: jest.fn().mockResolvedValue(aliases) },
    } as any;
    const service = new RestaurantSlugService(prisma);

    await expect(service.listAliases('r1')).resolves.toEqual(aliases);
    expect(prisma.restaurantSlug.findMany).toHaveBeenCalledWith({
      where: { restaurantId: 'r1', isPrimary: false },
      select: {
        slug: true,
        committedAt: true,
        releasedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('returns the primary commit state needed to explain the grace window and cooldown', async () => {
    const primary = {
      slug: 'current-name',
      committedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-07-01'),
    };
    const prisma = {
      restaurantSlug: { findFirst: jest.fn().mockResolvedValue(primary) },
    } as any;
    const service = new RestaurantSlugService(prisma);

    await expect(service.getPrimaryState('r1')).resolves.toEqual(primary);
    expect(prisma.restaurantSlug.findFirst).toHaveBeenCalledWith({
      where: { restaurantId: 'r1', isPrimary: true },
      select: { slug: true, committedAt: true, createdAt: true },
    });
  });
});
