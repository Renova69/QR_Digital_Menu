import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OnboardingSlugController, SlugController } from './slug.controller';
import { ReleaseSlugDto } from './dto/release-slug.dto';
import { UpdateSlugDto } from './dto/update-slug.dto';

const req = (id: string) => ({ user: { id } }) as any;

// commit() doesn't use RestaurantSlugService.assertOwner — it authorizes via
// RestaurantsService.findOneForManagement (OWNER-or-MANAGER-of-this-
// restaurant). Tests that don't exercise commit() pass an empty mock here;
// tests that do exercise commit() configure findOneForManagement explicitly.
const emptyRestaurants = () => ({}) as any;

describe('SlugController', () => {
  it('lets the owner rename', async () => {
    const service = {
      assertOwner: jest.fn().mockResolvedValue(undefined),
      renameSlug: jest.fn().mockResolvedValue('new-name'),
    } as any;
    const controller = new SlugController(service, emptyRestaurants());

    await expect(
      controller.rename(
        'r1',
        { slug: 'new-name' } as UpdateSlugDto,
        req('owner-1'),
      ),
    ).resolves.toEqual({ slug: 'new-name' });
    expect(service.assertOwner).toHaveBeenCalledWith('r1', 'owner-1');
    expect(service.renameSlug).toHaveBeenCalledWith('r1', 'new-name');
  });

  // Regression guard: if `slug` ever leaks onto UpdateRestaurantDto, MANAGER
  // silently gains control of the public URL through PATCH /restaurants/:id.
  // This test is not vacuous: assertOwner rejecting must (a) make the
  // controller call itself reject, and (b) prevent renameSlug from ever
  // being invoked. A controller that "handled" the rejection by swallowing
  // it and proceeding to call renameSlug anyway would fail assertion (b); a
  // controller that never awaited assertOwner at all would also fail (b),
  // since renameSlug is a synchronous mock call reachable on the same tick.
  //
  // This has already caught a real regression once: temporarily changing
  // rename() to `assertOwner(...).catch(() => {})` (swallowing the
  // rejection) made this exact assertion fail as expected, confirming the
  // test is load-bearing rather than vacuous.
  it('rejects a MANAGER attempting to rename', async () => {
    const service = {
      assertOwner: jest.fn().mockRejectedValue(new ForbiddenException()),
      renameSlug: jest.fn(),
    } as any;
    const controller = new SlugController(service, emptyRestaurants());

    await expect(
      controller.rename(
        'r1',
        { slug: 'new-name' } as UpdateSlugDto,
        req('manager-1'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.renameSlug).not.toHaveBeenCalled();
  });

  // --- commit(): OWNER-or-MANAGER-of-this-restaurant, via
  // RestaurantsService.findOneForManagement. Not assertOwner (see the
  // controller's file-level "authorization ladder" comment) and not
  // unauthenticated-anyone (that was the finding this fix addresses).

  it('lets a MANAGER of this restaurant commit', async () => {
    const restaurants = {
      findOneForManagement: jest.fn().mockResolvedValue({ id: 'r1' }),
    } as any;
    const service = {
      commitSlug: jest
        .fn()
        .mockResolvedValue({ slug: 'x', committedAt: new Date() }),
    } as any;
    const controller = new SlugController(service, restaurants);

    await controller.commit('r1', req('manager-1'));
    expect(restaurants.findOneForManagement).toHaveBeenCalledWith(
      'r1',
      'manager-1',
    );
    expect(service.commitSlug).toHaveBeenCalledWith('r1');
  });

  it('lets the OWNER commit', async () => {
    const restaurants = {
      findOneForManagement: jest.fn().mockResolvedValue({ id: 'r1' }),
    } as any;
    const service = {
      commitSlug: jest
        .fn()
        .mockResolvedValue({ slug: 'x', committedAt: new Date() }),
    } as any;
    const controller = new SlugController(service, restaurants);

    await controller.commit('r1', req('owner-1'));
    expect(restaurants.findOneForManagement).toHaveBeenCalledWith(
      'r1',
      'owner-1',
    );
    expect(service.commitSlug).toHaveBeenCalledWith('r1');
  });

  // This is the finding this fix round addresses: previously commit() had
  // no authorization check at all, so any authenticated account (staff of a
  // different restaurant, or a CUSTOMER) could commit a stranger's slug.
  // Mirrors the rename regression-guard pattern: assert both the rejection
  // AND that the downstream mutation (commitSlug) was never reached, so a
  // swallow-and-continue implementation would be caught, not just a
  // never-authorizes-at-all one.
  it('rejects a caller who is neither owner nor staff of this restaurant, and never calls commitSlug', async () => {
    const restaurants = {
      findOneForManagement: jest
        .fn()
        .mockRejectedValue(new ForbiddenException()),
    } as any;
    const service = {
      commitSlug: jest.fn(),
    } as any;
    const controller = new SlugController(service, restaurants);

    await expect(controller.commit('r1', req('stranger-1'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.commitSlug).not.toHaveBeenCalled();
  });

  // Consistent with assertOwner: a soft-deleted restaurant 404s, not 403s,
  // so its existence isn't disclosed via a permission error. This is
  // findOneForManagement's own behavior; the test locks in that commit()
  // lets it propagate unwrapped rather than reinterpreting it as a 403.
  it('404s on a soft-deleted restaurant rather than leaking a 403', async () => {
    const restaurants = {
      findOneForManagement: jest
        .fn()
        .mockRejectedValue(new NotFoundException()),
    } as any;
    const service = {
      commitSlug: jest.fn(),
    } as any;
    const controller = new SlugController(service, restaurants);

    await expect(controller.commit('r1', req('owner-1'))).rejects.toThrow(
      NotFoundException,
    );
    expect(service.commitSlug).not.toHaveBeenCalled();
  });

  it('requires ownership to release', async () => {
    const service = {
      assertOwner: jest.fn().mockRejectedValue(new ForbiddenException()),
      releaseSlug: jest.fn(),
    } as any;
    const controller = new SlugController(service, emptyRestaurants());

    await expect(
      controller.release(
        'r1',
        { slug: 'old', confirmation: 'CONFIRM' } as ReleaseSlugDto,
        req('manager-1'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.releaseSlug).not.toHaveBeenCalled();
  });

  it('lets the owner release with CONFIRM token', async () => {
    const service = {
      assertOwner: jest.fn().mockResolvedValue(undefined),
      releaseSlug: jest.fn().mockResolvedValue(undefined),
    } as any;
    const controller = new SlugController(service, emptyRestaurants());

    await expect(
      controller.release(
        'r1',
        { slug: 'old', confirmation: 'CONFIRM' } as ReleaseSlugDto,
        req('owner-1'),
      ),
    ).resolves.toEqual({ released: 'old' });
    expect(service.releaseSlug).toHaveBeenCalledWith('r1', 'old');
  });

  it('lists previous URLs for the owner', async () => {
    const aliases = [
      {
        slug: 'old-name',
        committedAt: new Date('2026-01-01'),
        releasedAt: null,
        createdAt: new Date('2026-01-01'),
      },
    ];
    const service = {
      assertOwner: jest.fn().mockResolvedValue(undefined),
      listAliases: jest.fn().mockResolvedValue(aliases),
      getPrimaryState: jest.fn().mockResolvedValue({
        slug: 'current-name',
        committedAt: null,
        createdAt: new Date('2026-08-01'),
      }),
    } as any;
    const controller = new SlugController(service, emptyRestaurants());

    await expect(controller.aliases('r1', req('owner-1'))).resolves.toEqual({
      primary: {
        slug: 'current-name',
        committedAt: null,
        createdAt: new Date('2026-08-01'),
      },
      aliases,
    });
    expect(service.assertOwner).toHaveBeenCalledWith('r1', 'owner-1');
    expect(service.listAliases).toHaveBeenCalledWith('r1');
    expect(service.getPrimaryState).toHaveBeenCalledWith('r1');
  });

  it('does not disclose alias history to a non-owner', async () => {
    const service = {
      assertOwner: jest.fn().mockRejectedValue(new ForbiddenException()),
      listAliases: jest.fn(),
    } as any;
    const controller = new SlugController(service, emptyRestaurants());

    await expect(controller.aliases('r1', req('manager-1'))).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.listAliases).not.toHaveBeenCalled();
  });

  it('reports availability from the service, advisory only', async () => {
    const service = {
      isSlugAvailable: jest.fn().mockResolvedValue(true),
    } as any;
    const controller = new SlugController(service, emptyRestaurants());

    await expect(controller.available('free-name')).resolves.toEqual({
      available: true,
    });
    expect(service.isSlugAvailable).toHaveBeenCalledWith('free-name');
  });

  it('defaults a missing slug query param to empty string', async () => {
    const service = {
      isSlugAvailable: jest.fn().mockResolvedValue(false),
    } as any;
    const controller = new SlugController(service, emptyRestaurants());

    await controller.available(undefined as unknown as string);
    expect(service.isSlugAvailable).toHaveBeenCalledWith('');
  });

  // Let renameSlug's own ConflictException/BadRequestException propagate
  // unwrapped rather than being re-wrapped or swallowed by the controller.
  it('propagates renameSlug conflicts without re-wrapping', async () => {
    class FakeConflict extends Error {}
    const service = {
      assertOwner: jest.fn().mockResolvedValue(undefined),
      renameSlug: jest.fn().mockRejectedValue(new FakeConflict('taken')),
    } as any;
    const controller = new SlugController(service, emptyRestaurants());

    await expect(
      controller.rename(
        'r1',
        { slug: 'taken' } as UpdateSlugDto,
        req('owner-1'),
      ),
    ).rejects.toBeInstanceOf(FakeConflict);
  });
});

describe('slug DTOs', () => {
  it('rejects a release without the CONFIRM token', async () => {
    const dto = plainToInstance(ReleaseSlugDto, {
      slug: 'old',
      confirmation: 'yes',
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('accepts a release with the exact CONFIRM token', async () => {
    const dto = plainToInstance(ReleaseSlugDto, {
      slug: 'old',
      confirmation: 'CONFIRM',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects a single-character slug', async () => {
    const dto = plainToInstance(UpdateSlugDto, { slug: 'a' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('rejects an uppercase slug rather than coercing it', async () => {
    const dto = plainToInstance(UpdateSlugDto, { slug: 'Bistro' });
    expect(await validate(dto)).not.toHaveLength(0);
  });

  it('accepts a valid lowercase slug', async () => {
    const dto = plainToInstance(UpdateSlugDto, { slug: 'my-bistro-42' });
    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('OnboardingSlugController', () => {
  it('checks global namespace availability before a restaurant id exists', async () => {
    const service = {
      isSlugAvailable: jest.fn().mockResolvedValue(true),
    } as any;
    const controller = new OnboardingSlugController(service);

    await expect(controller.available('owners-choice')).resolves.toEqual({
      available: true,
    });
    expect(service.isSlugAvailable).toHaveBeenCalledWith('owners-choice');
  });
});
