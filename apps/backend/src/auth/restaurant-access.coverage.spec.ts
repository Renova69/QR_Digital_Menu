import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Controller, Get, Type, UseGuards } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RestaurantAccessGuard } from './restaurant-access.guard';
import { RequireRestaurantAccess } from './require-restaurant-access.decorator';
import {
  isRestaurantAccessRequirement,
  RESTAURANT_ACCESS_KEY,
  RestaurantAccessRequirement,
} from './restaurant-access.policy';
import { LEGACY_RESTAURANT_ACCESS_ROUTES } from './restaurant-access.legacy-routes';
import { FeatureGuard } from '../subscription/feature.guard';
import { REQUIRE_FEATURE_KEY } from '../subscription/require-feature.decorator';

const reflector = new Reflector();
const sourceRoot = join(__dirname, '..');

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? controllerFiles(path)
      : entry.name.endsWith('.controller.ts')
        ? [path]
        : [];
  });
}

type Route = {
  id: string;
  controller: Type<unknown>;
  handler: (...args: never[]) => unknown;
};
function routesOn(controller: Type<unknown>, file: string): Route[] {
  const prototype = controller.prototype as object;
  return Object.getOwnPropertyNames(prototype).flatMap((name) => {
    const handler: unknown = Object.getOwnPropertyDescriptor(
      prototype,
      name,
    )?.value;
    return typeof handler === 'function' &&
      Reflect.hasMetadata(METHOD_METADATA, handler)
      ? [
          {
            id: `${file}:${controller.name}.${name}`,
            controller,
            handler: handler as (...args: never[]) => unknown,
          },
        ]
      : [];
  });
}

function guardErrors(route: Route): string[] {
  const { controller, handler, id } = route;
  const requirement = reflector.getAllAndOverride<RestaurantAccessRequirement>(
    RESTAURANT_ACCESS_KEY,
    [handler, controller],
  );
  if (!requirement)
    return [
      `${id}: missing RequireRestaurantAccess or explicit legacy/public classification`,
    ];
  const guards: unknown[] = [
    ...((Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []),
  ];
  const jwt = guards.indexOf(JwtAuthGuard);
  const access = guards.indexOf(RestaurantAccessGuard);
  const feature = guards.indexOf(FeatureGuard);
  const errors: string[] = [];
  if (jwt < 0 || access < 0 || jwt > access)
    errors.push(`${id}: JWT must run before restaurant access`);
  if (feature >= 0 && (access < 0 || feature < access))
    errors.push(`${id}: feature check must use the authorized tenant`);
  const requiredFeature = reflector.getAllAndOverride<unknown>(
    REQUIRE_FEATURE_KEY,
    [handler, controller],
  );
  if (requiredFeature && feature < 0)
    errors.push(`${id}: feature metadata without FeatureGuard`);
  if (!isRestaurantAccessRequirement(requirement))
    errors.push(`${id}: invalid access policy`);
  return errors;
}

describe('Restaurant access route coverage (explicit rollout inventory)', () => {
  it('discovers EVERY controller so newly added routes cannot silently skip authorization review', async () => {
    const routes: Route[] = [];
    for (const file of controllerFiles(sourceRoot)) {
      const exports: Record<string, unknown> = await import(file);
      for (const candidate of Object.values(exports)) {
        if (
          typeof candidate === 'function' &&
          Reflect.hasMetadata(PATH_METADATA, candidate)
        ) {
          routes.push(
            ...routesOn(
              candidate as Type<unknown>,
              relative(sourceRoot, file).replaceAll('\\', '/'),
            ),
          );
        }
      }
    }
    const legacy = new Map<string, string>();
    for (const entry of LEGACY_RESTAURANT_ACCESS_ROUTES) {
      expect(entry.reason.length).toBeGreaterThan(20);
      for (const method of entry.routes) {
        const id = `${entry.file}:${entry.controller}.${method}`;
        expect(legacy.has(id)).toBe(false);
        legacy.set(id, entry.reason);
      }
    }
    const errors: string[] = [];
    const seen = new Set<string>();
    let migrated = 0;
    for (const route of routes) {
      expect(seen.has(route.id)).toBe(false);
      seen.add(route.id);
      const requirement =
        reflector.getAllAndOverride<RestaurantAccessRequirement>(
          RESTAURANT_ACCESS_KEY,
          [route.handler, route.controller],
        );
      if (requirement) {
        migrated++;
        if (legacy.has(route.id))
          errors.push(`${route.id}: remove stale legacy exemption`);
        errors.push(...guardErrors(route));
      } else if (!legacy.has(route.id)) errors.push(...guardErrors(route));
    }
    for (const id of legacy.keys())
      if (!seen.has(id)) errors.push(`${id}: stale/renamed legacy entry`);
    expect(migrated).toBeGreaterThanOrEqual(64);
    expect(routes.length).toBeGreaterThanOrEqual(245);
    expect(errors).toEqual([]);
  });

  it('catches a new unguarded route rather than only testing a hand-picked list', () => {
    @Controller('fixture')
    class Unsafe {
      @Get() read() {}
    }
    expect(guardErrors(routesOn(Unsafe, 'fixture')[0])).toEqual([
      expect.stringContaining('missing RequireRestaurantAccess'),
    ]);
  });
  it('catches a route that lost the guard but kept policy metadata', () => {
    @Controller('fixture')
    class Unsafe {
      @RequireRestaurantAccess({
        policy: 'dashboard',
        source: 'query',
        key: 'restaurantId',
      })
      @Get()
      read() {}
    }
    Reflect.defineMetadata(
      GUARDS_METADATA,
      [JwtAuthGuard],
      Unsafe.prototype.read,
    );
    expect(guardErrors(routesOn(Unsafe, 'fixture')[0])).toEqual([
      expect.stringContaining('JWT must run before restaurant access'),
    ]);
  });
  it('catches feature checks ordered before the tenant guard', () => {
    @UseGuards(FeatureGuard)
    @Controller('fixture')
    class Unsafe {
      @RequireRestaurantAccess({
        policy: 'dashboard',
        source: 'query',
        key: 'restaurantId',
      })
      @Get()
      read() {}
    }
    expect(guardErrors(routesOn(Unsafe, 'fixture')[0])).toEqual([
      expect.stringContaining('feature check must use the authorized tenant'),
    ]);
  });
  it('accepts guarded class defaults without requiring per-method duplication', () => {
    @RequireRestaurantAccess({
      policy: 'staff-management',
      source: 'params',
      key: 'restaurantId',
    })
    @Controller('fixture/:restaurantId')
    class Safe {
      @Get() read() {}
    }
    expect(guardErrors(routesOn(Safe, 'fixture')[0])).toEqual([]);
  });
});
