import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { HttpException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantAccessGuard } from './restaurant-access.guard';
import {
  getRestaurantAccess,
  RESTAURANT_ACCESS_KEY,
  RestaurantAccessPolicy,
  RestaurantAccessRequirement,
} from './restaurant-access.policy';

describe('RestaurantAccessGuard policy matrix', () => {
  const restaurant = {
    id: 'r1',
    ownerId: 'owner',
    tier: 'ENTERPRISE',
    forceTier: null,
    isActive: true,
    deletedAt: null,
  };
  const prisma = {
    restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
  };
  const guard = new RestaurantAccessGuard(
    new Reflector(),
    prisma as unknown as PrismaService,
  );
  const policies: RestaurantAccessPolicy[] = [
    'dashboard',
    'print-management',
    'staff-management',
    'scan-stats',
  ];
  class Routes {
    read() {}
  }

  function requestFor(role = 'OWNER', id = 'owner', restaurantId = 'r1') {
    return {
      user: { id, role, restaurantId },
      query: { restaurantId: 'r1' } as Record<string, unknown>,
      params: { restaurantId: 'r1' },
    };
  }
  function context(
    request: object,
    policy: RestaurantAccessPolicy = 'dashboard',
    source: 'query' | 'params' = 'query',
  ) {
    Reflect.defineMetadata(
      RESTAURANT_ACCESS_KEY,
      {
        policy,
        source,
        key: 'restaurantId',
      } satisfies RestaurantAccessRequirement,
      Routes.prototype.read,
    );
    return new ExecutionContextHost([request], Routes, Routes.prototype.read);
  }
  async function expectStatus(promise: Promise<unknown>, status: number) {
    await expect(promise).rejects.toBeInstanceOf(HttpException);
    await expect(promise).rejects.toMatchObject({ status });
  }
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ ...restaurant });
    prisma.restaurant.findFirst.mockResolvedValue({ ...restaurant });
  });

  it.each(policies)(
    '%s permits its actual owner and publishes a minimal immutable context',
    async (policy) => {
      const request = requestFor();
      await expect(guard.canActivate(context(request, policy))).resolves.toBe(
        true,
      );
      expect(getRestaurantAccess(request)).toEqual({
        restaurantId: 'r1',
        userId: 'owner',
        role: 'OWNER',
        tier: 'ENTERPRISE',
        forceTier: null,
      });
      expect(Object.isFrozen(getRestaurantAccess(request))).toBe(true);
      expect(getRestaurantAccess(request)).not.toHaveProperty('ownerId');
    },
  );

  it.each([
    ['MANAGER', true, false, true, true],
    ['STAFF', false, false, false, true],
    ['WAITER', false, false, false, true],
    ['KITCHEN', false, false, false, true],
    ['CUSTOMER', false, false, false, false],
    ['SUPER_ADMIN', false, false, false, false],
    ['OWNER', false, false, true, false],
  ] as const)(
    'preserves the assigned %s role matrix (no super-admin bypass)',
    async (role, ...allowed) => {
      for (const [index, policy] of policies.entries()) {
        const request = requestFor(role, 'assigned');
        const result = guard.canActivate(context(request, policy));
        if (allowed[index]) await expect(result).resolves.toBe(true);
        else {
          await expectStatus(result, 403);
          expect(getRestaurantAccess(request)).toBeUndefined();
        }
      }
    },
  );

  it.each(policies)(
    '%s rejects an owner of another restaurant',
    async (policy) => {
      await expectStatus(
        guard.canActivate(
          context(requestFor('OWNER', 'other-owner', 'r2'), policy),
        ),
        403,
      );
    },
  );
  it.each(policies)(
    '%s rejects a manager assigned elsewhere',
    async (policy) => {
      await expectStatus(
        guard.canActivate(
          context(requestFor('MANAGER', 'manager', 'r2'), policy),
        ),
        403,
      );
    },
  );
  it.each(policies)(
    '%s requires authentication even when accidentally wired alone',
    async (policy) => {
      await expectStatus(
        guard.canActivate(context({ query: { restaurantId: 'r1' } }, policy)),
        401,
      );
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    },
  );

  it('uses the effective demoted role, not a raw database or request-body MANAGER role', async () => {
    const request = {
      ...requestFor('STAFF', 'manager'),
      body: { role: 'MANAGER' },
      _userCache: { role: 'MANAGER', restaurantId: 'r1' },
    };
    await expectStatus(guard.canActivate(context(request, 'dashboard')), 403);
    await expectStatus(
      guard.canActivate(context(request, 'staff-management')),
      403,
    );
  });
  it('accepts normalized manager roles and the legacy sub identity', async () => {
    const request = {
      user: { sub: 'manager', role: 'manager', restaurantId: 'r1' },
      params: { restaurantId: 'r1' },
    };
    await guard.canActivate(context(request, 'staff-management', 'params'));
    expect(getRestaurantAccess(request)).toMatchObject({
      role: 'MANAGER',
      userId: 'manager',
    });
  });

  it.each([
    undefined,
    null,
    '',
    ' ',
    ' r1',
    'r1 ',
    ['r1'],
    { id: 'r1' },
    12,
    'x'.repeat(201),
  ])('rejects malformed ids before any database access: %p', async (value) => {
    const request = requestFor();
    request.query.restaurantId = value;
    await expectStatus(guard.canActivate(context(request)), 400);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
  });
  it('uses only the declared source, not a body/query override of the path', async () => {
    const request = {
      ...requestFor(),
      query: { restaurantId: 'r2' },
      body: { restaurantId: 'r3' },
    };
    await guard.canActivate(context(request, 'staff-management', 'params'));
    expect(prisma.restaurant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r1' } }),
    );
    expect(getRestaurantAccess(request)?.restaurantId).toBe('r1');
  });
  it('does not recover a missing path id from another input', async () => {
    await expectStatus(
      guard.canActivate(
        context({ ...requestFor(), params: {} }, 'staff-management', 'params'),
      ),
      400,
    );
  });

  it('selects the earliest non-deleted owned restaurant only for an omitted print query', async () => {
    const request = {
      ...requestFor('OWNER', 'owner', 'r2'),
      query: {},
      body: { restaurantId: 'r2' },
    };
    await guard.canActivate(context(request, 'print-management'));
    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: { ownerId: 'owner', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: expect.any(Object),
    });
    expect(getRestaurantAccess(request)?.restaurantId).toBe('r1');
  });
  it('does not fall back from an explicit missing/foreign printer restaurant', async () => {
    prisma.restaurant.findUnique.mockResolvedValue(null);
    await expectStatus(
      guard.canActivate(context(requestFor(), 'print-management')),
      404,
    );
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
  });
  it('rejects empty printer input instead of silently selecting another tenant', async () => {
    const request = requestFor();
    request.query.restaurantId = '';
    await expectStatus(
      guard.canActivate(context(request, 'print-management')),
      400,
    );
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
  });
  it('rejects absent and suspended owner fallbacks', async () => {
    prisma.restaurant.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...restaurant, isActive: false });
    await expectStatus(
      guard.canActivate(
        context({ ...requestFor(), query: {} }, 'print-management'),
      ),
      404,
    );
    await expectStatus(
      guard.canActivate(
        context({ ...requestFor(), query: {} }, 'print-management'),
      ),
      403,
    );
  });

  it.each(policies)(
    '%s preserves missing-restaurant status',
    async (policy) => {
      prisma.restaurant.findUnique.mockResolvedValue(null);
      await expectStatus(
        guard.canActivate(context(requestFor(), policy)),
        policy === 'dashboard' ? 403 : 404,
      );
    },
  );
  it.each(['isActive', 'deletedAt'] as const)(
    'preserves the existing %s gates without blocking staff recovery or historical scan reporting',
    async (field) => {
      prisma.restaurant.findUnique.mockResolvedValue({
        ...restaurant,
        [field]: field === 'isActive' ? false : new Date(),
      });
      for (const policy of policies) {
        const result = guard.canActivate(context(requestFor(), policy));
        if (policy === 'dashboard') await expectStatus(result, 403);
        else if (policy === 'print-management')
          await expectStatus(result, field === 'isActive' ? 403 : 404);
        else await expect(result).resolves.toBe(true);
      }
    },
  );
  it('does not cache permission across requests or retain a context after a later denial', async () => {
    const request = requestFor();
    await guard.canActivate(context(request));
    expect(getRestaurantAccess({ ...request })).toBeUndefined();
    prisma.restaurant.findUnique.mockResolvedValue({
      ...restaurant,
      ownerId: 'new-owner',
    });
    await expectStatus(guard.canActivate(context(request)), 403);
    expect(getRestaurantAccess(request)).toBeUndefined();
    expect(prisma.restaurant.findUnique).toHaveBeenCalledTimes(2);
  });
  it('propagates database failures without publishing an authorized context', async () => {
    const request = requestFor();
    prisma.restaurant.findUnique.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(guard.canActivate(context(request))).rejects.toThrow(
      'database unavailable',
    );
    expect(getRestaurantAccess(request)).toBeUndefined();
  });
  it('fails closed for missing or invalid policy metadata', async () => {
    const ctx = context(requestFor());
    Reflect.deleteMetadata(RESTAURANT_ACCESS_KEY, Routes.prototype.read);
    await expectStatus(guard.canActivate(ctx), 500);
    Reflect.defineMetadata(
      RESTAURANT_ACCESS_KEY,
      { policy: 'anything', source: 'query', key: 'restaurantId' },
      Routes.prototype.read,
    );
    await expectStatus(guard.canActivate(ctx), 500);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
  });
  it('never opens HTTP context for websocket/RPC usage', async () => {
    const ctx = context(requestFor());
    ctx.setType('ws');
    const http = jest.spyOn(ctx, 'switchToHttp');
    await expectStatus(guard.canActivate(ctx), 403);
    expect(http).not.toHaveBeenCalled();
  });
});
