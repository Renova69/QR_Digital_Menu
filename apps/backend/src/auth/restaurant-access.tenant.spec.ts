import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { PrismaService } from '../prisma/prisma.service';
import { RestaurantAccessGuard } from './restaurant-access.guard';
import {
  getRestaurantAccess,
  RESTAURANT_ACCESS_KEY,
  RestaurantAccessPolicy,
} from './restaurant-access.policy';

describe('Tenant-management access policies', () => {
  const policies: RestaurantAccessPolicy[] = [
    'restaurant-read',
    'restaurant-management',
    'restaurant-owner',
    'device-management',
    'menu-import',
    'menu-audit',
  ];
  const prisma = {
    restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
  };
  const guard = new RestaurantAccessGuard(
    new Reflector(),
    prisma as unknown as PrismaService,
  );
  class Routes {
    read() {}
  }
  const restaurant = {
    id: 'r1',
    ownerId: 'owner',
    tier: 'ENTERPRISE',
    forceTier: null,
    isActive: true,
    deletedAt: null,
  };
  function ctx(req: object, policy: RestaurantAccessPolicy) {
    Reflect.defineMetadata(
      RESTAURANT_ACCESS_KEY,
      { policy, source: 'params', key: 'id' },
      Routes.prototype.read,
    );
    return new ExecutionContextHost([req], Routes, Routes.prototype.read);
  }
  function req() {
    return {
      user: { id: 'owner', role: 'OWNER', restaurantId: 'r2' },
      params: { id: 'r1' },
      body: { restaurantId: 'r2' },
      query: { id: 'r2', restaurantId: 'r2' },
    };
  }
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.restaurant.findUnique.mockResolvedValue({ ...restaurant });
  });
  async function expectStatus(result: Promise<unknown>, status: number) {
    await expect(result).rejects.toBeInstanceOf(HttpException);
    await expect(result).rejects.toMatchObject({ status });
  }

  it.each(policies)(
    '%s uses the path, never the body, query or default tenant',
    async (policy) => {
      const request = req();
      await expect(guard.canActivate(ctx(request, policy))).resolves.toBe(true);
      expect(prisma.restaurant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'r1' } }),
      );
      expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
      expect(getRestaurantAccess(request)?.restaurantId).toBe('r1');
    },
  );
  it.each(policies)(
    '%s keeps actual ownership distinct from an OWNER role label',
    async (policy) => {
      const request = req();
      request.user.id = 'other-owner';
      request.user.restaurantId = 'r2';
      await expectStatus(guard.canActivate(ctx(request, policy)), 403);
      expect(getRestaurantAccess(request)).toBeUndefined();
    },
  );
  it.each(policies)(
    '%s checks current existence and clears a previous context on denial',
    async (policy) => {
      const request = req();
      await guard.canActivate(ctx(request, policy));
      prisma.restaurant.findUnique.mockResolvedValue(null);
      await expectStatus(guard.canActivate(ctx(request, policy)), 404);
      expect(getRestaurantAccess(request)).toBeUndefined();
    },
  );
  it.each(policies)(
    '%s rejects metadata retargeted to a query or child resource',
    async (policy) => {
      const context = ctx(req(), policy);
      for (const metadata of [
        { policy, source: 'query', key: 'id' },
        { policy, source: 'params', key: 'id', resource: 'item' },
      ]) {
        Reflect.defineMetadata(
          RESTAURANT_ACCESS_KEY,
          metadata,
          Routes.prototype.read,
        );
        await expectStatus(guard.canActivate(context), 500);
      }
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    },
  );
  it.each(['restaurant-read', 'menu-audit'] as const)(
    '%s preserves the existing assignment check without inventing a role filter',
    async (policy) => {
      for (const role of [
        'MANAGER',
        'STAFF',
        'WAITER',
        'KITCHEN',
        'CUSTOMER',
        'SUPER_ADMIN',
      ]) {
        const request = req();
        request.user = { id: 'member', role, restaurantId: 'r1' };
        await expect(guard.canActivate(ctx(request, policy))).resolves.toBe(
          true,
        );
        request.user.restaurantId = 'r2';
        await expectStatus(guard.canActivate(ctx(request, policy)), 403);
      }
    },
  );
  it.each(['restaurant-management', 'device-management'] as const)(
    '%s never revives a demoted manager from the body or raw DB cache',
    async (policy) => {
      const request = {
        ...req(),
        user: { id: 'manager', role: 'STAFF', restaurantId: 'r1' },
        _userCache: { role: 'MANAGER' },
      };
      await expectStatus(guard.canActivate(ctx(request, policy)), 403);
    },
  );
});
