import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OptionalJwtStrategy extends PassportStrategy(
  Strategy,
  'jwt-optional',
) {
  constructor(private readonly configService: ConfigService) {
    const allowBearerAuth =
      process.env.NODE_ENV === 'test' ||
      process.env.NODE_ENV === 'development' ||
      process.env.ALLOW_BEARER_AUTH === 'true';

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
        if (!secret) throw new Error('JWT_SECRET must be set');
        return secret;
      })(),
    });
  }

  async validate(payload: { sub: string; email: string }) {
    return { id: payload.sub, email: payload.email };
  }
}
