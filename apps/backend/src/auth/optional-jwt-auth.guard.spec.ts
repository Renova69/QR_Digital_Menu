import { UnauthorizedException } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

// F-AUTH-2 regression: the optional guard must stay anonymous when NO
// credential is presented, but must REJECT a token that is present yet invalid
// (expired/malformed/bad signature) rather than silently degrading to
// anonymous. passport-jwt reports both cases via `info` on `fail()`, so the
// distinction lives entirely in handleRequest().
describe('OptionalJwtAuthGuard.handleRequest (F-AUTH-2)', () => {
  const guard = new OptionalJwtAuthGuard();

  it('returns the user when authentication succeeds', () => {
    const user = { id: 'u1', role: 'OWNER' };
    expect(guard.handleRequest(null, user, undefined)).toBe(user);
  });

  it('stays anonymous when no token is present', () => {
    const info = { name: 'Error', message: 'No auth token' };
    expect(guard.handleRequest(null, false, info)).toBeNull();
  });

  it('stays anonymous when there is no info at all', () => {
    expect(guard.handleRequest(null, false, undefined)).toBeNull();
  });

  it.each([
    'JsonWebTokenError', // malformed / bad signature
    'TokenExpiredError', // expired
    'NotBeforeError', // nbf in the future
  ])('rejects a present-but-invalid token (%s)', (name) => {
    expect(() =>
      guard.handleRequest(null, false, { name, message: 'invalid' }),
    ).toThrow(UnauthorizedException);
  });

  it('rethrows a hard strategy error', () => {
    const err = new Error('strategy blew up');
    expect(() => guard.handleRequest(err, false, undefined)).toThrow(
      'strategy blew up',
    );
  });
});
