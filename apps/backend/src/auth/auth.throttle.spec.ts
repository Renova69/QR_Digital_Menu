import { AuthController } from './auth.controller';

// @nestjs/throttler stores per-named-policy limits on the route handler via
// Reflect.defineMetadata(`${THROTTLER_LIMIT}${name}`, ...). The constants are
// not re-exported from the package root, so the literal keys are reproduced
// here (validated against node_modules/@nestjs/throttler/dist/throttler.constants).
const THROTTLER_LIMIT_DEFAULT = 'THROTTLER:LIMITdefault';
const THROTTLER_TTL_DEFAULT = 'THROTTLER:TTLdefault';

describe('AuthController throttling', () => {
  it('rate-limits POST /auth/impersonate/exit (10 req / 60s)', () => {
    const handler = AuthController.prototype.exitImpersonation;

    expect(Reflect.getMetadata(THROTTLER_LIMIT_DEFAULT, handler)).toBe(10);
    expect(Reflect.getMetadata(THROTTLER_TTL_DEFAULT, handler)).toBe(60000);
  });
});
