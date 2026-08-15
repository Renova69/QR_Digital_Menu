import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RestaurantSlugService } from './restaurant-slug.service';

const DAY_MS = 24 * 60 * 60 * 1000;

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '6.0.0',
  });
}

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

    const result = await service.commitSlug('r1');

    // Finding 1 fix: assert the `data` payload actually sets committedAt to
    // a Date, not just that `update` was called with a matching `where`.
    // Without this, a write of `data: {}` or the wrong field would still
    // pass.
    expect(tx.restaurantSlug.update).toHaveBeenCalledWith({
      where: { slug: 'bistro-oranzh' },
      data: { committedAt: expect.any(Date) },
    });
    expect(result.committedAt).toBeInstanceOf(Date);
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
    const primary = {
      slug: 'old-name',
      restaurantId: 'r1',
      committedAt: new Date('2026-01-01'),
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      // The advisory lookup for 'new-name' finds nothing — it is genuinely free.
      .mockImplementationOnce(() => Promise.resolve(null));
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
    const primary = {
      slug: 'first-try',
      restaurantId: 'r1',
      committedAt: null,
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      // The advisory lookup for 'second-try' finds nothing — it is genuinely free.
      .mockImplementationOnce(() => Promise.resolve(null));
    const service = new RestaurantSlugService(prisma);

    await service.renameSlug('r1', 'second-try');

    // Finding 2 fix: the original test asserted only the negative half (no
    // isPrimary:false update), which a no-op implementation would also
    // satisfy. Now proves both halves of the edit-vs-alias asymmetry: the
    // old slug really is deleted and returned to the pool, and the new row
    // is created uncommitted.
    expect(tx.restaurantSlug.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPrimary: false } }),
    );
    expect(tx.restaurantSlug.delete).toHaveBeenCalledWith({
      where: { slug: 'first-try' },
    });
    expect(tx.restaurantSlug.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'second-try',
          committedAt: null,
        }),
      }),
    );
  });

  it('rejects a second committed rename inside the cooldown', async () => {
    const { prisma } = makePrisma({
      slug: 'old-name',
      restaurantId: 'r1',
      committedAt: new Date(Date.now() - 3 * DAY_MS),
    });
    const service = new RestaurantSlugService(prisma);

    await expect(service.renameSlug('r1', 'new-name')).rejects.toThrow(
      BadRequestException,
    );
  });

  // --- Finding 3: renameSlug collision handling (4 cases) ---

  it('case 1: no-ops when the target is its own current primary slug (double-submit)', async () => {
    const primary = {
      slug: 'current-name',
      restaurantId: 'r1',
      // Inside the cooldown window — must NOT block this path, since it is
      // not treated as a rename at all.
      committedAt: new Date(Date.now() - 3 * DAY_MS),
    };
    const { prisma, tx } = makePrisma(primary);
    const service = new RestaurantSlugService(prisma);

    const result = await service.renameSlug('r1', 'current-name');

    expect(result).toBe('current-name');
    expect(tx.restaurantSlug.create).not.toHaveBeenCalled();
    expect(tx.restaurantSlug.update).not.toHaveBeenCalled();
    expect(tx.restaurantSlug.delete).not.toHaveBeenCalled();
    expect(tx.restaurant.update).not.toHaveBeenCalled();
  });

  it('case 2: re-promotes its own still-resolvable alias instead of creating a duplicate row', async () => {
    const primary = {
      slug: 'current-name',
      restaurantId: 'r1',
      committedAt: new Date(Date.now() - 20 * DAY_MS), // past cooldown
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      .mockImplementationOnce(() =>
        Promise.resolve({
          slug: 'old-alias',
          restaurantId: 'r1',
          isPrimary: false,
          releasedAt: null,
        }),
      );
    const service = new RestaurantSlugService(prisma);

    const result = await service.renameSlug('r1', 'old-alias');

    expect(result).toBe('old-alias');
    expect(tx.restaurantSlug.create).not.toHaveBeenCalled();
    expect(tx.restaurantSlug.update).toHaveBeenCalledWith({
      where: { slug: 'current-name' },
      data: { isPrimary: false },
    });
    expect(tx.restaurantSlug.update).toHaveBeenCalledWith({
      where: { slug: 'old-alias' },
      data: { isPrimary: true },
    });
    expect(tx.restaurant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { slug: 'old-alias' } }),
    );
  });

  it('case 3: refuses to resurrect its own tombstoned slug', async () => {
    const primary = {
      slug: 'current-name',
      restaurantId: 'r1',
      committedAt: new Date(Date.now() - 20 * DAY_MS),
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      .mockImplementationOnce(() =>
        Promise.resolve({
          slug: 'released-name',
          restaurantId: 'r1',
          isPrimary: false,
          releasedAt: new Date('2026-01-01'),
        }),
      );
    const service = new RestaurantSlugService(prisma);

    await expect(service.renameSlug('r1', 'released-name')).rejects.toThrow(
      BadRequestException,
    );
    expect(tx.restaurantSlug.create).not.toHaveBeenCalled();
    expect(tx.restaurantSlug.update).not.toHaveBeenCalled();
  });

  it('case 4: rejects a target slug owned by a different restaurant without leaking who holds it', async () => {
    const primary = {
      slug: 'current-name',
      restaurantId: 'r1',
      committedAt: new Date(Date.now() - 20 * DAY_MS),
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      .mockImplementationOnce(() =>
        Promise.resolve({
          slug: 'their-name',
          restaurantId: 'r2',
          isPrimary: true,
          releasedAt: null,
        }),
      );
    const service = new RestaurantSlugService(prisma);

    const error = await service.renameSlug('r1', 'their-name').catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.message).not.toMatch(/r2/);
    expect(tx.restaurantSlug.create).not.toHaveBeenCalled();
  });

  it('surfaces a race lost between the advisory lookup and the create as the same conflict as an already-taken slug', async () => {
    const primary = {
      slug: 'current-name',
      restaurantId: 'r1',
      committedAt: new Date(Date.now() - 20 * DAY_MS),
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      // Advisory lookup saw the slug as free...
      .mockImplementationOnce(() => Promise.resolve(null));
    // ...but a concurrent request won the race by the time this create runs.
    tx.restaurantSlug.create.mockRejectedValueOnce(uniqueViolation());
    const service = new RestaurantSlugService(prisma);

    await expect(service.renameSlug('r1', 'lost-the-race')).rejects.toThrow(
      ConflictException,
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

  it('no-ops on an already-tombstoned row rather than throwing or writing again', async () => {
    const { prisma, tx } = makePrisma({
      slug: 'current',
      committedAt: new Date(),
    });
    tx.restaurantSlug.findFirst.mockResolvedValue({
      slug: 'old-name',
      restaurantId: 'r1',
      isPrimary: false,
      releasedAt: new Date('2026-01-01'),
    });
    const service = new RestaurantSlugService(prisma);

    await expect(
      service.releaseSlug('r1', 'old-name'),
    ).resolves.toBeUndefined();
    expect(tx.restaurantSlug.update).not.toHaveBeenCalled();
  });
});
