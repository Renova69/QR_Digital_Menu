import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes } from 'crypto';
import { Request, Response } from 'express';

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
      // Only permit relative paths (starting with /) or absolute URLs whose
      // origin matches FRONTEND_URL. Blocking cross-origin returnTo values
      // prevents an open redirect that would send an authenticated user to an
      // attacker-controlled domain with their session cookie alive (#AUTH-C1).
      const frontendOrigin = process.env.FRONTEND_URL || 'http://localhost:3001';
      if (
        returnTo.startsWith('/') ||
        returnTo.startsWith(frontendOrigin)
      ) {
        stateObj.returnTo = returnTo;
      }
    }

    return Object.keys(stateObj).length
      ? { state: JSON.stringify(stateObj) }
      : {};
  }
}
