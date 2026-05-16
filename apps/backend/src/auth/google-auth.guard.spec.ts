// Mock AuthGuard before importing the guard so the parent class is replaced
jest.mock('@nestjs/passport', () => ({
  AuthGuard: (_strategy: string) =>
    class MockAuthGuard {
      async canActivate(_ctx: any): Promise<boolean> {
        return true;
      }
    },
}));

import { GoogleAuthGuard } from './google-auth.guard';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';

const makeCtx = (
  query: Record<string, any>,
  cookies: Record<string, string> = {},
  nonce?: string,
): ExecutionContext => {
  const req: any = { query, cookies };
  if (nonce !== undefined) req.__oauthNonce = nonce;
  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => ({ cookie: jest.fn(), clearCookie: jest.fn() }),
    }),
  } as any as ExecutionContext;
};

describe('GoogleAuthGuard', () => {
  let guard: GoogleAuthGuard;

  beforeEach(() => {
    guard = new GoogleAuthGuard();
  });

  // ── canActivate ────────────────────────────────────────────────────────────

  describe('canActivate', () => {
    it('initiation: stores nonce cookie and delegates to super', async () => {
      const res = { cookie: jest.fn(), clearCookie: jest.fn() };
      const ctx: ExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({ query: {}, cookies: {} }),
          getResponse: () => res,
        }),
      } as any;

      const result = await guard.canActivate(ctx);

      expect(result).toBe(true);
      expect(res.cookie).toHaveBeenCalledWith('oauth_nonce', expect.any(String), expect.any(Object));
    });

    it('callback: valid nonce match returns true', async () => {
      const nonce = 'abc123';
      const ctx = makeCtx(
        { code: 'auth-code', state: JSON.stringify({ nonce }) },
        { oauth_nonce: nonce },
      );

      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('callback: nonce mismatch throws UnauthorizedException', async () => {
      const ctx = makeCtx(
        { code: 'auth-code', state: JSON.stringify({ nonce: 'wrong' }) },
        { oauth_nonce: 'correct' },
      );

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('callback: invalid JSON state throws UnauthorizedException', async () => {
      const ctx = makeCtx(
        { code: 'auth-code', state: 'not-json' },
        { oauth_nonce: 'some-nonce' },
      );

      await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('callback: no nonce cookie skips nonce validation and proceeds', async () => {
      const ctx = makeCtx(
        { code: 'auth-code', state: JSON.stringify({ nonce: 'n' }) },
        {}, // no oauth_nonce cookie
      );

      expect(await guard.canActivate(ctx)).toBe(true);
    });

    it('callback: error query param triggers callback path', async () => {
      const ctx = makeCtx({ error: 'access_denied' }, {});
      expect(await guard.canActivate(ctx)).toBe(true);
    });
  });

  // ── getAuthenticateOptions ─────────────────────────────────────────────────

  describe('getAuthenticateOptions', () => {
    it('returns empty object for callback requests (code present)', () => {
      const ctx = makeCtx({ code: 'some-code' });
      expect(guard.getAuthenticateOptions(ctx)).toEqual({});
    });

    it('includes nonce in state when __oauthNonce is on the request', () => {
      const ctx = makeCtx({}, {}, 'my-nonce');
      const opts = guard.getAuthenticateOptions(ctx);
      expect(JSON.parse(opts.state as string)).toMatchObject({ nonce: 'my-nonce' });
    });

    it('includes returnTo in state when query param is present', () => {
      const ctx = makeCtx({ returnTo: '/dashboard' });
      const opts = guard.getAuthenticateOptions(ctx);
      expect(JSON.parse(opts.state as string)).toMatchObject({ returnTo: '/dashboard' });
    });

    it('returns empty object when no nonce and no returnTo on initiation', () => {
      const ctx = makeCtx({});
      expect(guard.getAuthenticateOptions(ctx)).toEqual({});
    });
  });
});
