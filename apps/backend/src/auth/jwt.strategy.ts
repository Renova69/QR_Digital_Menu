import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { FeatureService } from '../subscription/feature.service';
import { isBearerJwtAuthEnabled } from './auth-runtime-policy';
import { SessionRevocationService } from './session-revocation.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly sessionRevocation: SessionRevocationService,
    private readonly configService: ConfigService,
    private readonly featureService: FeatureService,
  ) {
    const extractors = isBearerJwtAuthEnabled()
      ? [
          ExtractJwt.fromAuthHeaderAsBearerToken(),
          (req: any) => req?.cookies?.token ?? null,
        ]
      : [(req: any) => req?.cookies?.token ?? null];
    super({
      jwtFromRequest: ExtractJwt.fromExtractors(extractors),
      ignoreExpiration: false,
      secretOrKey: (() => {
        if (process.env.NODE_ENV === 'test') return 'test-secret';
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET must be set in production environment');
        }
        return secret;
      })(),
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    iat?: number;
    sessionId?: string;
    sessionVersion?: number;
    deviceTokenId?: string;
    deviceSessionVersion?: number;
    isImpersonation?: boolean;
    impersonationSessionId?: string;
  }) {
    // Every "is this session still alive?" rule lives in one service so the
    // websocket handshake enforces exactly what this path does. Throws a 401
    // carrying the specific revocation code.
    const user = await this.sessionRevocation.assertSessionUsable(payload);

    if (
      user.role !== 'SUPER_ADMIN' &&
      user.role !== 'OWNER' &&
      user.role !== 'CUSTOMER'
    ) {
      // It's a staff role: MANAGER, WAITER, KITCHEN, STAFF
      const restaurant = user.staffRestaurant;
      if (restaurant) {
        const effectiveTier = this.featureService.getEffectiveTier(
          restaurant.tier ?? 'FREE',
          restaurant.forceTier,
        );
        const allowedRoles =
          this.featureService.getAllowedStaffRoles(effectiveTier);
        if (!allowedRoles.includes(user.role)) {
          if (allowedRoles.length > 0) {
            user.role = allowedRoles[0] as any; // demote to first allowed role (e.g. 'STAFF')
          } else {
            throw new UnauthorizedException('STAFF_ACCESS_LOCKED');
          }
        }
      }
    }

    // P0-4: allowlist, never a blocklist. This value becomes req.user and is
    // returned by GET /auth/me (minus the internal session id), so a destructure-the-bad-fields
    // approach leaks every column added to User afterwards — which is how
    // pinHash (bcrypt over a 4-digit PIN, a 10,000-candidate keyspace) ended
    // up in the browser. Anything added here is a deliberate decision to
    // expose it to the client; jwt.strategy.spec.ts pins the exact key set.
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      // Not user.role from the DB row directly: the tier check above may have
      // demoted it in flight, and callers must see the effective role.
      role: user.role,
      restaurantId: user.restaurantId,
      onboardingComplete: user.onboardingComplete,
      onboardingStep: user.onboardingStep,
      isActive: user.isActive,
      // Internal request context used by session-management endpoints. GET
      // /auth/me strips this opaque id before returning the profile.
      ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
      ...(payload.isImpersonation
        ? {
            isImpersonation: true,
            impersonationSessionId: payload.impersonationSessionId,
          }
        : {}),
    };
  }
}
