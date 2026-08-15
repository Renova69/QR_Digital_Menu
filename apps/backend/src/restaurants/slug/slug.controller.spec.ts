import { ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SlugController } from './slug.controller';
import { ReleaseSlugDto } from './dto/release-slug.dto';
import { UpdateSlugDto } from './dto/update-slug.dto';

const req = (id: string) => ({ user: { id } }) as any;

describe('SlugController', () => {
  it('lets the owner rename', async () => {
    const service = {
      assertOwner: jest.fn().mockResolvedValue(undefined),
      renameSlug: jest.fn().mockResolvedValue('new-name'),
    } as any;
    const controller = new SlugController(service);

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
  it('rejects a MANAGER attempting to rename', async () => {
    const service = {
      assertOwner: jest.fn().mockRejectedValue(new ForbiddenException()),
      renameSlug: jest.fn(),
    } as any;
    const controller = new SlugController(service);

    await expect(
      controller.rename(
        'r1',
        { slug: 'new-name' } as UpdateSlugDto,
        req('manager-1'),
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.renameSlug).not.toHaveBeenCalled();
  });

  it('allows commit without owner-only escalation', async () => {
    const service = {
      commitSlug: jest
        .fn()
        .mockResolvedValue({ slug: 'x', committedAt: new Date() }),
    } as any;
    const controller = new SlugController(service);

    await controller.commit('r1');
    expect(service.commitSlug).toHaveBeenCalledWith('r1');
  });

  it('requires ownership to release', async () => {
    const service = {
      assertOwner: jest.fn().mockRejectedValue(new ForbiddenException()),
      releaseSlug: jest.fn(),
    } as any;
    const controller = new SlugController(service);

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
    const controller = new SlugController(service);

    await expect(
      controller.release(
        'r1',
        { slug: 'old', confirmation: 'CONFIRM' } as ReleaseSlugDto,
        req('owner-1'),
      ),
    ).resolves.toEqual({ released: 'old' });
    expect(service.releaseSlug).toHaveBeenCalledWith('r1', 'old');
  });

  it('reports availability from the service, advisory only', async () => {
    const service = {
      isSlugAvailable: jest.fn().mockResolvedValue(true),
    } as any;
    const controller = new SlugController(service);

    await expect(controller.available('free-name')).resolves.toEqual({
      available: true,
    });
    expect(service.isSlugAvailable).toHaveBeenCalledWith('free-name');
  });

  it('defaults a missing slug query param to empty string', async () => {
    const service = {
      isSlugAvailable: jest.fn().mockResolvedValue(false),
    } as any;
    const controller = new SlugController(service);

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
    const controller = new SlugController(service);

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
