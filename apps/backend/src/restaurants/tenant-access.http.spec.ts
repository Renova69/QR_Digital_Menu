import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  NestInterceptor,
  Type,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { createHash } from 'crypto';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PinSecurityService } from '../auth/pin-security.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureService } from '../subscription/feature.service';
import { StorageService } from '../storage/storage.service';
import { EventsGateway } from '../events/events.gateway';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsService } from './restaurants.service';
import { DeviceEnrollmentController } from './device-enrollment.controller';
import { DeviceEnrollmentService } from './device-enrollment.service';
import {
  SlugController,
  OnboardingSlugController,
} from './slug/slug.controller';
import { RestaurantSlugService } from './slug/restaurant-slug.service';
import { MenuImportController } from '../menu-import/menu-import.controller';
import { MenuImportService } from '../menu-import/menu-import.service';
import { MenuAuditController } from '../menu/audit.controller';
import { MenuAuditService } from '../menu/menu-audit.service';

type RouteCase = {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  operation: string;
  access: 'owner' | 'manager' | 'member';
  body?: object;
  feature?: boolean;
  hideDeleted?: boolean;
  upload?: boolean;
  status?: number;
};
const importBody = {
  categories: [{ name: 'Food', items: [{ name: 'Soup', price: 8 }] }],
};
const routes: RouteCase[] = [
  {
    method: 'get',
    path: '/restaurants/r1',
    operation: 'findOneOrStaff',
    access: 'member',
    hideDeleted: true,
  },
  {
    method: 'patch',
    path: '/restaurants/r1',
    operation: 'update',
    access: 'manager',
    hideDeleted: true,
    body: { name: 'Demo' },
  },
  {
    method: 'delete',
    path: '/restaurants/r1',
    operation: 'remove',
    access: 'owner',
    hideDeleted: true,
  },
  {
    method: 'post',
    path: '/restaurants/r1/logo',
    operation: 'updateLogo',
    access: 'manager',
    hideDeleted: true,
    feature: true,
    upload: true,
  },
  {
    method: 'post',
    path: '/restaurants/r1/device-enrollment',
    operation: 'deviceCreate',
    access: 'manager',
    feature: true,
    body: {},
  },
  {
    method: 'get',
    path: '/restaurants/r1/device-enrollments',
    operation: 'deviceList',
    access: 'manager',
    feature: true,
  },
  {
    method: 'get',
    path: '/restaurants/r1/pin-security-alerts',
    operation: 'recentAlerts',
    access: 'manager',
    feature: true,
  },
  {
    method: 'delete',
    path: '/restaurants/r1/device-enrollments/device-1',
    operation: 'deviceRevoke',
    access: 'manager',
    feature: true,
  },
  {
    method: 'post',
    path: '/restaurants/r1/translate-all',
    operation: 'enqueueTranslateAll',
    access: 'manager',
    hideDeleted: true,
    feature: true,
    status: 202,
  },
  {
    method: 'get',
    path: '/restaurants/r1/translation-status',
    operation: 'getTranslationStatus',
    access: 'manager',
    hideDeleted: true,
    feature: true,
  },
  {
    method: 'post',
    path: '/restaurants/r1/stripe/connect',
    operation: 'generateConnectLink',
    access: 'owner',
    hideDeleted: true,
    feature: true,
    body: {},
  },
  {
    method: 'get',
    path: '/restaurants/r1/logo-base64',
    operation: 'getLogoBase64',
    access: 'manager',
    hideDeleted: true,
  },
  {
    method: 'get',
    path: '/restaurants/r1/stripe/status',
    operation: 'getStripeStatus',
    access: 'owner',
    hideDeleted: true,
    feature: true,
  },
  {
    method: 'post',
    path: '/restaurants/r1/stripe/disconnect',
    operation: 'disconnectStripe',
    access: 'owner',
    hideDeleted: true,
    feature: true,
  },
  {
    method: 'post',
    path: '/restaurants/r1/menu/import/confirm',
    operation: 'upsertMenu',
    access: 'owner',
    body: importBody,
  },
  {
    method: 'get',
    path: '/restaurants/r1/menu/import/api-key',
    operation: 'getOrCreateApiKey',
    access: 'owner',
  },
  {
    method: 'post',
    path: '/restaurants/r1/menu/import/api-key/regenerate',
    operation: 'regenerateApiKey',
    access: 'owner',
  },
  {
    method: 'get',
    path: '/restaurants/r1/menu/export',
    operation: 'exportMenu',
    access: 'owner',
  },
  {
    method: 'get',
    path: '/menu/audit/r1',
    operation: 'auditMenu',
    access: 'member',
  },
  {
    method: 'post',
    path: '/restaurants/r1/slug/commit',
    operation: 'commitSlug',
    access: 'manager',
    hideDeleted: true,
  },
  {
    method: 'patch',
    path: '/restaurants/r1/slug',
    operation: 'renameSlug',
    access: 'owner',
    hideDeleted: true,
    body: { slug: 'demo-menu' },
  },
  {
    method: 'post',
    path: '/restaurants/r1/slug/release',
    operation: 'releaseSlug',
    access: 'owner',
    hideDeleted: true,
    body: { slug: 'old-demo', confirmation: 'CONFIRM' },
  },
  {
    method: 'get',
    path: '/restaurants/r1/slug/aliases',
    operation: 'listAliases',
    access: 'owner',
    hideDeleted: true,
  },
];

/** Actual routing, access/feature guards, DTOs, Multer, OCR ApiKeyGuard and device
 * service. All database/storage/provider I/O is in-memory fake; no AppModule,
 * .env, database connection, migration or external request is used. */
describe('Tenant management authorization over HTTP', () => {
  let app: INestApplication;
  let actor: { id: string; role: string; restaurantId?: string } | undefined;
  let restaurant: {
    id: string;
    ownerId: string;
    tier: string;
    forceTier: string | null;
    isActive: boolean;
    deletedAt: Date | null;
    sharedDeviceModeEnabled: boolean;
    name: string;
  };
  const jwt = jest.fn();
  const prisma = {
    restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
    deviceEnrollmentToken: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const handlers: Record<string, jest.Mock> = Object.fromEntries(
    [
      ...routes.map(({ operation }) => operation),
      'findOneForManagement',
      'create',
      'findAll',
      'checkOwnership',
      'assertOwner',
      'getPrimaryState',
      'isSlugAvailable',
    ].map((name) => [name, jest.fn()]),
  );
  const storage = { uploadWithThumbnail: jest.fn() };
  const events = { evictDeviceToken: jest.fn() };
  const fixtureKey = ['fixture', 'ocr'].join('-').padEnd(40, 'x');
  const fixtureDevice = ['fixture', 'device'].join('-').padEnd(40, 'x');
  let savedFrontendUrl: string | undefined;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        RestaurantsController,
        DeviceEnrollmentController,
        MenuImportController,
        MenuAuditController,
        SlugController,
        OnboardingSlugController,
      ],
      providers: [
        FeatureService,
        DeviceEnrollmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsGateway, useValue: events },
        { provide: RestaurantsService, useValue: handlers },
        { provide: MenuImportService, useValue: handlers },
        { provide: MenuAuditService, useValue: handlers },
        { provide: RestaurantSlugService, useValue: handlers },
        { provide: PinSecurityService, useValue: handlers },
        { provide: StorageService, useValue: storage },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jwt })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
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
    savedFrontendUrl = process.env.FRONTEND_URL;
    actor = { id: 'owner', role: 'OWNER' };
    restaurant = {
      id: 'r1',
      ownerId: 'owner',
      tier: 'ENTERPRISE',
      forceTier: null,
      isActive: true,
      deletedAt: null,
      sharedDeviceModeEnabled: true,
      name: 'Demo',
    };
    jwt.mockImplementation((context: ExecutionContext) => {
      if (!actor) throw new UnauthorizedException();
      context.switchToHttp().getRequest<{ user: typeof actor }>().user = actor;
      return true;
    });
    prisma.restaurant.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'r1'
            ? restaurant
            : { ...restaurant, id: where.id, ownerId: 'other-owner' },
        ),
    );
    prisma.restaurant.findFirst.mockImplementation(
      ({ where }: { where: { id: string; importApiKeyHash?: string } }) =>
        Promise.resolve(
          where.id === 'r1' &&
            where.importApiKeyHash ===
              createHash('sha256').update(fixtureKey).digest('hex')
            ? { id: 'r1' }
            : null,
        ),
    );
    prisma.user.findUnique.mockImplementation(() => Promise.resolve(actor));
    for (const handler of Object.values(handlers))
      handler.mockResolvedValue({});
    handlers.isSlugAvailable.mockResolvedValue(true);
    handlers.listAliases.mockResolvedValue([]);
    handlers.recentAlerts.mockResolvedValue([]);
    prisma.deviceEnrollmentToken.count.mockResolvedValue(0);
    prisma.deviceEnrollmentToken.create.mockResolvedValue({ id: 'new-device' });
    prisma.deviceEnrollmentToken.findMany.mockResolvedValue([]);
    prisma.deviceEnrollmentToken.findFirst.mockImplementation(
      ({ where }: { where: { id: string; restaurantId: string } }) =>
        Promise.resolve(
          where.id === 'device-1' && where.restaurantId === 'r1'
            ? { id: 'device-1', revokedAt: null }
            : null,
        ),
    );
    prisma.deviceEnrollmentToken.update.mockResolvedValue({});
    prisma.deviceEnrollmentToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.deviceEnrollmentToken.findUnique.mockImplementation(
      ({ where }: { where: { tokenHash: string } }) =>
        Promise.resolve(
          where.tokenHash ===
            createHash('sha256').update(fixtureDevice).digest('hex')
            ? {
                id: 'device-1',
                restaurant,
                usedAt: null,
                revokedAt: null,
                expiresAt: new Date(Date.now() + 600000),
              }
            : null,
        ),
    );
    storage.uploadWithThumbnail.mockResolvedValue({
      url: 'https://images.example/tenants/r1/logo.webp',
      thumbnailUrl: 'https://images.example/tenants/r1/logo-thumb.webp',
    });
  });
  afterEach(() => {
    if (savedFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = savedFrontendUrl;
  });
  function send(route: RouteCase) {
    const req = request(app.getHttpServer())[route.method](route.path);
    if (route.upload)
      return req.attach('file', Buffer.from('fake image'), 'logo.png');
    if (route.body) return req.send(route.body);
    return req;
  }
  function expectedStatus(route: RouteCase) {
    return route.status ?? (route.method === 'post' ? 201 : 200);
  }
  function operation(route: RouteCase) {
    if (route.operation === 'deviceCreate')
      return prisma.deviceEnrollmentToken.create;
    if (route.operation === 'deviceList')
      return prisma.deviceEnrollmentToken.findMany;
    if (route.operation === 'deviceRevoke')
      return prisma.deviceEnrollmentToken.update;
    return handlers[route.operation];
  }
  function expectNoHandler() {
    for (const mock of [
      ...Object.values(handlers),
      ...Object.values(storage),
      ...Object.values(events),
      ...Object.values(prisma.deviceEnrollmentToken),
    ]) {
      expect(mock).not.toHaveBeenCalled();
    }
  }

  it.each(routes)(
    'owner: $method $path passes with one JWT check',
    async (route) => {
      await send(route).expect(expectedStatus(route));
      expect(operation(route)).toHaveBeenCalledTimes(1);
      expect(jwt).toHaveBeenCalledTimes(1);
      expect(prisma.restaurant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'r1' } }),
      );
    },
  );
  it.each(routes)(
    'no JWT: $method $path fails before looking up tenancy',
    async (route) => {
      actor = undefined;
      await send(route).expect(401);
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expectNoHandler();
    },
  );
  it.each(routes)(
    'foreign owner: $method $path fails before feature checks or handler',
    async (route) => {
      actor = { id: 'other-owner', role: 'OWNER', restaurantId: 'r2' };
      await send(route).expect(403);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expectNoHandler();
    },
  );
  it.each(routes)(
    'assigned manager: $method $path preserves its role policy',
    async (route) => {
      actor = { id: 'manager', role: 'MANAGER', restaurantId: 'r1' };
      await send(route).expect(
        route.access === 'owner' ? 403 : expectedStatus(route),
      );
      if (route.access === 'owner') expectNoHandler();
      else expect(operation(route)).toHaveBeenCalledTimes(1);
    },
  );
  it.each(routes)(
    'assigned staff: $method $path permits only member reads',
    async (route) => {
      actor = { id: 'staff', role: 'STAFF', restaurantId: 'r1' };
      await send(route).expect(
        route.access === 'member' ? expectedStatus(route) : 403,
      );
      if (route.access !== 'member') expectNoHandler();
    },
  );
  it.each(routes)(
    'suspension: $method $path preserves existing feature/status behavior',
    async (route) => {
      restaurant.isActive = false;
      const response = await send(route).expect(
        route.feature ? 403 : expectedStatus(route),
      );
      if (route.feature) {
        expect(response.body).toMatchObject({ code: 'RESTAURANT_SUSPENDED' });
        expectNoHandler();
      }
    },
  );
  it.each(routes)(
    'soft deletion: $method $path keeps its existing visibility contract',
    async (route) => {
      // Independent deletedAt gate: test an inconsistent active+deleted row too.
      restaurant.deletedAt = new Date();
      await send(route).expect(route.hideDeleted ? 404 : expectedStatus(route));
      if (route.hideDeleted) expectNoHandler();
    },
  );
  it.each(routes.filter(({ feature }) => feature))(
    "feature locked: $path cannot borrow another restaurant's plan",
    async (route) => {
      restaurant.tier = 'FREE';
      const response = await send({
        ...route,
        path: route.path + '?restaurantId=r2',
      }).expect(403);
      expect(response.body).toMatchObject({ code: 'FEATURE_LOCKED' });
      expect(
        prisma.restaurant.findUnique.mock.calls.every(
          ([query]: [{ where: { id: string } }]) => query.where.id === 'r1',
        ),
      ).toBe(true);
      expectNoHandler();
    },
  );
  it.each(routes)(
    'missing restaurant: $method $path stops before handler',
    async (route) => {
      prisma.restaurant.findUnique.mockResolvedValue(null);
      await send(route).expect(404);
      expectNoHandler();
    },
  );

  it('the feature bypass of a SUPER_ADMIN is not tenant ownership', async () => {
    actor = { id: 'admin', role: 'SUPER_ADMIN' };
    await request(app.getHttpServer())
      .post('/restaurants/r1/stripe/connect')
      .send({})
      .expect(403);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expectNoHandler();
  });
  it('a demoted manager cannot be upgraded by the raw role cache', async () => {
    actor = { id: 'manager', role: 'STAFF', restaurantId: 'r1' };
    prisma.user.findUnique.mockResolvedValue({ ...actor, role: 'MANAGER' });
    await request(app.getHttpServer())
      .post('/restaurants/r1/device-enrollment')
      .send({})
      .expect(403);
    await request(app.getHttpServer())
      .post('/restaurants/r1/translate-all')
      .expect(403);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expectNoHandler();
  });
  it('a lookup failure never dispatches or pretends authorization succeeded', async () => {
    prisma.restaurant.findUnique.mockRejectedValue(
      new Error('database unavailable'),
    );
    await request(app.getHttpServer())
      .patch('/restaurants/r1')
      .send({ name: 'Demo' })
      .expect(500);
    expectNoHandler();
  });
  it('logo authorization and entitlement run before Multer while the size limit stays intact', async () => {
    const interceptors = Reflect.getMetadata(
      INTERCEPTORS_METADATA,
      RestaurantsController.prototype.uploadLogo,
    ) as Type<NestInterceptor>[];
    const intercept = jest.spyOn(interceptors[0].prototype, 'intercept');
    try {
      actor = { id: 'other-owner', role: 'OWNER' };
      await request(app.getHttpServer())
        .post('/restaurants/r1/logo')
        .attach('file', Buffer.from('image'), 'logo.png')
        .expect(403);
      expect(intercept).not.toHaveBeenCalled();
      actor = { id: 'owner', role: 'OWNER' };
      restaurant.tier = 'FREE';
      await request(app.getHttpServer())
        .post('/restaurants/r1/logo')
        .attach('file', Buffer.from('image'), 'logo.png')
        .expect(403);
      expect(intercept).not.toHaveBeenCalled();
      restaurant.tier = 'ENTERPRISE';
      await request(app.getHttpServer())
        .post('/restaurants/r1/logo')
        .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1), 'logo.png')
        .expect(413);
      expect(intercept).toHaveBeenCalledTimes(1);
      expectNoHandler();
    } finally {
      intercept.mockRestore();
    }
  });
  it('retains the second logo ownership check before storage', async () => {
    handlers.findOneForManagement.mockRejectedValue(new ForbiddenException());
    await request(app.getHttpServer())
      .post('/restaurants/r1/logo')
      .attach('file', Buffer.from('image'), 'logo.png')
      .expect(403);
    expect(storage.uploadWithThumbnail).not.toHaveBeenCalled();
  });
  it('device revocation scopes the child token even for an owner of both restaurants', async () => {
    prisma.restaurant.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve({ ...restaurant, id: where.id }),
    );
    await request(app.getHttpServer())
      .delete('/restaurants/r1/device-enrollments/device-2')
      .expect(404);
    expect(prisma.deviceEnrollmentToken.findFirst).toHaveBeenCalledWith({
      where: { id: 'device-2', restaurantId: 'r1' },
      select: { id: true, revokedAt: true },
    });
    expect(prisma.deviceEnrollmentToken.update).not.toHaveBeenCalled();
    expect(events.evictDeviceToken).not.toHaveBeenCalled();
  });
  it('allowed device revocation preserves session version increment and socket eviction', async () => {
    await request(app.getHttpServer())
      .delete('/restaurants/r1/device-enrollments/device-1')
      .expect(200);
    expect(prisma.deviceEnrollmentToken.update).toHaveBeenCalledWith({
      where: { id: 'device-1' },
      data: { revokedAt: expect.any(Date), sessionVersion: { increment: 1 } },
    });
    expect(events.evictDeviceToken).toHaveBeenCalledWith(
      'device-1',
      'device_revoked',
    );
  });
  it('enrollment URL stays server-derived rather than trusting Origin or body restaurantId', async () => {
    process.env.FRONTEND_URL = 'https://dashboard.example';
    const response = await request(app.getHttpServer())
      .post('/restaurants/r1/device-enrollment')
      .set('Origin', 'https://untrusted.example')
      .send({ restaurantId: 'r2' })
      .expect(201);
    expect(
      new URL((response.body as { enrollmentUrl: string }).enrollmentUrl)
        .origin,
    ).toBe('https://dashboard.example');
    expect(prisma.deviceEnrollmentToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          restaurantId: 'r1',
          createdById: 'owner',
        }),
      }),
    );
  });
  it('disabled shared-device mode still prevents enrollment', async () => {
    restaurant.sharedDeviceModeEnabled = false;
    const response = await request(app.getHttpServer())
      .post('/restaurants/r1/device-enrollment')
      .send({})
      .expect(403);
    expect(response.body).toMatchObject({
      code: 'SHARED_DEVICE_MODE_DISABLED',
    });
    expect(prisma.deviceEnrollmentToken.create).not.toHaveBeenCalled();
  });
  it('slug release still requires server-validated CONFIRM', async () => {
    await request(app.getHttpServer())
      .post('/restaurants/r1/slug/release')
      .send({ slug: 'old-demo', confirmation: 'yes' })
      .expect(400);
    expect(handlers.releaseSlug).not.toHaveBeenCalled();
  });
  it('import confirmation retains its second ownership check', async () => {
    handlers.checkOwnership.mockRejectedValue(new ForbiddenException());
    await request(app.getHttpServer())
      .post('/restaurants/r1/menu/import/confirm')
      .send(importBody)
      .expect(403);
    expect(handlers.upsertMenu).not.toHaveBeenCalled();
  });

  it('OCR still uses its tenant-bound API key without a dashboard JWT', async () => {
    actor = undefined;
    await request(app.getHttpServer())
      .post('/restaurants/r1/menu/import')
      .set('Authorization', 'Bearer ' + fixtureKey)
      .send(importBody)
      .expect(201);
    expect(jwt).not.toHaveBeenCalled();
    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'r1',
        importApiKeyHash: createHash('sha256').update(fixtureKey).digest('hex'),
      },
      select: { id: true },
    });
    expect(handlers.upsertMenu).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining(importBody),
    );
  });
  it('OCR refuses a valid key for a different tenant and refuses JWT alone', async () => {
    await request(app.getHttpServer())
      .post('/restaurants/r2/menu/import')
      .set('Authorization', 'Bearer ' + fixtureKey)
      .send({ ...importBody, restaurantId: 'r1' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/restaurants/r1/menu/import')
      .send(importBody)
      .expect(403);
    expect(handlers.upsertMenu).not.toHaveBeenCalled();
  });
  it('device enrollment verification remains token-based, with the atomic single-use claim', async () => {
    actor = undefined;
    await request(app.getHttpServer())
      .post('/device-enrollment/verify')
      .send({ token: fixtureDevice })
      .expect(201);
    expect(jwt).not.toHaveBeenCalled();
    expect(prisma.deviceEnrollmentToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tokenHash: createHash('sha256').update(fixtureDevice).digest('hex'),
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
        },
        data: {
          usedAt: expect.any(Date),
          deviceTrustExpiresAt: expect.any(Date),
        },
      }),
    );
  });
  it('device status remains token-based, not a dashboard JWT route', async () => {
    actor = undefined;
    prisma.deviceEnrollmentToken.findUnique.mockResolvedValue({
      restaurant,
      usedAt: new Date(),
      revokedAt: null,
    });
    await request(app.getHttpServer())
      .post('/device-enrollment/status')
      .send({ token: fixtureDevice })
      .expect(201);
    expect(jwt).not.toHaveBeenCalled();
  });
  it.each(['/device-enrollment/verify', '/device-enrollment/status'])(
    'invalid device credential still fails: %s',
    async (path) => {
      actor = undefined;
      await request(app.getHttpServer())
        .post(path)
        .send({ token: 'invalid'.padEnd(40, 'x') })
        .expect(401);
      expect(prisma.deviceEnrollmentToken.updateMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    '/restaurants/r2/slug/available?slug=demo',
    '/restaurants/slug/available?slug=demo',
  ])(
    'slug advisory remains JWT-only without tenant membership: %s',
    async (path) => {
      actor = { id: 'customer', role: 'CUSTOMER' };
      await request(app.getHttpServer())
        .get(path)
        .expect(200, { available: true });
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
      actor = undefined;
      await request(app.getHttpServer()).get(path).expect(401);
    },
  );
  it('account restaurant creation and listing still require JWT, not an existing restaurant', async () => {
    await request(app.getHttpServer())
      .post('/restaurants')
      .send({ name: 'Demo' })
      .expect(201);
    await request(app.getHttpServer()).get('/restaurants').expect(200);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    expect(handlers.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Demo' }),
      'owner',
    );
    expect(handlers.findAll).toHaveBeenCalledWith('owner');
    actor = undefined;
    await request(app.getHttpServer())
      .post('/restaurants')
      .send({ name: 'Demo' })
      .expect(401);
    await request(app.getHttpServer()).get('/restaurants').expect(401);
  });
});
