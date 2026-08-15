import { BadRequestException } from '@nestjs/common';
import { RestaurantSlugService } from './restaurant-slug.service';

function makePrisma(primary: any) {
  const tx = {
    restaurantSlug: {
      findFirst: jest.fn().mockResolvedValue(primary),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      // Task 7 defect fix (ruling R2): renameSlug's uncommitted branch calls
      // tx.restaurantSlug.delete(...) — the brief's own mock omitted this,
      // which would fail with "delete is not a function". Added per the
      // dispatcher's explicit ruling, not an open question.
      delete: jest.fn(),
    },
    restaurant: { update: jest.fn() },
  };
  return {
    tx,
    prisma: {
      restaurantSlug: { findFirst: jest.fn().mockResolvedValue(primary) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    } as any,
  };
}

describe('commitSlug', () => {
  it('sets committedAt on an uncommitted slug', async () => {
    const { prisma, tx } = makePrisma({
      slug: 'bistro-oranzh',
      committedAt: null,
    });
    const service = new RestaurantSlugService(prisma);

    await service.commitSlug('r1');

    expect(tx.restaurantSlug.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'bistro-oranzh' } }),
    );
  });

  it('is idempotent — a second call does not move committedAt', async () => {
    const committedAt = new Date('2026-08-01');
    const { prisma, tx } = makePrisma({ slug: 'bistro-oranzh', committedAt });
    const service = new RestaurantSlugService(prisma);

    const result = await service.commitSlug('r1');

    expect(tx.restaurantSlug.update).not.toHaveBeenCalled();
    expect(result.committedAt).toEqual(committedAt);
  });
});

describe('renameSlug', () => {
  it('retires the old slug as an alias and promotes the new one', async () => {
    const { prisma, tx } = makePrisma({
      slug: 'old-name',
      committedAt: new Date('2026-01-01'),
    });
    const service = new RestaurantSlugService(prisma);

    await service.renameSlug('r1', 'new-name');

    expect(tx.restaurantSlug.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'old-name' },
        data: { isPrimary: false },
      }),
    );
    expect(tx.restaurantSlug.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'new-name', isPrimary: true }),
      }),
    );
    expect(tx.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { slug: 'new-name' } }),
    );
  });

  it('creates no alias while the slug is uncommitted — it is an edit', async () => {
    const { prisma, tx } = makePrisma({ slug: 'first-try', committedAt: null });
    const service = new RestaurantSlugService(prisma);

    await service.renameSlug('r1', 'second-try');

    // The old slug is deleted, not retired: nothing external references it yet,
    // so nothing is preserved and no namespace is burned.
    expect(tx.restaurantSlug.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPrimary: false } }),
    );
  });

  it('rejects a second committed rename inside the cooldown', async () => {
    const { prisma } = makePrisma({
      slug: 'old-name',
      committedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    });
    const service = new RestaurantSlugService(prisma);

    await expect(service.renameSlug('r1', 'new-name')).rejects.toThrow(
      BadRequestException,
    );
  });
});

describe('releaseSlug', () => {
  it('tombstones rather than deleting, so the name cannot be re-claimed', async () => {
    const { prisma, tx } = makePrisma({
      slug: 'current',
      committedAt: new Date(),
    });
    tx.restaurantSlug.findFirst.mockResolvedValue({
      slug: 'old-name',
      restaurantId: 'r1',
      isPrimary: false,
      releasedAt: null,
    });
    const service = new RestaurantSlugService(prisma);

    await service.releaseSlug('r1', 'old-name');

    expect(tx.restaurantSlug.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: 'old-name' },
        data: expect.objectContaining({ releasedAt: expect.any(Date) }),
      }),
    );
  });

  it('refuses to release the current primary slug', async () => {
    const { prisma, tx } = makePrisma({
      slug: 'current',
      committedAt: new Date(),
    });
    tx.restaurantSlug.findFirst.mockResolvedValue({
      slug: 'current',
      restaurantId: 'r1',
      isPrimary: true,
      releasedAt: null,
    });
    const service = new RestaurantSlugService(prisma);

    await expect(service.releaseSlug('r1', 'current')).rejects.toThrow(
      BadRequestException,
    );
  });
});
