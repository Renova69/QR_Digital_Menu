import { Test, TestingModule } from '@nestjs/testing';
import { FeatureGuard } from './feature.guard';
import { FeatureService } from './feature.service';
import { FeatureFlag } from './feature-flag.enum';
import { REQUIRE_FEATURE_KEY } from './require-feature.decorator';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';

jest.mock('../prisma/prisma.service');

describe('FeatureGuard', () => {
  let guard: FeatureGuard;
  let reflector: Reflector;
  let prismaMock: {
    user: { findUnique: jest.Mock };
    restaurant: { findUnique: jest.Mock; findFirst: jest.Mock };
    paymentReconciliationIssue: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prismaMock = {
      user: { findUnique: jest.fn() },
      restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
      paymentReconciliationIssue: { findUnique: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeatureGuard,
        FeatureService,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    guard = module.get<FeatureGuard>(FeatureGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  function requireFeatures(features: FeatureFlag[] | undefined) {
    (reflector.getAllAndOverride as jest.Mock).mockImplementation(
      (key: string) => (key === REQUIRE_FEATURE_KEY ? features : undefined),
    );
  }

  function makeCtx(userId = 'u1') {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }),
    } as unknown as ExecutionContext;
  }

  function makeCtxWithReq(req: Record<string, any>, userId = 'u1') {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: userId }, ...req }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows if no feature requirement set', async () => {
    requireFeatures(undefined);
    expect(await guard.canActivate(makeCtx())).toBe(true);
  });

  it('allows staff user whose tier has the required feature', async () => {
    requireFeatures([FeatureFlag.POS]);
    // Staff: has restaurantId
    prismaMock.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });
    prismaMock.restaurant.findUnique.mockResolvedValue({ tier: 'ENTERPRISE' });
    expect(await guard.canActivate(makeCtx())).toBe(true);
  });

  it('allows owner whose tier has the required feature', async () => {
    requireFeatures([FeatureFlag.PAYMENTS_STRIPE]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    prismaMock.restaurant.findUnique.mockResolvedValue({
      ownerId: 'u1',
      tier: 'PROFESSIONAL',
      isActive: true,
      forceTier: null,
    });
    const ctx = makeCtxWithReq({ query: { restaurantId: 'rest-owner' } });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when staff tier lacks the feature', async () => {
    requireFeatures([FeatureFlag.POS]);
    prismaMock.user.findUnique.mockResolvedValue({ restaurantId: 'rest-1' });
    prismaMock.restaurant.findUnique.mockResolvedValue({ tier: 'FREE' });
    await expect(guard.canActivate(makeCtx())).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when owner tier lacks the feature', async () => {
    requireFeatures([FeatureFlag.POS]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    prismaMock.restaurant.findUnique.mockResolvedValue({
      ownerId: 'u1',
      tier: 'STARTER',
      isActive: true,
      forceTier: null,
    });
    const ctx = makeCtxWithReq({ query: { restaurantId: 'rest-owner' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when user has no restaurant', async () => {
    requireFeatures([FeatureFlag.ORDERS_RECEIVE]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    prismaMock.restaurant.findUnique.mockResolvedValue(null);
    const ctx = makeCtxWithReq({ query: { restaurantId: 'rest-owner' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // ── target-aware resolution (#2) ─────────────────────────────────────────

  it('checks the TARGET restaurant (from params.restaurantId), not the first owned', async () => {
    requireFeatures([FeatureFlag.BRANDING_CUSTOM]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    // Target restaurant rest-2 is PROFESSIONAL and owned by the caller.
    prismaMock.restaurant.findUnique.mockResolvedValue({
      ownerId: 'u1',
      tier: 'PROFESSIONAL',
      forceTier: null,
      isActive: true,
    });
    // H-11: extractRestaurantId no longer honours the generic `:id` param — the
    // target must arrive as `:restaurantId` (or query/body restaurantId).
    const ctx = makeCtxWithReq({ params: { restaurantId: 'rest-2' } });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(prismaMock.restaurant.findUnique).toHaveBeenCalledWith({
      where: { id: 'rest-2' },
      select: expect.anything(),
    });
    expect(prismaMock.restaurant.findFirst).not.toHaveBeenCalled();
  });

  it('denies passing another restaurant id you do not own (bypass prevention)', async () => {
    requireFeatures([FeatureFlag.BRANDING_CUSTOM]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    // Target is a PROFESSIONAL restaurant the caller is NOT associated with.
    prismaMock.restaurant.findUnique.mockResolvedValue({
      ownerId: 'someone-else',
      tier: 'PROFESSIONAL',
      forceTier: null,
      isActive: true,
    });
    const ctx = makeCtxWithReq({ query: { restaurantId: 'rest-victim' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('resolves the target from body.restaurantId for staff', async () => {
    requireFeatures([FeatureFlag.PAYMENTS_STRIPE]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: 'rest-3',
      role: 'WAITER',
    });
    prismaMock.restaurant.findUnique.mockResolvedValue({
      ownerId: 'owner-x',
      tier: 'PROFESSIONAL',
      forceTier: null,
      isActive: true,
    });
    const ctx = makeCtxWithReq({ body: { restaurantId: 'rest-3' } });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('resolves an owner reconciliation action from params.issueId', async () => {
    requireFeatures([FeatureFlag.PAYMENTS_STRIPE]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    prismaMock.paymentReconciliationIssue.findUnique.mockResolvedValue({
      restaurantId: 'rest-owner',
    });
    prismaMock.restaurant.findUnique.mockResolvedValue({
      ownerId: 'u1',
      tier: 'PROFESSIONAL',
      forceTier: null,
      isActive: true,
    });

    const ctx = makeCtxWithReq({ params: { issueId: 'issue-1' } });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(
      prismaMock.paymentReconciliationIssue.findUnique,
    ).toHaveBeenCalledWith({
      where: { id: 'issue-1' },
      select: { restaurantId: true },
    });
    expect(prismaMock.restaurant.findUnique).toHaveBeenCalledWith({
      where: { id: 'rest-owner' },
      select: expect.anything(),
    });
  });

  it('honors forceTier on the target restaurant', async () => {
    requireFeatures([FeatureFlag.BRANDING_CUSTOM]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    prismaMock.restaurant.findUnique.mockResolvedValue({
      ownerId: 'u1',
      tier: 'FREE',
      forceTier: 'PROFESSIONAL',
      isActive: true,
    });
    const ctx = makeCtxWithReq({ params: { restaurantId: 'rest-2' } });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  // ── suspension gate (M-10) ───────────────────────────────────────────────

  it('throws ForbiddenException when restaurant is suspended (isActive: false)', async () => {
    requireFeatures([FeatureFlag.POS]);
    // Staff resolves to a target restaurant whose tier WOULD include the feature,
    // but the restaurant has been suspended — suspension must win over entitlement.
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: 'rest-1',
      role: 'WAITER',
    });
    prismaMock.restaurant.findUnique.mockResolvedValue({
      ownerId: 'owner-x',
      tier: 'ENTERPRISE',
      forceTier: null,
      isActive: false,
    });
    const ctx = makeCtxWithReq({ body: { restaurantId: 'rest-1' } });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when caller-owned restaurant (no target) is suspended', async () => {
    requireFeatures([FeatureFlag.POS]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: 'rest-1',
      role: 'OWNER',
    });
    prismaMock.restaurant.findUnique.mockResolvedValue({
      tier: 'ENTERPRISE',
      forceTier: null,
      isActive: false,
    });
    await expect(guard.canActivate(makeCtx())).rejects.toThrow(
      ForbiddenException,
    );
  });

  // ── SUPER_ADMIN bypass (L-1) ─────────────────────────────────────────────

  it('allows SUPER_ADMIN regardless of tier, without any restaurant lookup', async () => {
    requireFeatures([FeatureFlag.POS]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'SUPER_ADMIN',
    });

    expect(await guard.canActivate(makeCtx())).toBe(true);
    // Bypass must short-circuit before resolving any restaurant.
    expect(prismaMock.restaurant.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.restaurant.findFirst).not.toHaveBeenCalled();
  });

  // ── userId resolution from request.user.sub (L-4) ────────────────────────

  it('resolves userId from request.user.sub when id is absent', async () => {
    requireFeatures([FeatureFlag.PAYMENTS_STRIPE]);
    prismaMock.user.findUnique.mockResolvedValue({
      restaurantId: null,
      role: 'OWNER',
    });
    prismaMock.restaurant.findUnique.mockResolvedValue({
      ownerId: 'u-sub',
      tier: 'PROFESSIONAL',
      forceTier: null,
      isActive: true,
    });

    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: 'u-sub' },
          query: { restaurantId: 'rest-owner' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u-sub' },
      select: { restaurantId: true, role: true },
    });
  });

  it('throws AUTH_REQUIRED when neither user.id nor user.sub is present', async () => {
    requireFeatures([FeatureFlag.POS]);
    const ctx = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: {} }) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
