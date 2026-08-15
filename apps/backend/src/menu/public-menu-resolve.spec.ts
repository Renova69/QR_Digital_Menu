import { GoneException, NotFoundException } from '@nestjs/common';
import { PublicMenuController } from './public-menu.controller';

describe('PublicMenuController.resolveSlug', () => {
  const crud = {} as any;

  it('returns the restaurant id and canonical slug', async () => {
    const slugs = {
      resolve: jest.fn().mockResolvedValue({
        restaurantId: 'r1',
        canonicalSlug: 'bistro-oranzh',
        releasedAt: null,
      }),
    } as any;
    const controller = new PublicMenuController(crud, slugs);

    await expect(controller.resolveSlug('bistro-oranzh')).resolves.toEqual({
      restaurantId: 'r1',
      canonicalSlug: 'bistro-oranzh',
    });
  });

  it('404s an unknown slug', async () => {
    const slugs = { resolve: jest.fn().mockResolvedValue(null) } as any;
    const controller = new PublicMenuController(crud, slugs);

    await expect(controller.resolveSlug('nope')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('410s a tombstoned slug rather than serving another tenant', async () => {
    const slugs = {
      resolve: jest.fn().mockResolvedValue({
        restaurantId: 'r1',
        canonicalSlug: 'bistro-oranzh',
        releasedAt: new Date('2026-01-01'),
      }),
    } as any;
    const controller = new PublicMenuController(crud, slugs);

    await expect(controller.resolveSlug('gone')).rejects.toThrow(GoneException);
  });
});

describe('route ordering', () => {
  it('declares resolve before the :restaurantId wildcard', () => {
    // Guards a real NestJS footgun: declaration order decides matching, so a
    // wildcard declared first would swallow /public/resolve.
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'public-menu.controller.ts'),
      'utf8',
    );
    expect(source.indexOf("'public/resolve/:slug'")).toBeGreaterThan(-1);
    expect(source.indexOf("'public/resolve/:slug'")).toBeLessThan(
      source.indexOf("'public/:restaurantId'"),
    );
  });
});
