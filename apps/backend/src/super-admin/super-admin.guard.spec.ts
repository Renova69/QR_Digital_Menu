import { SuperAdminGuard } from './super-admin.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

function mockContext(user?: {
  role?: string;
  isActive?: boolean;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: user ?? undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = new SuperAdminGuard();
  });

  it('should allow active SUPER_ADMIN user', () => {
    const ctx = mockContext({ role: 'SUPER_ADMIN', isActive: true });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject OWNER user', () => {
    const ctx = mockContext({ role: 'OWNER', isActive: true });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject unauthenticated user (no user)', () => {
    const ctx = mockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject deactivated SUPER_ADMIN', () => {
    const ctx = mockContext({ role: 'SUPER_ADMIN', isActive: false });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject SUPER_ADMIN with undefined isActive', () => {
    const ctx = mockContext({ role: 'SUPER_ADMIN' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
