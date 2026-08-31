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
import { AssistanceController } from '../assistance/assistance.controller';
import { AssistanceService } from '../assistance/assistance.service';
import { OrdersController } from '../orders/orders.controller';
import { OrdersService } from '../orders/orders.service';
import { FeedbackController } from '../feedback/feedback.controller';
import { FeedbackService } from '../feedback/feedback.service';
import { LoyaltyController } from '../loyalty/loyalty.controller';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { NotificationDeliveryController } from '../notifications/notification-delivery.controller';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';

// Real controllers, access/feature guards and pipes. Auth and I/O are mocked;
// this application never imports AppModule or opens a database connection.
describe('Service-management restaurant access', () => {
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
    assistanceRequest: { findUnique: jest.fn() },
    order: { findUnique: jest.fn() },
    feedback: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const assistance = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const orders = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    bulkUpdateStatus: jest.fn(),
    updateStatus: jest.fn(),
  };
  const feedback = {
    findAll: jest.fn(),
    getSummary: jest.fn(),
    getVisit: jest.fn(),
  };
  const loyalty = {
    getAnalytics: jest.fn(),
    getExpiryReminderCandidates: jest.fn(),
    notifyExpiryReminders: jest.fn(),
    getLoyaltyAccounts: jest.fn(),
    getPublicConfig: jest.fn(),
  };
  const notifications = {
    listForRestaurant: jest.fn(),
    retryFailed: jest.fn(),
    getSmsUsage: jest.fn(),
  };
  const calls = [assistance, orders, feedback, loyalty, notifications].flatMap(
    Object.values,
  );
  const children = [
    prisma.assistanceRequest.findUnique,
    prisma.order.findUnique,
    prisma.feedback.findUnique,
  ];
  type Verb = 'get' | 'post' | 'patch' | 'delete';
  type Route = [Verb, string, Record<string, unknown> | undefined, jest.Mock];
  const bulkBody = {
    restaurantId: 'r1',
    orderIds: ['order1'],
    fromStatus: 'NEW',
    status: 'IN_PROGRESS',
  };
  const routes: Route[] = [
    [
      'get',
      '/assistance-requests?restaurantId=r1',
      undefined,
      assistance.findAll,
    ],
    ['get', '/assistance-requests/assist1', undefined, assistance.findOne],
    [
      'patch',
      '/assistance-requests/assist1',
      { isResolved: true },
      assistance.update,
    ],
    ['delete', '/assistance-requests/assist1', undefined, assistance.remove],
    ['get', '/orders?restaurantId=r1', undefined, orders.findAll],
    ['get', '/orders/order1', undefined, orders.findOne],
    ['patch', '/orders/status/bulk', bulkBody, orders.bulkUpdateStatus],
    [
      'patch',
      '/orders/order1/status',
      { status: 'IN_PROGRESS' },
      orders.updateStatus,
    ],
    ['get', '/feedback?restaurantId=r1', undefined, feedback.findAll],
    [
      'get',
      '/feedback/summary?restaurantId=r1',
      undefined,
      feedback.getSummary,
    ],
    ['get', '/feedback/review1/visit', undefined, feedback.getVisit],
    ['get', '/loyalty/r1/analytics', undefined, loyalty.getAnalytics],
    [
      'get',
      '/loyalty/r1/expiry-reminders',
      undefined,
      loyalty.getExpiryReminderCandidates,
    ],
    [
      'post',
      '/loyalty/r1/expiry-reminders/notify',
      {},
      loyalty.notifyExpiryReminders,
    ],
    [
      'get',
      '/restaurants/r1/notification-deliveries',
      undefined,
      notifications.listForRestaurant,
    ],
    [
      'post',
      '/restaurants/r1/notification-deliveries/delivery1/retry',
      {},
      notifications.retryFailed,
    ],
    [
      'get',
      '/restaurants/r1/notification-deliveries/sms-usage?periodMonth=2026-08',
      undefined,
      notifications.getSmsUsage,
    ],
  ];
  function send(verb: Verb, url: string, body?: Record<string, unknown>) {
    const call = request(app.getHttpServer())[verb](url);
    return body ? call.send(body) : call;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        AssistanceController,
        OrdersController,
        FeedbackController,
        LoyaltyController,
        NotificationDeliveryController,
      ],
      providers: [
        FeatureService,
        { provide: PrismaService, useValue: prisma },
        { provide: AssistanceService, useValue: assistance },
        { provide: OrdersService, useValue: orders },
        { provide: FeedbackService, useValue: feedback },
        { provide: LoyaltyService, useValue: loyalty },
        { provide: NotificationDeliveryService, useValue: notifications },
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
    for (const lookup of children)
      lookup.mockResolvedValue({ restaurantId: 'r1' });
    for (const call of calls) call.mockResolvedValue({ ok: true });
  });

  it.each(routes)(
    '%s %s authenticates once and rejects foreign actors before dispatch',
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
      for (const lookup of children) expect(lookup).not.toHaveBeenCalled();
      actor = { id: 'other-owner', role: 'OWNER', restaurantId: 'r2' };
      await send(verb, url, body).expect(403);
      for (const businessCall of calls)
        expect(businessCall).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled(); // Not even FeatureGuard.
      expect(getRestaurantAccess(lastRequest)).toBeUndefined();
    },
  );
  it.each([
    'OWNER',
    'MANAGER',
    'WAITER',
    'STAFF',
    'KITCHEN',
    'CUSTOMER',
    'SUPER_ADMIN',
  ])(
    'preserves assigned %s access without giving it owner-only loyalty tools',
    async (role) => {
      actor = { id: 'member', role, restaurantId: 'r1' };
      for (const [verb, url, body] of routes.slice(0, 11))
        await send(verb, url, body).expect(200);
      for (const [verb, url, body] of routes.slice(11, 14))
        await send(verb, url, body).expect(403);
      for (const [verb, url, body] of routes.slice(14)) {
        await send(verb, url, body).expect(
          ['OWNER', 'MANAGER'].includes(role)
            ? verb === 'post'
              ? 201
              : 200
            : 403,
        );
      }
    },
  );
  it('does not invent a global admin bypass for these services', async () => {
    actor = { id: 'admin', role: 'SUPER_ADMIN' };
    for (const [verb, url, body] of routes)
      await send(verb, url, body).expect(403);
    for (const call of calls) expect(call).not.toHaveBeenCalled();
  });
  it('uses the effective role for cancellations and delivery management', async () => {
    actor = { id: 'manager', role: 'STAFF', restaurantId: 'r1' };
    prisma.user.findUnique.mockResolvedValue({
      role: 'MANAGER',
      restaurantId: 'r1',
    });
    await send('patch', '/orders/order1/status', {
      status: 'CANCELED',
      role: 'MANAGER',
    }).expect(403);
    await send(
      'post',
      '/restaurants/r1/notification-deliveries/delivery1/retry',
    ).expect(403);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    await send('patch', '/orders/order1/status', {
      status: 'IN_PROGRESS',
    }).expect(200);
    actor.role = 'MANAGER';
    await send('patch', '/orders/order1/status', { status: 'CANCELED' }).expect(
      200,
    );
  });
  it.each([
    [
      '/assistance-requests/assist1',
      'assist1',
      prisma.assistanceRequest.findUnique,
    ],
    ['/orders/order1', 'order1', prisma.order.findUnique],
    ['/feedback/review1/visit', 'review1', prisma.feedback.findUnique],
  ] as const)(
    'resolves %s from its resource, not a supplied tenant',
    async (url, id, lookup) => {
      lookup.mockResolvedValue({ restaurantId: 'r2' });
      await send('get', url + '?restaurantId=r1', {
        restaurantId: 'r1',
      }).expect(403);
      expect(lookup).toHaveBeenCalledWith({
        where: { id },
        select: { restaurantId: true },
      });
      lookup.mockResolvedValue(null);
      await send('get', url).expect(404);
      for (const call of calls) expect(call).not.toHaveBeenCalled();
    },
  );
  it('keeps optional lists account-scoped and ignores an undeclared body tenant', async () => {
    await send('get', '/assistance-requests', { restaurantId: 'r2' }).expect(
      200,
    );
    expect(assistance.findAll).toHaveBeenCalledWith(
      'owner',
      expect.not.objectContaining({ restaurantId: expect.anything() }),
    );
    expect(getRestaurantAccess(lastRequest)).toBeUndefined();
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    // Owners without an assigned restaurant already need an explicit orders
    // target for FeatureGuard; do not silently select their first restaurant.
    await send('get', '/orders', { restaurantId: 'r1' }).expect(403);
    expect(orders.findAll).not.toHaveBeenCalled();
    actor = { id: 'member', role: 'WAITER', restaurantId: 'r1' };
    await send('get', '/orders', { restaurantId: 'r2' }).expect(200);
    expect(orders.findAll).toHaveBeenCalledWith(
      'member',
      expect.not.objectContaining({ restaurantId: expect.anything() }),
    );
    expect(getRestaurantAccess(lastRequest)).toBeUndefined();
    restaurant.tier = 'FREE';
    await send('get', '/orders', { restaurantId: 'r2' }).expect(403);
  });
  it('checks entitlements on the declared tenant and preserves compound service arguments', async () => {
    prisma.restaurant.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => ({
        ...restaurant,
        id: where.id,
        tier: where.id === 'r1' ? 'ENTERPRISE' : 'FREE',
      }),
    );
    await send('patch', '/orders/status/bulk?restaurantId=r2', bulkBody).expect(
      200,
    );
    expect(orders.bulkUpdateStatus).toHaveBeenCalledWith(
      expect.objectContaining(bulkBody),
      'owner',
    );
    await send('patch', '/orders/status/bulk?restaurantId=r1', {
      ...bulkBody,
      restaurantId: 'r2',
    }).expect(403);
    await send(
      'post',
      '/restaurants/r1/notification-deliveries/delivery1/retry?restaurantId=r2',
      { restaurantId: 'r2' },
    ).expect(201);
    expect(notifications.retryFailed).toHaveBeenCalledWith(
      'r1',
      'delivery1',
      'owner',
    );
  });
  it('retains feature/suspension gates without adding them to feedback, assistance or recovery', async () => {
    restaurant.isActive = false;
    restaurant.deletedAt = new Date();
    for (const [verb, url, body] of routes)
      await send(verb, url, body).expect(
        url.startsWith('/orders') || url.startsWith('/loyalty')
          ? 403
          : verb === 'post'
            ? 201
            : 200,
      );
    restaurant.isActive = true;
    restaurant.deletedAt = null;
    restaurant.tier = 'FREE';
    for (const [verb, url, body] of routes
      .slice(4, 8)
      .concat(routes.slice(11, 14)))
      await send(verb, url, body).expect(403);
  });
  it.each([
    undefined,
    null,
    '',
    ['r1'],
    { id: 'r1' },
    3,
    ' r1',
    'x'.repeat(201),
  ])('rejects malformed bulk tenants before I/O: %p', async (restaurantId) => {
    await send('patch', '/orders/status/bulk', {
      ...bulkBody,
      restaurantId,
    }).expect(400);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    expect(orders.bulkUpdateStatus).not.toHaveBeenCalled();
  });
  it.each([
    '/feedback',
    '/feedback?restaurantId=',
    '/feedback?restaurantId=r1&restaurantId=r2',
    '/assistance-requests?restaurantId=',
    '/orders?restaurantId=r1&restaurantId=r2',
  ])('rejects invalid query shape before any lookup: %s', async (url) => {
    await send('get', url).expect(400);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it('keeps customer loyalty routes separate from restaurant management', async () => {
    actor = undefined;
    await send('get', '/loyalty/r1/config').expect(200);
    expect(jwtCalls).toBe(0);
    actor = { id: 'customer', role: 'CUSTOMER' };
    await send('get', '/loyalty/accounts').expect(200);
    expect(loyalty.getLoyaltyAccounts).toHaveBeenCalledWith('customer');
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
  });
  it('rejects policy/resource combinations that could authorize the wrong target', () => {
    for (const declaration of [
      { policy: 'service-list', source: 'body', key: 'restaurantId' },
      {
        policy: 'service-list',
        source: 'query',
        key: 'restaurantId',
        resource: 'order',
      },
      {
        policy: 'order-update',
        source: 'body',
        key: 'restaurantId',
        resource: 'restaurant',
      },
      {
        policy: 'service-member',
        source: 'params',
        key: 'id',
        resource: 'table',
      },
      {
        policy: 'service-member',
        source: 'query',
        key: 'id',
        resource: 'restaurant',
      },
      { policy: 'loyalty-management', source: 'query', key: 'restaurantId' },
      {
        policy: 'notification-management',
        source: 'body',
        key: 'restaurantId',
      },
    ])
      expect(isRestaurantAccessRequirement(declaration)).toBe(false);
  });
});
