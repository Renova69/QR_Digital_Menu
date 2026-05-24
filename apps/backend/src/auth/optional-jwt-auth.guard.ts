import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt-optional') {
  handleRequest(_err: any, user: any) {
    return user ?? null;
  }

  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
