import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// passport-jwt calls `self.fail(info)` (not `self.error(err)`) both when no
// token is present ("No auth token") and when a token is present but fails
// verification (expired/malformed/bad signature). We must tell those apart:
// missing credentials stay anonymous, but an actually-invalid token must be
// rejected rather than silently degrading to anonymous.
const JWT_VERIFY_ERROR_NAMES = new Set([
  'JsonWebTokenError',
  'TokenExpiredError',
  'NotBeforeError',
]);

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt-optional') {
  handleRequest(err: any, user: any, info: any) {
    if (err) throw err;
    if (user) return user;
    if (info && JWT_VERIFY_ERROR_NAMES.has(info.name)) {
      throw new UnauthorizedException(info.message || 'Invalid token');
    }
    return null;
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
