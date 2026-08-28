import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantAccessGuard } from './restaurant-access.guard';
import {
  getRestaurantAccess,
  RESTAURANT_ACCESS_KEY,
  RestaurantAccessResource,
  setRestaurantAccess,
} from './restaurant-access.policy';

describe('RestaurantAccessGuard menu resource resolution', () => {
  const prisma = {
    restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
    menuCategory: { findUnique: jest.fn() },
    menuItem: { findUnique: jest.fn() },
    menuOption: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const restaurant = {
    id: 'r1',
    ownerId: 'owner',
    tier: 'FREE',
    forceTier: null,
    isActive: true,
    deletedAt: null,
  };
  const resources: RestaurantAccessResource[] = [
    'restaurant',
    'category',
    'item',
    'option',
  ];
  const guard = new RestaurantAccessGuard(
    new Reflector(),
    prisma as unknown as PrismaService,
  );
  class Routes {
    edit() {}
  }
  function requestFor(role = 'OWNER', userId = 'owner', restaurantId = 'r1') {
    return {
      user: { id: userId, role, restaurantId },
      params: { id: 'resource-1' } as Record<string, unknown>,
      query: { restaurantId: 'forged' },
      body: { restaurantId: 'forged', role: 'MANAGER' },
      _userCache: { role: 'MANAGER' },
    };
  }
  function context(
    request: object,
    resource: RestaurantAccessResource = 'item',
  ) {
    Reflect.defineMetadata(
      RESTAURANT_ACCESS_KEY,
      {
        policy: 'menu-management',
        source: 'params',
        key: 'id',
        resource,
      },
      Routes.prototype.edit,
    );
    return new ExecutionContextHost([request], Routes, Routes.prototype.edit);
  }
  async function expectStatus(result: Promise<unknown>, status: number) {
    await expect(result).rejects.toBeInstanceOf(HttpException);
    await expect(result).rejects.toMatchObject({ status });
  }
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ ...restaurant });
    prisma.menuCategory.findUnique.mockResolvedValue({ restaurantId: 'r1' });
    prisma.menuItem.findUnique.mockResolvedValue({
      category: { restaurantId: 'r1' },
    });
    prisma.menuOption.findUnique.mockResolvedValue({
      menuItem: { category: { restaurantId: 'r1' } },
    });
  });

  it.each(resources)(
    'resolves %s only from its declared path and relationship',
    async (resource) => {
      const req = requestFor();
      await expect(guard.canActivate(context(req, resource))).resolves.toBe(
        true,
      );
      expect(prisma.restaurant.findUnique).toHaveBeenCalledWith({
        where: { id: resource === 'restaurant' ? 'resource-1' : 'r1' },
        select: {
          id: true,
          ownerId: true,
          tier: true,
          forceTier: true,
          isActive: true,
          deletedAt: true,
        },
      });
      if (resource === 'category')
        expect(prisma.menuCategory.findUnique).toHaveBeenCalledWith({
          where: { id: 'resource-1' },
          select: { restaurantId: true },
        });
      if (resource === 'item')
        expect(prisma.menuItem.findUnique).toHaveBeenCalledWith({
          where: { id: 'resource-1' },
          select: { category: { select: { restaurantId: true } } },
        });
      if (resource === 'option')
        expect(prisma.menuOption.findUnique).toHaveBeenCalledWith({
          where: { id: 'resource-1' },
          select: {
            menuItem: {
              select: { category: { select: { restaurantId: true } } },
            },
          },
        });
      expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
      expect(getRestaurantAccess(req)).toEqual({
        restaurantId: 'r1',
        userId: 'owner',
        role: 'OWNER',
        tier: 'FREE',
        forceTier: null,
      });
      expect(Object.isFrozen(getRestaurantAccess(req))).toBe(true);
    },
  );

  it.each([
    ['MANAGER', 'manager', 'r1', true],
    ['MANAGER', 'manager', 'r2', false],
    ['STAFF', 'manager', 'r1', false],
    ['WAITER', 'waiter', 'r1', false],
    ['KITCHEN', 'kitchen', 'r1', false],
    ['CUSTOMER', 'customer', 'r1', false],
    ['SUPER_ADMIN', 'admin', 'r1', false],
    ['OWNER', 'other-owner', 'r1', false],
    ['OWNER', 'owner', 'r2', true],
  ] as const)(
    '%s/%s assigned to %s preserves menu permissions: %s',
    async (role, id, tenant, allowed) => {
      for (const resource of resources) {
        const req = requestFor(role, id, tenant);
        const result = guard.canActivate(context(req, resource));
        if (allowed) await expect(result).resolves.toBe(true);
        else {
          await expectStatus(result, 403);
          expect(getRestaurantAccess(req)).toBeUndefined();
        }
      }
      // The JWT's effective role cannot be upgraded by reloading the raw DB role.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['category', 'item', 'option'] as const)(
    'missing %s stops before restaurant lookup',
    async (resource) => {
      prisma.menuCategory.findUnique.mockResolvedValue(null);
      prisma.menuItem.findUnique.mockResolvedValue(null);
      prisma.menuOption.findUnique.mockResolvedValue(null);
      const req = requestFor();
      await expectStatus(guard.canActivate(context(req, resource)), 404);
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
      expect(getRestaurantAccess(req)).toBeUndefined();
    },
  );

  it.each([
    null,
    { ...restaurant, isActive: false },
    { ...restaurant, deletedAt: new Date() },
  ])('preserves missing/suspended/deleted status: %p', async (row) => {
    prisma.restaurant.findUnique.mockResolvedValue(row);
    for (const resource of resources) {
      const result = guard.canActivate(context(requestFor(), resource));
      await expectStatus(result, row ? 403 : 404);
      if (row)
        await expect(result).rejects.toMatchObject({
          response: { code: 'RESTAURANT_SUSPENDED' },
        });
    }
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
    42,
    'x'.repeat(201),
  ])('rejects malformed resource id before querying: %p', async (id) => {
    const req = requestFor();
    req.params.id = id;
    await expectStatus(guard.canActivate(context(req)), 400);
    for (const model of Object.values(prisma)) {
      expect(model.findUnique).not.toHaveBeenCalled();
    }
  });

  it.each([
    null,
    { policy: 'menu-management', source: 'params', key: 'id' },
    { policy: 'menu-management', source: 'query', key: 'id', resource: 'item' },
    {
      policy: 'menu-management',
      source: 'params',
      key: 'id',
      resource: 'anything',
    },
    { policy: 'dashboard', source: 'params', key: 'id', resource: 'item' },
    { policy: 'menu-management', source: 'params', key: 12, resource: 'item' },
    {
      policy: 'menu-management',
      source: 'params',
      key: ' id',
      resource: 'item',
    },
  ])('invalid resource-policy metadata fails closed: %p', async (metadata) => {
    const req = requestFor();
    const ctx = context(req);
    Reflect.defineMetadata(
      RESTAURANT_ACCESS_KEY,
      metadata,
      Routes.prototype.edit,
    );
    await expectStatus(guard.canActivate(ctx), 500);
    for (const model of Object.values(prisma))
      expect(model.findUnique).not.toHaveBeenCalled();
  });

  it.each(['category', 'item', 'option'] as const)(
    'a %s lookup failure never retains an authorized context',
    async (resource) => {
      for (const model of [
        prisma.menuCategory,
        prisma.menuItem,
        prisma.menuOption,
      ]) {
        model.findUnique.mockRejectedValue(new Error('database unavailable'));
      }
      const req = requestFor();
      setRestaurantAccess(req, {
        restaurantId: 'r1',
        userId: 'owner',
        role: 'OWNER',
        tier: 'FREE',
        forceTier: null,
      });
      await expect(guard.canActivate(context(req, resource))).rejects.toThrow(
        'database unavailable',
      );
      expect(getRestaurantAccess(req)).toBeUndefined();
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    },
  );
});
