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

    // The invariant being protected: a released slug must never reveal
    // which restaurant it used to point at. If a retired name ever leaked
    // restaurantId/canonicalSlug on the 410 path, a client could resolve a
    // tombstoned slug to a real tenant anyway — the same failure mode as
    // letting the slug resolve to a competitor's menu.
    try {
      await controller.resolveSlug('gone');
      throw new Error('expected resolveSlug to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(GoneException);
      const response = (error as GoneException).getResponse();
      const serialized = JSON.stringify(response);
      expect(serialized).not.toContain('r1');
      expect(serialized).not.toContain('bistro-oranzh');
      expect((error as any).restaurantId).toBeUndefined();
      expect((error as any).canonicalSlug).toBeUndefined();
    }
  });
});

describe('route ordering', () => {
  // The real collision isn't with public/:restaurantId (that's a 2-segment
  // pattern and can never match a 3-segment request like public/resolve/x —
  // proof: public/:restaurantId/meta, /items, /trending are all declared
  // AFTER public/:restaurantId today and work fine in prod). The actual risk
  // is other 3-segment public/ routes: a request to
  // /menu/public/resolve/meta matches BOTH resolveSlug(slug="meta") and
  // getPublicMenuMeta(restaurantId="resolve"), and declaration order alone
  // decides the winner. RESERVED_SLUGS (slug-rules.ts) closes this
  // structurally regardless of order, but this test still locks in the
  // ordering as defense in depth — and scans for every public/ route rather
  // than hardcoding names, so a route added later is covered automatically.
  it('declares resolve before every other public/ route in the file', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'public-menu.controller.ts'),
      'utf8',
    );

    const routeLiteralPattern = /@Get\('(public\/[^']*)'\)/g;
    const routeLiterals: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = routeLiteralPattern.exec(source)) !== null) {
      routeLiterals.push(match[1]);
    }

    // Sanity: the scan itself must find routes, or this test would pass
    // vacuously if the controller's shape ever changed unexpectedly.
    expect(routeLiterals.length).toBeGreaterThan(1);
    expect(routeLiterals).toContain('public/resolve/:slug');

    const resolveIndex = source.indexOf("@Get('public/resolve/:slug')");
    expect(resolveIndex).toBeGreaterThan(-1);

    const otherRoutes = routeLiterals.filter(
      (literal) => literal !== 'public/resolve/:slug',
    );
    expect(otherRoutes.length).toBeGreaterThan(0);

    for (const literal of otherRoutes) {
      const otherIndex = source.indexOf(`@Get('${literal}')`);
      expect(otherIndex).toBeGreaterThan(-1);
      expect(resolveIndex).toBeLessThan(otherIndex);
    }
  });
});
