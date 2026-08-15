import { HEADERS_METADATA } from '@nestjs/common/constants';
import { PublicMenuController } from './public-menu.controller';

// Regression guard for the "menu loads fine in incognito, fails in a normal
// browser tab" bug: these routes returned only a weak ETag with no
// Cache-Control, so browsers were free to serve a stale cached menu
// (missing/renamed items, old prices) without even revalidating. Every
// unauthenticated public-menu route must opt out of HTTP caching explicitly —
// authenticatedNoStore middleware only covers requests carrying auth.
describe('PublicMenuController — Cache-Control coverage', () => {
  const publicRouteHandlers = [
    'resolveSlug',
    'getPublicMenu',
    'getPublicMenuMeta',
    'getCategoryItems',
    'getPublicMenuItems',
    'getTrendingItems',
  ] as const;

  it.each(publicRouteHandlers)(
    '%s sets Cache-Control: no-store',
    (handlerName) => {
      const headers: Array<{ name: string; value: string }> =
        Reflect.getMetadata(
          HEADERS_METADATA,
          PublicMenuController.prototype[handlerName],
        ) ?? [];

      const cacheControl = headers.find(
        (header) => header.name.toLowerCase() === 'cache-control',
      );

      expect(cacheControl?.value).toBe('no-store');
    },
  );
});
