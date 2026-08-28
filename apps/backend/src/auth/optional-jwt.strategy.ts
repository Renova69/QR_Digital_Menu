import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { isBearerJwtAuthEnabled } from './auth-runtime-policy';
import {
  SessionJwtPayload,
  SessionRevocationService,
} from './session-revocation.service';

@Injectable()
export class OptionalJwtStrategy extends PassportStrategy(
  Strategy,
  'jwt-optional',
) {
  constructor(
    private readonly configService: ConfigService,
    private readonly sessionRevocation: SessionRevocationService,
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
  async validate(payload: SessionJwtPayload & { email: string }) {
    const user = await this.sessionRevocation.assertSessionUsable(payload);
    return { id: user.id, email: user.email };
  }
}
