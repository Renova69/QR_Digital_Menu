import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  getRestaurantAccess,
  isRestaurantAccessRequirement,
} from './restaurant-access.policy';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';
import { TablesController } from '../tables/tables.controller';
import { TablesService } from '../tables/tables.service';
import { TableZonesController } from '../table-zones/table-zones.controller';
import { TableZonesService } from '../table-zones/table-zones.service';
import { ReservationsController } from '../reservations/reservations.controller';
import { ReservationsService } from '../reservations/reservations.service';

// Real routing, access/feature guards and DTO validation; only auth and I/O are
// substituted. No AppModule, environment file, credentials or database connection.
describe('Tables, zones and reservations restaurant access', () => {
  let app: INestApplication;
  let actor: { id: string; role: string; restaurantId?: string } | undefined;
  let lastRequest: object;
  let jwtCalls = 0;
  let restaurant: {
    id: string;
    ownerId: string;
    tier: string;
    forceTier: string | null;
    isActive: boolean;
    deletedAt: Date | null;
  };
  const prisma = {
    restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
    restaurantTable: { findUnique: jest.fn() },
    tableZone: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const tables = {
    create: jest.fn(),
    bulkCreate: jest.fn(),
    findAll: jest.fn(),
    findServicePoints: jest.fn(),
    resolvePublicServicePoint: jest.fn(),
    getTablesWithStatus: jest.fn(),
    getTableOrders: jest.fn(),
    update: jest.fn(),
    rotatePublicToken: jest.fn(),
    remove: jest.fn(),
  };
  const zones = {
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    reorder: jest.fn(),
  };
  const reservations = {
    getSettings: jest.fn(),
    updateSettings: jest.fn(),
    setServiceHours: jest.fn(),
    deleteServiceHours: jest.fn(),
    getAnalytics: jest.fn(),
    listBlackouts: jest.fn(),
    addBlackout: jest.fn(),
    removeBlackout: jest.fn(),
    list: jest.fn(),
    createManual: jest.fn(),
    executeAction: jest.fn(),
    updateInternal: jest.fn(),
  };
  const calls = [
    ...Object.values(tables),
    ...Object.values(zones),
    ...Object.values(reservations),
  ];
  type Verb = 'get' | 'post' | 'patch' | 'put' | 'delete';
  type Route = [Verb, string, Record<string, unknown> | undefined, jest.Mock];
  const routes: Route[] = [
    ['post', '/restaurants/r1/tables', { name: 'Table 1' }, tables.create],
    ['post', '/restaurants/r1/tables/bulk', { count: 2 }, tables.bulkCreate],
    ['get', '/restaurants/r1/tables', undefined, tables.findAll],
    [
      'post',
      '/restaurants/r1/service-points',
      { name: 'Room 1', type: 'ROOM' },
      tables.create,
    ],
    [
      'get',
      '/restaurants/r1/service-points',
      undefined,
      tables.findServicePoints,
    ],
    ['get', '/tables/status/r1', undefined, tables.getTablesWithStatus],
    [
      'get',
      '/tables/table1/orders?restaurantId=r1',
      undefined,
      tables.getTableOrders,
    ],
    ['patch', '/tables/table1', { name: 'Table 2' }, tables.update],
    [
      'post',
      '/tables/table1/public-token/rotate',
      {},
      tables.rotatePublicToken,
    ],
    ['delete', '/tables/table1', undefined, tables.remove],
    ['get', '/restaurants/r1/zones', undefined, zones.findAll],
    ['post', '/restaurants/r1/zones', { name: 'Terrace' }, zones.create],
    ['patch', '/zones/zone1', { name: 'Terrace' }, zones.update],
    ['delete', '/zones/zone1', undefined, zones.remove],
    [
      'patch',
      '/restaurants/r1/zones/reorder',
      { items: [{ id: 'zone1', displayOrder: 0 }] },
      zones.reorder,
    ],
    ['get', '/reservations/r1/settings', undefined, reservations.getSettings],
    [
      'put',
      '/reservations/r1/settings',
      { enabled: true },
      reservations.updateSettings,
    ],
    [
      'post',
      '/reservations/r1/service-hours',
      { rows: [] },
      reservations.setServiceHours,
    ],
    [
      'delete',
      '/reservations/r1/service-hours/1',
      undefined,
      reservations.deleteServiceHours,
    ],
    ['get', '/reservations/r1/analytics', undefined, reservations.getAnalytics],
    [
      'get',
      '/reservations/r1/blackouts',
      undefined,
      reservations.listBlackouts,
    ],
    [
      'post',
      '/reservations/r1/blackouts',
      { date: '2026-10-01' },
      reservations.addBlackout,
    ],
    [
      'delete',
      '/reservations/r1/blackouts/2026-10-01',
      undefined,
      reservations.removeBlackout,
    ],
    ['get', '/reservations/r1', undefined, reservations.list],
    [
      'post',
      '/reservations/r1/manual',
      {
        guestName: 'Guest',
        guestPhone: '+359000000000',
        adultsCount: 2,
        localStartsAt: '2026-10-01T12:00',
      },
      reservations.createManual,
    ],
    [
      'post',
      '/reservations/action/booking1',
      { restaurantId: 'r1', action: 'ACCEPT' },
      reservations.executeAction,
    ],
    [
      'patch',
      '/reservations/internal/booking1',
      { restaurantId: 'r1', internalNotes: 'Window' },
      reservations.updateInternal,
    ],
  ];
  function send(verb: Verb, url: string, body?: Record<string, unknown>) {
    const call = request(app.getHttpServer())[verb](url);
    return body ? call.send(body) : call;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        TablesController,
        TableZonesController,
        ReservationsController,
      ],
      providers: [
        FeatureService,
        { provide: PrismaService, useValue: prisma },
        { provide: TablesService, useValue: tables },
        { provide: TableZonesService, useValue: zones },
        { provide: ReservationsService, useValue: reservations },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          jwtCalls++;
          if (!actor) throw new UnauthorizedException();
          const req = context
            .switchToHttp()
            .getRequest<{ user: typeof actor }>();
          req.user = actor;
          lastRequest = req;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    jwtCalls = 0;
    actor = { id: 'owner', role: 'OWNER' };
    restaurant = {
      id: 'r1',
      ownerId: 'owner',
      tier: 'ENTERPRISE',
      forceTier: null,
      isActive: true,
      deletedAt: null,
    };
    prisma.restaurant.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === 'r1'
          ? restaurant
          : where.id === 'r2'
            ? { ...restaurant, id: 'r2', ownerId: 'other-owner', tier: 'FREE' }
            : null,
    );
    prisma.user.findUnique.mockImplementation(async () => actor);
    for (const lookup of [
      prisma.restaurantTable.findUnique,
      prisma.tableZone.findUnique,
    ]) {
      lookup.mockResolvedValue({ restaurantId: 'r1' });
    }
    for (const call of calls) call.mockResolvedValue({ ok: true });
  });

  it.each(routes)(
    '%s %s authenticates once and blocks foreign tenants before dispatch',
    async (verb, url, body, call) => {
      await send(verb, url, body).expect(verb === 'post' ? 201 : 200);
      expect(jwtCalls).toBe(1);
      expect(call).toHaveBeenCalledTimes(1);
      expect(getRestaurantAccess(lastRequest)).toMatchObject({
        restaurantId: 'r1',
        userId: 'owner',
      });
      jest.clearAllMocks();
      actor = undefined;
      await send(verb, url, body).expect(401);
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
      expect(prisma.restaurantTable.findUnique).not.toHaveBeenCalled();
      expect(prisma.tableZone.findUnique).not.toHaveBeenCalled();
      actor = { id: 'other-owner', role: 'OWNER', restaurantId: 'r2' };
      await send(verb, url, body).expect(403);
      for (const businessCall of calls)
        expect(businessCall).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled(); // FeatureGuard never ran.
      expect(getRestaurantAccess(lastRequest)).toBeUndefined();
    },
  );

  it.each([
    [
      'get',
      '/restaurants/r1/tables',
      {},
      ['MANAGER', 'WAITER', 'STAFF', 'KITCHEN', 'CUSTOMER', 'SUPER_ADMIN'],
    ],
    ['post', '/restaurants/r1/tables', { name: 'Table 1' }, ['MANAGER']],
    [
      'get',
      '/restaurants/r1/zones',
      {},
      ['MANAGER', 'WAITER', 'STAFF', 'KITCHEN', 'CUSTOMER', 'SUPER_ADMIN'],
    ],
    ['post', '/restaurants/r1/zones', { name: 'Terrace' }, ['MANAGER']],
    [
      'get',
      '/reservations/r1',
      {},
      ['MANAGER', 'WAITER', 'STAFF', 'SUPER_ADMIN'],
    ],
    ['get', '/reservations/r1/settings', {}, ['MANAGER', 'SUPER_ADMIN']],
    [
      'patch',
      '/reservations/internal/booking1',
      { restaurantId: 'r1' },
      ['MANAGER', 'WAITER', 'SUPER_ADMIN'],
    ],
  ] satisfies [Verb, string, Record<string, unknown>, string[]][])(
    '%s %s preserves its distinct role contract',
    async (verb, url, body, allowed) => {
      for (const role of [
        'MANAGER',
        'WAITER',
        'STAFF',
        'KITCHEN',
        'CUSTOMER',
        'SUPER_ADMIN',
      ]) {
        actor = { id: 'member', role, restaurantId: 'r1' };
        await send(verb, url, body).expect(
          allowed.includes(role) ? (verb === 'post' ? 201 : 200) : 403,
        );
      }
    },
  );
  it.each([
    ['ACCEPT', ['MANAGER']],
    ['DECLINE', ['MANAGER']],
    ['CANCEL', ['MANAGER']],
    ['NO_SHOW', ['MANAGER', 'WAITER']],
    ['ARRIVED', ['MANAGER', 'WAITER', 'STAFF']],
  ] satisfies [string, string[]][])(
    'keeps %s action permissions on the effective role',
    async (action, allowed) => {
      // A raw MANAGER in the feature cache must not elevate effective STAFF/WAITER.
      prisma.user.findUnique.mockResolvedValue({
        role: 'MANAGER',
        restaurantId: 'r1',
      });
      for (const role of ['MANAGER', 'WAITER', 'STAFF', 'KITCHEN']) {
        actor = { id: 'member', role, restaurantId: 'r1' };
        await send('post', '/reservations/action/booking1', {
          restaurantId: 'r1',
          action,
        }).expect(allowed.includes(role) ? 201 : 403);
      }
    },
  );
  it('does not revive demoted managers for table/zone edits or reservation settings', async () => {
    actor = { id: 'manager', role: 'STAFF', restaurantId: 'r1' };
    prisma.user.findUnique.mockResolvedValue({
      role: 'MANAGER',
      restaurantId: 'r1',
    });
    await send('patch', '/tables/table1', {
      name: 'Table 2',
      role: 'MANAGER',
    }).expect(403);
    await send('patch', '/zones/zone1', { name: 'Terrace' }).expect(403);
    await send('put', '/reservations/r1/settings', { enabled: true }).expect(
      403,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });
  it('keeps global admin access limited to existing reads and reservation operations', async () => {
    actor = { id: 'admin', role: 'SUPER_ADMIN' };
    restaurant.isActive = false;
    restaurant.deletedAt = new Date();
    await send('get', '/restaurants/r1/tables').expect(200);
    await send('get', '/restaurants/r1/zones').expect(200);
    await send('get', '/reservations/r1/settings').expect(200);
    await send('post', '/reservations/action/booking1', {
      restaurantId: 'r1',
      action: 'ACCEPT',
    }).expect(201);
    restaurant.isActive = true;
    restaurant.deletedAt = null;
    await send('patch', '/tables/table1', { name: 'Table 2' }).expect(403);
    await send('patch', '/zones/zone1', { name: 'Terrace' }).expect(403);
  });
  it('preserves suspension/deletion differences rather than imposing a new global rule', async () => {
    restaurant.isActive = false;
    await send('get', '/restaurants/r1/tables').expect(403);
    await send('patch', '/tables/table1', { name: 'Table 2' }).expect(403);
    await send('get', '/reservations/r1').expect(403);
    await send('get', '/restaurants/r1/zones').expect(200);
    await send('patch', '/zones/zone1', { name: 'Terrace' }).expect(200);
    restaurant.isActive = true;
    restaurant.deletedAt = new Date();
    await send('get', '/restaurants/r1/tables').expect(403);
    await send('patch', '/tables/table1', { name: 'Table 2' }).expect(403);
    await send('get', '/reservations/r1').expect(200);
    await send('patch', '/zones/zone1', { name: 'Terrace' }).expect(200);
  });
  it('retains the feature gate for every reservation route and service-point route', async () => {
    restaurant.tier = 'FREE';
    for (const [verb, url, body] of routes.filter(
      ([, url]) =>
        url.startsWith('/reservations/') || url.endsWith('/service-points'),
    )) {
      const response = await send(verb, url, body).expect(403);
      expect(response.body).toMatchObject({ code: 'FEATURE_LOCKED' });
    }
    for (const call of calls) expect(call).not.toHaveBeenCalled();
    await send('get', '/restaurants/r1/tables').expect(200);
  });
  it.each([
    ['table', '/tables/table1', prisma.restaurantTable.findUnique],
    ['zone', '/zones/zone1', prisma.tableZone.findUnique],
  ] as const)(
    'resolves a %s with a minimal authoritative lookup, ignoring tenant overrides',
    async (_kind, url, lookup) => {
      lookup.mockResolvedValue({ restaurantId: 'r2' });
      await send('patch', url + '?restaurantId=r1', {
        name: 'Changed',
        restaurantId: 'r1',
      }).expect(403);
      expect(lookup).toHaveBeenCalledWith({
        where: { id: url.split('/').pop() },
        select: { restaurantId: true },
      });
      lookup.mockResolvedValue(null);
      await send('patch', url, { name: 'Changed' }).expect(404);
      for (const call of calls) expect(call).not.toHaveBeenCalled();
    },
  );
  it('uses the declared tenant source for entitlements and retains compound service arguments', async () => {
    // Same owner, two restaurants, different plans: no default/query tier laundering.
    prisma.restaurant.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => ({
        ...restaurant,
        id: where.id,
        tier: where.id === 'r1' ? 'ENTERPRISE' : 'FREE',
      }),
    );
    await send('get', '/reservations/r1/settings?restaurantId=r2').expect(200);
    await send('post', '/reservations/action/booking1?restaurantId=r1', {
      restaurantId: 'r2',
      action: 'ACCEPT',
    }).expect(403);
    await send('patch', '/reservations/internal/booking1?restaurantId=r2', {
      restaurantId: 'r1',
      internalNotes: 'Window',
    }).expect(200);
    expect(reservations.updateInternal).toHaveBeenCalledWith(
      'booking1',
      'owner',
      'r1',
      { internalNotes: 'Window', staffTags: undefined },
    );
    await send('post', '/reservations/action/booking1', {
      restaurantId: 'r1',
      action: 'ACCEPT',
    }).expect(201);
    expect(reservations.executeAction).toHaveBeenCalledWith(
      'booking1',
      'owner',
      'r1',
      'ACCEPT',
      undefined,
    );
    await send('get', '/tables/table1/orders?restaurantId=r1', {
      restaurantId: 'r2',
    }).expect(200);
    expect(tables.getTableOrders).toHaveBeenCalledWith('table1', 'r1', actor);
  });
  it.each([
    undefined,
    null,
    '',
    ' r1',
    ['r1'],
    { id: 'r1' },
    3,
    'r'.repeat(201),
  ])('rejects malformed body tenant %j before Prisma', async (restaurantId) => {
    await send('post', '/reservations/action/booking1', {
      restaurantId,
      action: 'ACCEPT',
    }).expect(400);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    expect(reservations.executeAction).not.toHaveBeenCalled();
  });
  it.each([undefined, 'INVALID', '__proto__', 'toString', ['ACCEPT']])(
    'rejects malformed action %j before Prisma',
    async (action) => {
      await send('post', '/reservations/action/booking1', {
        restaurantId: 'r1',
        action,
      }).expect(400);
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    },
  );
  it('rejects missing/array query ids and missing restaurants', async () => {
    await send('get', '/tables/table1/orders').expect(400);
    await send(
      'get',
      '/tables/table1/orders?restaurantId=r1&restaurantId=r2',
    ).expect(400);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    await send('get', '/restaurants/missing/tables').expect(404);
    expect(tables.getTableOrders).not.toHaveBeenCalled();
    expect(tables.findAll).not.toHaveBeenCalled();
  });
  it('leaves anonymous service-point QR resolution unchanged', async () => {
    actor = undefined;
    await send(
      'get',
      '/restaurants/r1/service-points/public/fixture-qr',
    ).expect(200);
    expect(tables.resolvePublicServicePoint).toHaveBeenCalledWith(
      'r1',
      'fixture-qr',
    );
    expect(jwtCalls).toBe(0);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
  });
  it.each([
    { policy: 'table-management', source: 'params', key: 'id' },
    {
      policy: 'table-management',
      source: 'query',
      key: 'id',
      resource: 'table',
    },
    {
      policy: 'zone-management',
      source: 'params',
      key: 'id',
      resource: 'table',
    },
    { policy: 'table-read', source: 'params', key: 'id', resource: 'zone' },
    {
      policy: 'menu-management',
      source: 'params',
      key: 'id',
      resource: 'table',
    },
    { policy: 'restaurant-owner', source: 'body', key: 'restaurantId' },
    { policy: 'reservation-action', source: 'params', key: 'restaurantId' },
    { policy: 'reservation-action', source: 'body', key: 'id' },
    { policy: 'reservation-operations', source: 'query', key: 'restaurantId' },
    {
      policy: 'reservation-operations',
      source: 'body',
      key: 'restaurantId',
      resource: 'zone',
    },
  ])('rejects invalid operation metadata %j', (requirement) => {
    expect(isRestaurantAccessRequirement(requirement)).toBe(false);
  });
});
