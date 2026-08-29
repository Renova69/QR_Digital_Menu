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
import { PaymentController } from '../payment/payment.controller';
import { PaymentService } from '../payment/payment.service';
import { SubscriptionController } from '../subscription/subscription.controller';
import { SubscriptionService } from '../subscription/subscription.service';
import {
  extractTableSessionToken,
  TABLE_SESSION_TOKEN_HEADER,
} from '../payment/table-session-token.decorator';

// Real routing, guards and DTOs with in-memory I/O. No database, Stripe client,
// credentials, AppModule or environment files are used by this application.
describe('Payment and billing restaurant access', () => {
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
  const sessionToken = 'test-session';
  const prisma = {
    restaurant: { findUnique: jest.fn(), findFirst: jest.fn() },
    payment: { findUnique: jest.fn() },
    paymentReconciliationIssue: { findUnique: jest.fn() },
    cashPaymentRequest: { findUnique: jest.fn() },
    tableSession: { findFirst: jest.fn() },
    user: { findUnique: jest.fn() },
  };
  const payments = {
    forceOpenSession: jest.fn(),
    closeSession: jest.fn(),
    closeSessionWithCard: jest.fn(),
    closeSessionWithCash: jest.fn(),
    reconcileStuckSession: jest.fn(),
    settlePartial: jest.fn(),
    getTableSessions: jest.fn(),
    getPaymentsOverview: jest.fn(),
    getPayoutsSnapshot: jest.fn(),
    getPaymentSettings: jest.fn(),
    getPaymentHistory: jest.fn(),
    getPaymentReconciliationIssues: jest.fn(),
    resolvePaymentReconciliationIssue: jest.fn(),
    reopenSessionForRecollection: jest.fn(),
    exportPayments: jest.fn(),
    getPaymentDetail: jest.fn(),
    refundPayment: jest.fn(),
    getPaymentNotificationFeed: jest.fn(),
    markPaymentNotificationsRead: jest.fn(),
    listCashPaymentRequests: jest.fn(),
    confirmCashPaymentRequest: jest.fn(),
    cancelCashPaymentRequest: jest.fn(),
    getSessionBill: jest.fn(),
    handleWebhookEvent: jest.fn(),
  };
  const subscriptions = {
    getSubscriptionDetails: jest.fn(),
    createCheckoutSession: jest.fn(),
    createPortalSession: jest.fn(),
    confirmCheckoutSession: jest.fn(),
    handleWebhook: jest.fn(),
  };
  const calls = [...Object.values(payments), ...Object.values(subscriptions)];
  const children = [
    prisma.payment.findUnique,
    prisma.paymentReconciliationIssue.findUnique,
    prisma.cashPaymentRequest.findUnique,
    prisma.tableSession.findFirst,
  ];
  type Route = [
    'get' | 'post',
    string,
    Record<string, unknown> | undefined,
    jest.Mock,
  ];
  const split = {
    restaurantId: 'r1',
    mode: 'CUSTOM',
    provider: 'CASH',
    amount: 10,
  };
  const routes: Route[] = [
    [
      'post',
      '/payments/session/force-open',
      { restaurantId: 'r1', tableId: 'table1' },
      payments.forceOpenSession,
    ],
    [
      'post',
      '/payments/session/close',
      { restaurantId: 'r1' },
      payments.closeSession,
    ],
    [
      'post',
      '/payments/session/close-card',
      { restaurantId: 'r1' },
      payments.closeSessionWithCard,
    ],
    [
      'post',
      '/payments/session/close-cash',
      { restaurantId: 'r1' },
      payments.closeSessionWithCash,
    ],
    [
      'post',
      '/payments/session/reconcile-pending',
      {},
      payments.reconcileStuckSession,
    ],
    ['post', '/payments/session/settle-partial', split, payments.settlePartial],
    ['get', '/payments/sessions/r1', undefined, payments.getTableSessions],
    ['get', '/payments/overview/r1', undefined, payments.getPaymentsOverview],
    ['get', '/payments/payouts/r1', undefined, payments.getPayoutsSnapshot],
    ['get', '/payments/settings/r1', undefined, payments.getPaymentSettings],
    ['get', '/payments/history/r1', undefined, payments.getPaymentHistory],
    [
      'get',
      '/payments/reconciliation/r1',
      undefined,
      payments.getPaymentReconciliationIssues,
    ],
    [
      'post',
      '/payments/reconciliation/issues/issue1/resolve',
      { status: 'RESOLVED', note: 'Reviewed' },
      payments.resolvePaymentReconciliationIssue,
    ],
    [
      'post',
      '/payments/reconciliation/issues/issue1/reopen-session',
      { note: 'Recollect' },
      payments.reopenSessionForRecollection,
    ],
    ['get', '/payments/export/r1', undefined, payments.exportPayments],
    ['get', '/payments/pay1', undefined, payments.getPaymentDetail],
    [
      'post',
      '/payments/pay1/refund',
      { reason: 'Duplicate' },
      payments.refundPayment,
    ],
    [
      'get',
      '/payments/notifications/r1',
      undefined,
      payments.getPaymentNotificationFeed,
    ],
    [
      'post',
      '/payments/notifications/r1/read',
      {},
      payments.markPaymentNotificationsRead,
    ],
    [
      'get',
      '/payments/cash-requests/r1',
      undefined,
      payments.listCashPaymentRequests,
    ],
    [
      'post',
      '/payments/cash-requests/cash1/confirm',
      {},
      payments.confirmCashPaymentRequest,
    ],
    [
      'post',
      '/payments/cash-requests/cash1/cancel',
      {},
      payments.cancelCashPaymentRequest,
    ],
    [
      'get',
      '/subscription/status?restaurantId=r1',
      undefined,
      subscriptions.getSubscriptionDetails,
    ],
    [
      'post',
      '/subscription/checkout',
      { restaurantId: 'r1', tier: 'PROFESSIONAL' },
      subscriptions.createCheckoutSession,
    ],
    [
      'post',
      '/subscription/portal',
      { restaurantId: 'r1' },
      subscriptions.createPortalSession,
    ],
  ];
  function send(
    verb: 'get' | 'post',
    url: string,
    body?: Record<string, unknown>,
    header = sessionToken,
  ) {
    const call = request(app.getHttpServer())[verb](url);
    if (header) call.set(TABLE_SESSION_TOKEN_HEADER, header);
    return body ? call.send(body) : call;
  }
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentController, SubscriptionController],
      providers: [
        FeatureService,
        { provide: PrismaService, useValue: prisma },
        { provide: PaymentService, useValue: payments },
        { provide: SubscriptionService, useValue: subscriptions },
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
    prisma.restaurant.findFirst.mockImplementation(async () => restaurant);
    prisma.user.findUnique.mockImplementation(async () => actor);
    for (const lookup of children)
      lookup.mockResolvedValue({ restaurantId: 'r1' });
    for (const call of calls) call.mockResolvedValue({ ok: true });
    subscriptions.getSubscriptionDetails.mockResolvedValue(null);
  });

  it.each(routes)(
    '%s %s authenticates once and rejects foreign tenants before dispatch',
    async (verb, url, body, call) => {
      await send(verb, url, body).expect(
        url.startsWith('/subscription/') && verb === 'post' ? 201 : 200,
      );
      expect(jwtCalls).toBe(1);
      expect(call).toHaveBeenCalledTimes(1);
      expect(getRestaurantAccess(lastRequest)).toEqual({
        restaurantId: 'r1',
        userId: 'owner',
        role: 'OWNER',
        tier: 'ENTERPRISE',
        forceTier: null,
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
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
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
    'preserves the distinct assigned %s payment/billing contracts',
    async (role) => {
      actor = { id: 'member', role, restaurantId: 'r1' };
      for (const [index, [verb, url, body]] of routes.entries()) {
        const allowed =
          index < 6
            ? ['MANAGER', 'WAITER', 'SUPER_ADMIN'].includes(role)
            : index < 17
              ? ['OWNER', 'MANAGER', 'SUPER_ADMIN'].includes(role)
              : index < 20
                ? true
                : index < 22
                  ? [
                      'OWNER',
                      'MANAGER',
                      'WAITER',
                      'STAFF',
                      'SUPER_ADMIN',
                    ].includes(role)
                  : index === 22;
        await send(verb, url, body).expect(allowed ? 200 : 403);
      }
    },
  );
  it('does not revive demoted managers for POS or financial management', async () => {
    actor = { id: 'manager', role: 'STAFF', restaurantId: 'r1' };
    prisma.user.findUnique.mockResolvedValue({
      restaurantId: 'r1',
      role: 'MANAGER',
    });
    for (const [verb, url, body] of routes.slice(0, 17))
      await send(verb, url, body).expect(403);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    // Cash collection is deliberately permitted for STAFF; force/close is not.
    await send('post', '/payments/cash-requests/cash1/confirm').expect(200);
    expect(payments.confirmCashPaymentRequest).toHaveBeenCalledWith(
      'cash1',
      'r1',
      'manager',
    );
  });
  it('preserves the existing payment admin exception but not owner billing', async () => {
    actor = { id: 'admin', role: 'SUPER_ADMIN' };
    restaurant.isActive = false;
    restaurant.deletedAt = new Date();
    for (const [verb, url, body] of routes.slice(0, 23))
      await send(verb, url, body).expect(200);
    for (const [verb, url, body] of routes.slice(23))
      await send(verb, url, body).expect(403);
    // Reporting's legacy helper checks actual ownership before the admin bypass.
    actor.id = 'owner';
    await send('get', '/payments/history/r1').expect(403);
    await send('post', '/payments/session/close', {
      restaurantId: 'r1',
    }).expect(200);
  });
  it.each(['suspended', 'deleted'] as const)(
    'keeps payment %s gates, while billing recovery remains reachable',
    async (state) => {
      if (state === 'suspended') restaurant.isActive = false;
      else restaurant.deletedAt = new Date();
      for (const [verb, url, body] of routes.slice(0, 22))
        await send(verb, url, body).expect(403);
      for (const [verb, url, body] of routes.slice(22))
        await send(verb, url, body).expect(verb === 'post' ? 201 : 200);
    },
  );
  it('retains feature gates but does not add paid-tier requirements to cash/feed/billing recovery', async () => {
    restaurant.tier = 'FREE';
    for (const [verb, url, body] of routes.slice(0, 17)) {
      const response = await send(verb, url, body).expect(403);
      expect(response.body).toMatchObject({ code: 'FEATURE_LOCKED' });
    }
    for (const [verb, url, body] of routes.slice(17))
      await send(verb, url, body).expect(
        url.startsWith('/subscription/') && verb === 'post' ? 201 : 200,
      );
  });
  it.each([
    ['/payments/pay1', 'pay1', prisma.payment.findUnique],
    [
      '/payments/reconciliation/issues/issue1/resolve',
      'issue1',
      prisma.paymentReconciliationIssue.findUnique,
    ],
    [
      '/payments/cash-requests/cash1/confirm',
      'cash1',
      prisma.cashPaymentRequest.findUnique,
    ],
  ] as const)(
    'authorizes %s using only its authoritative resource relationship',
    async (url, id, lookup) => {
      const verb = url === '/payments/pay1' ? 'get' : 'post';
      lookup.mockResolvedValue({ restaurantId: 'r2' });
      await send(verb, url + '?restaurantId=r1', {
        restaurantId: 'r1',
        status: 'RESOLVED',
      }).expect(403);
      expect(lookup).toHaveBeenCalledWith({
        where: { id },
        select: { restaurantId: true },
      });
      lookup.mockResolvedValue(null);
      await send(verb, url).expect(404);
      for (const call of calls) expect(call).not.toHaveBeenCalled();
    },
  );
  it('resolves reconciliation from the header credential without exposing it in context', async () => {
    await send('post', '/payments/session/reconcile-pending', {
      restaurantId: 'r2',
    }).expect(200);
    expect(prisma.tableSession.findFirst).toHaveBeenCalledWith({
      where: { token: sessionToken },
      select: { restaurantId: true },
    });
    expect(payments.reconcileStuckSession).toHaveBeenCalledWith(
      sessionToken,
      'owner',
    );
    expect(Object.keys(getRestaurantAccess(lastRequest)!)).toEqual([
      'restaurantId',
      'userId',
      'role',
      'tier',
      'forceTier',
    ]);
    prisma.tableSession.findFirst.mockResolvedValue({ restaurantId: 'r2' });
    await send('post', '/payments/session/reconcile-pending?restaurantId=r1', {
      restaurantId: 'r1',
    }).expect(403);
    prisma.tableSession.findFirst.mockResolvedValue(null);
    await send('post', '/payments/session/reconcile-pending').expect(404);
  });
  it.each(['', 'one,two', 'x'.repeat(257)])(
    'rejects malformed reconciliation credentials before I/O (%s)',
    async (header) => {
      await send(
        'post',
        '/payments/session/reconcile-pending?token=ignored',
        { sessionToken },
        header,
      ).expect(401);
      expect(prisma.tableSession.findFirst).not.toHaveBeenCalled();
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    },
  );
  it('shares header validation with the existing public parameter decorator', () => {
    for (const raw of [
      undefined,
      null,
      3,
      [],
      [sessionToken],
      '',
      ' ',
      'a,b',
      'x'.repeat(257),
    ]) {
      expect(() =>
        extractTableSessionToken({ [TABLE_SESSION_TOKEN_HEADER]: raw }),
      ).toThrow(UnauthorizedException);
    }
    expect(
      extractTableSessionToken({
        [TABLE_SESSION_TOKEN_HEADER]: '  test-session  ',
      }),
    ).toBe(sessionToken);
    expect(
      extractTableSessionToken({
        [TABLE_SESSION_TOKEN_HEADER]: 'x'.repeat(256),
      }),
    ).toHaveLength(256);
  });
  it('keeps service compound checks and applies the plan to the resolved target', async () => {
    prisma.restaurant.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) => ({
        ...restaurant,
        id: where.id,
        tier: where.id === 'r1' ? 'ENTERPRISE' : 'FREE',
      }),
    );
    await send('post', '/payments/session/close?restaurantId=r2', {
      restaurantId: 'r1',
    }).expect(200);
    expect(payments.closeSession).toHaveBeenCalledWith(
      sessionToken,
      'r1',
      'owner',
    );
    await send('post', '/payments/session/settle-partial', split).expect(200);
    expect(payments.settlePartial).toHaveBeenCalledWith(
      sessionToken,
      'r1',
      'owner',
      expect.objectContaining(split),
    );
    await send('post', '/payments/session/force-open', {
      restaurantId: 'r1',
      tableId: 'table1',
    }).expect(200);
    expect(payments.forceOpenSession).toHaveBeenCalledWith(
      'table1',
      'r1',
      'owner',
    );
    await send('post', '/payments/session/close?restaurantId=r1', {
      restaurantId: 'r2',
    }).expect(403);
    prisma.tableSession.findFirst.mockResolvedValue({ restaurantId: 'r2' });
    await send('post', '/payments/session/reconcile-pending', {
      restaurantId: 'r1',
    }).expect(403);
    prisma.payment.findUnique.mockResolvedValue({ restaurantId: 'r2' });
    await send('get', '/payments/pay1?restaurantId=r1').expect(403);
  });
  it('resolves omitted billing targets once: assignment first, otherwise first owned', async () => {
    await send('get', '/subscription/status').expect(200);
    expect(prisma.restaurant.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ownerId: 'owner' } }),
    );
    jest.clearAllMocks();
    actor = { id: 'member', role: 'WAITER', restaurantId: 'r1' };
    await send('get', '/subscription/status', { restaurantId: 'r2' }).expect(
      200,
    );
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
    expect(subscriptions.getSubscriptionDetails).toHaveBeenCalledWith('r1');
    actor = { id: 'owner', role: 'OWNER' };
    await send('post', '/subscription/checkout', {
      tier: 'PROFESSIONAL',
      onboarding: true,
    }).expect(201);
    expect(subscriptions.createCheckoutSession).toHaveBeenCalledWith(
      'r1',
      'PROFESSIONAL',
      'monthly',
      'owner',
      true,
    );
    await send('post', '/subscription/portal').expect(201);
    expect(subscriptions.createPortalSession).toHaveBeenCalledWith(
      'r1',
      'owner',
    );
  });
  it('returns FREE for accounts with no restaurant; billing writes still fail and never fall back from an explicit missing target', async () => {
    prisma.restaurant.findFirst.mockResolvedValue(null);
    const response = await send('get', '/subscription/status').expect(200);
    expect(response.body).toMatchObject({
      tier: 'FREE',
      subscription: null,
      hasSubscription: false,
    });
    expect(getRestaurantAccess(lastRequest)).toBeUndefined();
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    expect(subscriptions.getSubscriptionDetails).not.toHaveBeenCalled();
    await send('post', '/subscription/checkout', {
      tier: 'PROFESSIONAL',
    }).expect(404);
    await send('post', '/subscription/portal').expect(404);
    jest.clearAllMocks();
    await send('get', '/subscription/status?restaurantId=missing').expect(200);
    await send('post', '/subscription/portal', {
      restaurantId: 'missing',
    }).expect(404);
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
    expect(subscriptions.createPortalSession).not.toHaveBeenCalled();
    actor = { id: 'member', role: 'WAITER', restaurantId: 'missing' };
    await send('get', '/subscription/status').expect(200);
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
  });
  it('does not select a second default if the first-owned lookup changes during dispatch', async () => {
    const second = { ...restaurant, id: 'r2' };
    prisma.restaurant.findFirst
      .mockResolvedValueOnce(restaurant)
      .mockResolvedValue(second);
    await send('post', '/subscription/portal').expect(201);
    expect(prisma.restaurant.findFirst).toHaveBeenCalledTimes(1);
    expect(subscriptions.createPortalSession).toHaveBeenCalledWith(
      'r1',
      'owner',
    );
  });
  it.each([null, '', ' r1', ['r1'], { id: 'r1' }, 3, 'x'.repeat(201)])(
    'rejects malformed billing/body tenant ids before I/O: %p',
    async (restaurantId) => {
      for (const url of [
        '/subscription/portal',
        '/subscription/checkout',
        '/payments/session/close',
      ]) {
        await send('post', url, { restaurantId, tier: 'PROFESSIONAL' }).expect(
          400,
        );
      }
      expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    },
  );
  it.each([
    '/subscription/status?restaurantId=',
    '/subscription/status?restaurantId=r1&restaurantId=r2',
  ])(
    'rejects malformed status targets rather than falling back: %s',
    async (url) => {
      await send('get', url).expect(400);
      expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    },
  );
  it('keeps public session/webhook and authenticated checkout-confirmation contracts separate', async () => {
    actor = undefined;
    await send('get', '/payments/session/bill').expect(200);
    await send('post', '/payments/webhook', {}).expect(200);
    await send('post', '/subscription/webhook', {}).expect(200);
    expect(jwtCalls).toBe(0);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    expect(prisma.tableSession.findFirst).not.toHaveBeenCalled();
    actor = { id: 'customer', role: 'CUSTOMER' };
    await send('post', '/subscription/confirm-session', {
      sessionId: 'cs_test',
    }).expect(201);
    expect(subscriptions.confirmCheckoutSession).toHaveBeenCalledWith(
      'cs_test',
      'customer',
    );
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    // Signature verification is still owned by the real provider services;
    // this test verifies routing, not acceptance of unsigned real webhooks.
  });
  it('rejects cross-wired policy/source/resource metadata', () => {
    for (const declaration of [
      {
        policy: 'payment-pos',
        source: 'query',
        key: 'token',
        resource: 'table-session',
      },
      {
        policy: 'payment-pos',
        source: 'headers',
        key: 'authorization',
        resource: 'table-session',
      },
      { policy: 'payment-pos', source: 'body', key: 'restaurantId' },
      {
        policy: 'payment-management',
        source: 'params',
        key: 'id',
        resource: 'order',
      },
      {
        policy: 'payment-staff',
        source: 'params',
        key: 'id',
        resource: 'payment',
      },
      {
        policy: 'payment-cash',
        source: 'params',
        key: 'id',
        resource: 'restaurant',
      },
      { policy: 'billing-owner', source: 'query', key: 'restaurantId' },
      {
        policy: 'billing-status',
        source: 'query',
        key: 'restaurantId',
        resource: 'restaurant',
      },
      { policy: 'dashboard', source: 'headers', key: 'restaurantId' },
    ])
      expect(isRestaurantAccessRequirement(declaration)).toBe(false);
  });
});
