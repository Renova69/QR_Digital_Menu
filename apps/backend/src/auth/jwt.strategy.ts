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
    // Production: cookie-only — Bearer header bypasses httpOnly cookie security.
    // Dev/test: Bearer allowed so Swagger UI and test helpers work.
    const extractors =
      process.env.NODE_ENV === 'production'
        ? [(req: any) => req?.cookies?.token ?? null]
        : [
            ExtractJwt.fromAuthHeaderAsBearerToken(),
            (req: any) => req?.cookies?.token ?? null,
          ];
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

  async validate(payload: { sub: string; email: string }) {
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

    if (user.role !== 'SUPER_ADMIN') {
      const restaurantIsActive =
        user.staffRestaurant?.isActive ?? user.restaurants[0]?.isActive;
      if (restaurantIsActive === false) {
        throw new UnauthorizedException('ACCOUNT_SUSPENDED');
      }
    }

    const { password, staffRestaurant, restaurants, ...result } = user;
    return result;
  }
}
