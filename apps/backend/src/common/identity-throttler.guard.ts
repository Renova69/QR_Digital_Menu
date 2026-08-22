import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * P1-1: rate-limit by *who is calling*, not by whatever address the network
 * happens to report.
 *
 * The stock guard keys on `req.ip`. Two problems with that here:
 *
 *  1. Until `trust proxy` was set (main.ts), `req.ip` on Cloud Run was the
 *     Google front end — identical for every caller — so every limit in the
 *     application was one shared bucket rather than a per-caller one.
 *
 *  2. `X-Forwarded-For` is only trustworthy on the path through Vercel, which
 *     overwrites it. A caller reaching the run.app origin directly sets it
 *     freely, so an IP key alone is spoofable until ingress is restricted
 *     (PD-1).
 *
 * So prefer the authenticated identity when there is one: a JWT subject cannot
 * be rotated the way a header can, which means an authenticated abuser is
 * limited per account no matter how they present themselves at the network
 * layer. Anonymous callers still fall back to the address — imperfect, but it
 * is the only signal available on the public menu and login paths, and it is
 * the reason per-account lockout (P1-2) exists as a separate control rather
 * than relying on throttling for credential stuffing.
 */
@Injectable()
export class IdentityThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Both shapes appear across the guards in this codebase: `id` from the JWT
    // strategy's return value, `sub` from a raw payload.
    const userId = req?.user?.id ?? req?.user?.sub;
    if (typeof userId === 'string' && userId.length > 0) {
      // Namespaced so a user id can never collide with an address.
      return `user:${userId}`;
    }

    const ip = req?.ip ?? req?.socket?.remoteAddress ?? 'unknown';
    return `ip:${ip}`;
  }
}
