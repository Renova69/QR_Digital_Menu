import {
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes } from 'crypto';
import { Request, Response } from 'express';

const logger = new Logger('GoogleAuthGuard');

// Only permit same-origin destinations. Blocking cross-origin returnTo
// prevents an open redirect that sends an authenticated user to an
// attacker-controlled domain with their session cookie alive (#AUTH-C1).
// Exported so the callback handler can re-validate on consume, not just
// at initiation — the OAuth `state` param is reflected by Google unsigned,
// so it must never be trusted without re-checking at the point of use.
export function isAllowedReturnTo(returnTo: string): boolean {
  if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    // Relative path (e.g. /dashboard) — safe. Reject protocol-relative
    // URLs (//evil.com) which would bypass the origin check.
    return true;
  }
  const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:3001';
  try {
    const parsed = new URL(returnTo);
    const allowedOrigin = new URL(frontendOrigin);
    return (
      parsed.hostname === allowedOrigin.hostname &&
      parsed.port === allowedOrigin.port &&
      parsed.protocol === allowedOrigin.protocol
    );
  } catch (error) {
    // Malformed URL (either returnTo or FRONTEND_URL) — reject, but log so
    // a bad FRONTEND_URL/allowed-origin config isn't a silent OAuth outage.
    logger.warn(
      `Rejecting OAuth returnTo — malformed URL: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}

const NONCE_COOKIE = 'oauth_nonce';
const NONCE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 5 * 60 * 1000, // 5 min — enough for one Google round-trip
  secure: process.env.NODE_ENV === 'production',
};

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const isCallback = !!(req.query['code'] || req.query['error']);

    if (!isCallback) {
      // Initiation — generate nonce, store in short-lived httpOnly cookie
      const nonce = randomBytes(16).toString('hex');
      res.cookie(NONCE_COOKIE, nonce, NONCE_COOKIE_OPTIONS);
      (req as any).__oauthNonce = nonce;
    } else {
      // Callback — validate nonce before Passport exchanges the code
      const cookieNonce = (req.cookies as Record<string, string>)?.[
        NONCE_COOKIE
      ];
      res.clearCookie(NONCE_COOKIE, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
      });

      if (!cookieNonce) {
        throw new UnauthorizedException('OAuth state nonce missing');
      }

      const rawState = req.query['state'] as string | undefined;
      let stateNonce: string | undefined;
      try {
        stateNonce = rawState
          ? (JSON.parse(rawState) as Record<string, string>).nonce
          : undefined;
      } catch {
        throw new UnauthorizedException('Invalid OAuth state');
      }
      if (!stateNonce || stateNonce !== cookieNonce) {
        throw new UnauthorizedException('OAuth state nonce mismatch');
      }
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const isCallback = !!(req.query['code'] || req.query['error']);
    if (isCallback) return {};

    const stateObj: Record<string, string> = {};
    const nonce = (req as any).__oauthNonce as string | undefined;
    if (nonce) stateObj.nonce = nonce;
    if (req.query['returnTo']) {
      const returnTo = req.query['returnTo'] as string;
      if (isAllowedReturnTo(returnTo)) {
        stateObj.returnTo = returnTo;
      }
    }

    return Object.keys(stateObj).length
      ? { state: JSON.stringify(stateObj) }
      : {};
  }
}
