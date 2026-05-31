import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
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
          throw new Error(
            'JWT_SECRET must be set in production environment',
          );
        }
        return secret;
      })(),
    });
  }

  async validate(payload: { sub: string; email: string; iat?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        staffRestaurant: { select: { isActive: true } },
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

    const { password, staffRestaurant, restaurants, ...result } = user;
    // Existing owners pre-dating the onboarding flow have onboardingComplete=false in DB.
    // Treat any owner who already has a restaurant as having completed onboarding.
    const ownsRestaurant = restaurants.length > 0;
    return {
      ...result,
      onboardingComplete: result.onboardingComplete || ownsRestaurant,
    };
  }
}
