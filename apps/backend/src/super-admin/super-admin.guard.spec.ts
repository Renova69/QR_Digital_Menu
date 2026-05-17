import { SuperAdminGuard } from './super-admin.guard';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

function mockContext(role?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        user: role ? { role } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = new SuperAdminGuard();
  });

  it('should allow SUPER_ADMIN user', () => {
    const ctx = mockContext('SUPER_ADMIN');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should reject OWNER user', () => {
    const ctx = mockContext('OWNER');
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should reject unauthenticated user (no user)', () => {
    const ctx = mockContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
