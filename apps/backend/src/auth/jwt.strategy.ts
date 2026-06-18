import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { FeatureService } from '../subscription/feature.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly featureService: FeatureService,
  ) {
    const allowBearerAuth =
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development' ||
      process.env.ALLOW_BEARER_AUTH === 'true';
    // Production and unset NODE_ENV: cookie-only. Bearer auth must be explicitly enabled.
    const extractors =
      allowBearerAuth && process.env.NODE_ENV !== 'production'
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
    deviceTokenId?: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        staffRestaurant: {
          select: { isActive: true, tier: true, forceTier: true },
        },
        // Issue 21: do NOT fetch restaurants[] — OWNER suspension deferred
        // to verifyDashboardAccess to avoid arbitrary restaurants[0] selection.
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException('ACCOUNT_DISABLED');
    }

    if (payload.deviceTokenId) {
      const deviceToken = await this.prisma.deviceEnrollmentToken.findUnique({
        where: { id: payload.deviceTokenId },
        select: {
          restaurantId: true,
          usedAt: true,
          revokedAt: true,
          restaurant: {
            select: {
              sharedDeviceModeEnabled: true,
              isActive: true,
            },
          },
        },
      });

      if (
        !deviceToken ||
        !deviceToken.usedAt ||
        deviceToken.revokedAt ||
        deviceToken.restaurantId !== user.restaurantId
      ) {
        throw new UnauthorizedException('DEVICE_REVOKED');
      }

      if (deviceToken.restaurant.isActive === false) {
        throw new UnauthorizedException('ACCOUNT_SUSPENDED');
      }

      if (deviceToken.restaurant.sharedDeviceModeEnabled === false) {
        throw new UnauthorizedException('SHARED_DEVICE_MODE_DISABLED');
      }
    }

    // Invalidate tokens issued before the last password change (e.g. super-admin
    // reset). `iat` is in seconds; passwordChangedAt is a Date. Reject stale tokens.
    if (
      user.passwordChangedAt &&
      payload.iat &&
      payload.iat * 1000 < user.passwordChangedAt.getTime()
    ) {
      throw new UnauthorizedException('PASSWORD_CHANGED');
    }

    if (user.role !== 'SUPER_ADMIN') {
      // Issue 21: only check staffRestaurant (staff roles). OWNER restaurant
      // suspension is deferred to verifyDashboardAccess — this avoids blocking
      // an OWNER who has one active and one suspended restaurant via a
      // non-deterministic restaurants[0] pick.
      if (user.staffRestaurant?.isActive === false) {
        throw new UnauthorizedException('ACCOUNT_SUSPENDED');
      }
    }

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

    const { password, staffRestaurant, lastLoginDeviceTokenId, ...result } =
      user as any;
    return {
      ...result,
    };
  }
}
