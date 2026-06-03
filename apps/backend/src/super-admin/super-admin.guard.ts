import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (request.user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException({
        code: 'SUPER_ADMIN_REQUIRED',
        message: 'Only super admins can access this resource',
      });
    }
    if (!request.user?.isActive) {
      throw new ForbiddenException({
        code: 'ACCOUNT_DEACTIVATED',
        message: 'Super admin account is deactivated',
      });
    }
    return true;
  }
}
