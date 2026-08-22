import { OrdersController } from './orders.controller';

// @nestjs/throttler stores per-named-policy limits on the route handler via
// Reflect.defineMetadata(`${THROTTLER_LIMIT}${name}`, ...). The constants are
// not re-exported from the package root, so the literal keys are reproduced
// here (validated against node_modules/@nestjs/throttler/dist/throttler.constants).
const THROTTLER_LIMIT_DEFAULT = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_DEFAULT = 'THROTTLER:TTLdefault';

describe('OrdersController throttling', () => {
  // P0-6: POST /orders is public, CSRF-exempt and resolves a table by its
  // guessable name, which made it the cheapest lever for sweeping a
  // restaurant's tables. It must carry its own limit rather than inheriting
  // the global 100/60s bucket.
  it('rate-limits POST /orders (30 req / 60s)', () => {
    const handler = OrdersController.prototype.create;

    expect(Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, handler)).toBe(30);
    expect(Reflect.getMetadata(THROTTLER_TTL_DEFAULT, handler)).toBe(60000);
  });
});
