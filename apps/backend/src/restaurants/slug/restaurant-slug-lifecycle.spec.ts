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
      // renameSlug now reads createdAt to decide whether the 24h clock
      // backstop applies — this fixture is deliberately recent so the
      // backstop stays inactive and the rename is a free edit, which is
      // exactly the property this test asserts. See the "24h clock
      // backstop" describe block below for the aged-fixture counterpart.
      createdAt: new Date(),
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

describe('renameSlug — slug rule validation gate (Task 20c)', () => {
  // Closes the hole audited in Task 20c: validateSlug's five rules (LENGTH,
  // FORMAT, PUNYCODE, NUMERIC, RESERVED) were only ever wired to the
  // advisory isSlugAvailable check backing GET .../slug/available.
  // renameSlug — the actual write path — called none of it, so an owner
  // could rename straight onto a reserved word, a punycode-prefixed string,
  // or an all-numeric slug. These tests prove the gate now runs, and that it
  // runs cheaply: rejection must happen before $transaction is even opened,
  // so no cooldown check, no target lookup, and no write are ever attempted.

  function freshPrisma() {
    // Cooldown-cleared, unrelated-to-the-rejected-slug fixture shared by
    // every rejection test below — none of them should get far enough for
    // its contents to matter, which is exactly what each assertion proves.
    return makePrisma({
      slug: 'current-name',
      restaurantId: 'r1',
      committedAt: new Date(Date.now() - 20 * DAY_MS),
    });
  }

  it('rejects a reserved word (api) before opening a transaction', async () => {
    const { prisma } = freshPrisma();
    const service = new RestaurantSlugService(prisma);

    await expect(service.renameSlug('r1', 'api')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects "meta" — the literal /menu/public/resolve/meta route-collision case — before opening a transaction', async () => {
    const { prisma } = freshPrisma();
    const service = new RestaurantSlugService(prisma);

    await expect(service.renameSlug('r1', 'meta')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an xn-- punycode-prefixed slug before opening a transaction', async () => {
    const { prisma } = freshPrisma();
    const service = new RestaurantSlugService(prisma);

    await expect(service.renameSlug('r1', 'xn--foo')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an all-numeric slug before opening a transaction', async () => {
    const { prisma } = freshPrisma();
    const service = new RestaurantSlugService(prisma);

    await expect(service.renameSlug('r1', '12345')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('gives RESERVED and NUMERIC distinct rejection messages, and RESERVED never leaks the reserved list', async () => {
    const reserved = freshPrisma();
    const reservedError = await new RestaurantSlugService(reserved.prisma)
      .renameSlug('r1', 'admin')
      .catch((e) => e);

    const numeric = freshPrisma();
    const numericError = await new RestaurantSlugService(numeric.prisma)
      .renameSlug('r1', '99999')
      .catch((e) => e);

    expect(reservedError).toBeInstanceOf(BadRequestException);
    expect(numericError).toBeInstanceOf(BadRequestException);
    expect(reservedError.message).not.toEqual(numericError.message);
    // Do not leak the reserved set through the error message.
    for (const otherReservedWord of ['www', 'checkout', 'dashboard']) {
      expect(reservedError.message.toLowerCase()).not.toContain(
        otherReservedWord,
      );
    }
  });

  it('still allows a genuinely valid rename through unchanged — the gate does not over-reject', async () => {
    const primary = {
      slug: 'current-name',
      restaurantId: 'r1',
      committedAt: new Date(Date.now() - 20 * DAY_MS),
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      .mockImplementationOnce(() => Promise.resolve(null));
    const service = new RestaurantSlugService(prisma);

    await expect(service.renameSlug('r1', 'valid-new-slug')).resolves.toBe(
      'valid-new-slug',
    );
    expect(tx.restaurantSlug.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'valid-new-slug' }),
      }),
    );
  });
});

describe('renameSlug — 24h clock backstop', () => {
  // The escape path this guards against never calls commitSlug at all: the
  // owner copies their menu URL off the settings page (Task 20) and pastes
  // it somewhere the backend never observes (an Instagram bio, a Google
  // Business listing, a printed flyer). No QR render, no menu view, no
  // order, no reservation ever fires. A rename is the one action an owner
  // can still take on such a slug, so that is where the backstop lives.

  it('renames an uncommitted slug older than 24h into an alias, not a free edit', async () => {
    const primary = {
      slug: 'abandoned-restaurant',
      restaurantId: 'r1',
      committedAt: null,
      createdAt: new Date(Date.now() - 25 * DAY_MS), // long past 24h
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      .mockImplementationOnce(() => Promise.resolve(null)); // target is free
    const service = new RestaurantSlugService(prisma);

    await service.renameSlug('r1', 'new-name');

    // Old row retained as an alias (isPrimary: false), never deleted.
    expect(tx.restaurantSlug.delete).not.toHaveBeenCalled();
    expect(tx.restaurantSlug.update).toHaveBeenCalledWith({
      where: { slug: 'abandoned-restaurant' },
      data: { isPrimary: false },
    });
    expect(tx.restaurantSlug.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'new-name',
          isPrimary: true,
          committedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('still renames an uncommitted slug younger than 24h as a free edit', async () => {
    const primary = {
      slug: 'brand-new-restaurant',
      restaurantId: 'r1',
      committedAt: null,
      createdAt: new Date(), // just created
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      .mockImplementationOnce(() => Promise.resolve(null));
    const service = new RestaurantSlugService(prisma);

    await service.renameSlug('r1', 'new-name');

    // Old row deleted and returned to the pool, no alias created.
    expect(tx.restaurantSlug.delete).toHaveBeenCalledWith({
      where: { slug: 'brand-new-restaurant' },
    });
    expect(tx.restaurantSlug.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPrimary: false } }),
    );
    expect(tx.restaurantSlug.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ slug: 'new-name', committedAt: null }),
      }),
    );
  });

  it('does not apply the cooldown to a backstop-committed rename, and does not crash on the null committedAt', async () => {
    const primary = {
      slug: 'abandoned-restaurant',
      restaurantId: 'r1',
      committedAt: null, // no deliberate commit ever happened
      createdAt: new Date(Date.now() - 25 * DAY_MS),
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      .mockImplementationOnce(() => Promise.resolve(null));
    const service = new RestaurantSlugService(prisma);

    // Would throw (BadRequestException from the cooldown, or a TypeError
    // from `null.getTime()`) if the cooldown check were keyed off the
    // derived isCommitted flag instead of the real committedAt field.
    await expect(service.renameSlug('r1', 'new-name')).resolves.toBe(
      'new-name',
    );
  });

  it('sets committedAt on the new primary row created by a backstop-committed rename', async () => {
    const primary = {
      slug: 'abandoned-restaurant',
      restaurantId: 'r1',
      committedAt: null,
      createdAt: new Date(Date.now() - 30 * DAY_MS),
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      .mockImplementationOnce(() => Promise.resolve(null));
    const service = new RestaurantSlugService(prisma);

    await service.renameSlug('r1', 'new-name');

    const createCall = tx.restaurantSlug.create.mock.calls[0][0];
    expect(createCall.data.committedAt).toBeInstanceOf(Date);
  });

  it('a genuinely committed slug still behaves exactly as before — cooldown enforced, alias created', async () => {
    // committedAt truthy short-circuits the isCommitted check before
    // createdAt is ever read, so this fixture intentionally omits
    // createdAt to prove the short-circuit — a regression that started
    // unconditionally reading primary.createdAt would crash this test.
    const primary = {
      slug: 'long-lived-restaurant',
      restaurantId: 'r1',
      committedAt: new Date(Date.now() - 20 * DAY_MS), // past cooldown
    };
    const { prisma, tx } = makePrisma(primary);
    tx.restaurantSlug.findFirst
      .mockImplementationOnce(() => Promise.resolve(primary))
      .mockImplementationOnce(() => Promise.resolve(null));
    const service = new RestaurantSlugService(prisma);

    await service.renameSlug('r1', 'new-name');

    expect(tx.restaurantSlug.update).toHaveBeenCalledWith({
      where: { slug: 'long-lived-restaurant' },
      data: { isPrimary: false },
    });

    // And still cooldown-blocked when committed recently.
    const insideCooldown = {
      slug: 'recent-rename',
      restaurantId: 'r1',
      committedAt: new Date(Date.now() - 3 * DAY_MS),
    };
    const blocked = makePrisma(insideCooldown);
    const blockedService = new RestaurantSlugService(blocked.prisma);

    await expect(
      blockedService.renameSlug('r1', 'another-name'),
    ).rejects.toThrow(BadRequestException);
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
