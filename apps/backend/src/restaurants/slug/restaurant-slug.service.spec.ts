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
