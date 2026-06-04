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

  async validate(payload: { sub: string; email: string; iat?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        staffRestaurant: {
          select: { isActive: true, tier: true, forceTier: true },
        },
        restaurants: { select: { isActive: true }, take: 1 },
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException('ACCOUNT_DISABLED');
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
      const restaurantIsActive =
        user.staffRestaurant?.isActive ?? user.restaurants[0]?.isActive;
      if (restaurantIsActive === false) {
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

    const { password, staffRestaurant, restaurants, ...result } = user;
    return {
      ...result,
    };
  }
}
