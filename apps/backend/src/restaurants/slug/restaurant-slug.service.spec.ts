import { Prisma } from '@prisma/client';
import { RestaurantSlugService } from './restaurant-slug.service';

function makePrisma() {
  return {
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
});

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.0.0',
  });
}

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
