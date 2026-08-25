import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthErrorCode } from '../common/errors/auth-error-codes';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string): Promise<any> {
    try {
      const user = await this.authService.validateUser(email, password);
      return user;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof (await import('@nestjs/common')).NotFoundException
      ) {
        throw error;
      }
      // Same code and wording as validateUser's own rejection: this branch is
      // only reached when validateUser fails in an unexpected way, and the
      // caller must not be able to tell that apart from a wrong password.
      throw new UnauthorizedException({
        code: AuthErrorCode.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
      });
    }
  }
}
