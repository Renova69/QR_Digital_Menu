import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { isBearerJwtAuthEnabled } from './auth-runtime-policy';

@Injectable()
export class OptionalJwtStrategy extends PassportStrategy(
  Strategy,
  'jwt-optional',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
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
        if (!secret) throw new Error('JWT_SECRET must be set');
        return secret;
      })(),
    });
  }

  // Identity is optional on the endpoints using this strategy, but when a token
  // IS present it must be honored exactly like the mandatory JwtStrategy: a
  // disabled/revoked account, or a token issued before a password change, must
  // be rejected — not silently attributed to the order. (#1)
  async validate(payload: { sub: string; email: string; iat?: number }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        isActive: true,
        disabledAt: true,
        passwordChangedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.isActive === false || user.disabledAt) {
      throw new UnauthorizedException('ACCOUNT_DISABLED');
    }
    if (
      user.passwordChangedAt &&
      payload.iat &&
      payload.iat * 1000 < user.passwordChangedAt.getTime()
    ) {
      throw new UnauthorizedException('PASSWORD_CHANGED');
    }

    return { id: user.id, email: user.email };
  }
}
