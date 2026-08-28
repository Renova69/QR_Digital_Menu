import {
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { PrintStationController } from '../print-station/print-station.controller';
import { PrintStationService } from '../print-station/print-station.service';
import { StaffController } from '../restaurants/staff.controller';
import { UsersService } from '../users/users.service';
import { MenuViewController } from '../menu-views/menu-view.controller';
import { MenuViewService } from '../menu-views/menu-view.service';
import { FeatureService } from '../subscription/feature.service';

/** Real Nest routing, decorator ordering, access guard, FeatureGuard and param
 * extraction. Only the already-tested authentication and I/O are substituted;
 * no AppModule, .env, external service or actual database is loaded. */
describe('Declarative restaurant access over HTTP', () => {
  let app: INestApplication;
  let actor: { id: string; role: string; restaurantId?: string } | undefined;
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
    user: { findUnique: jest.fn() },
  };
  const dashboard = {
    getSummary: jest.fn(),
    getDailyCloseout: jest.fn(),
    getAnalytics: jest.fn(),
  };
  const printers = {
    list: jest.fn(),
    reactivateAgentToken: jest.fn(),
    revokeToken: jest.fn(),
  };
  const staff = {
    listStaffMembers: jest.fn(),
    resetStaffPin: jest.fn(),
    createStaffMember: jest.fn(),
  };
  const views = { recordView: jest.fn(), getScanStats: jest.fn() };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [
        DashboardController,
        PrintStationController,
        StaffController,
        MenuViewController,
      ],
      providers: [
        FeatureService,
        { provide: PrismaService, useValue: prisma },
        { provide: DashboardService, useValue: dashboard },
        { provide: PrintStationService, useValue: printers },
        { provide: UsersService, useValue: staff },
        { provide: MenuViewService, useValue: views },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          if (!actor) throw new UnauthorizedException();
          context.switchToHttp().getRequest<{ user: typeof actor }>().user =
            actor;
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
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
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === 'r1'
            ? restaurant
            : { ...restaurant, id: where.id, ownerId: 'other' },
        ),
    );
    prisma.restaurant.findFirst.mockImplementation(() =>
      Promise.resolve(restaurant),
    );
    prisma.user.findUnique.mockImplementation(() => Promise.resolve(actor));
    dashboard.getSummary.mockResolvedValue({ total: 1 });
    dashboard.getDailyCloseout.mockResolvedValue({ total: 2 });
    printers.list.mockResolvedValue([]);
    staff.listStaffMembers.mockResolvedValue([]);
    views.getScanStats.mockResolvedValue({ totalViews: 3 });
  });

  it.each([
    '/dashboard/summary?restaurantId=r1',
    '/print-stations?restaurantId=r1',
    '/restaurants/r1/staff',
    '/dashboard/scan-stats/r1',
  ])('authenticates before touching tenant data: %s', async (url) => {
    actor = undefined;
    await request(app.getHttpServer()).get(url).expect(401);
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    expect(prisma.restaurant.findFirst).not.toHaveBeenCalled();
  });
  it.each([
    '/dashboard/summary?restaurantId=r2',
    '/print-stations?restaurantId=r2',
    '/restaurants/r2/staff',
    '/dashboard/scan-stats/r2',
  ])(
    'rejects a different tenant before entering the handler: %s',
    async (url) => {
      await request(app.getHttpServer()).get(url).expect(403);
      for (const mock of [
        dashboard.getSummary,
        printers.list,
        staff.listStaffMembers,
        views.getScanStats,
      ])
        expect(mock).not.toHaveBeenCalled();
    },
  );
  it('allows an assigned manager into the dashboard', async () => {
    actor = { id: 'manager', role: 'MANAGER', restaurantId: 'r1' };
    await request(app.getHttpServer())
      .get('/dashboard/summary?restaurantId=r1')
      .expect(200, { total: 1 });
  });
  it('cannot undo tier-driven manager demotion using a raw DB role', async () => {
    actor = { id: 'manager', role: 'STAFF', restaurantId: 'r1' };
    prisma.user.findUnique.mockResolvedValue({ ...actor, role: 'MANAGER' });
    await request(app.getHttpServer())
      .get('/dashboard/summary?restaurantId=r1')
      .expect(403);
    await request(app.getHttpServer()).get('/restaurants/r1/staff').expect(403);
    expect(dashboard.getSummary).not.toHaveBeenCalled();
    expect(staff.listStaffMembers).not.toHaveBeenCalled();
  });
  it('does not turn FeatureGuard super-admin bypass into tenant permission', async () => {
    actor = { id: 'admin', role: 'SUPER_ADMIN' };
    await request(app.getHttpServer())
      .get('/dashboard/summary?restaurantId=r1')
      .expect(403);
    await request(app.getHttpServer())
      .get('/print-stations?restaurantId=r1')
      .expect(403);
    expect(printers.list).not.toHaveBeenCalled();
  });
  it('uses the path restaurant for closeout even if another tenant is in the query', async () => {
    await request(app.getHttpServer())
      .get('/dashboard/closeout/r1?restaurantId=r2&date=2026-08-28')
      .expect(200);
    expect(dashboard.getDailyCloseout).toHaveBeenCalledWith('r1', '2026-08-28');
    for (const [args] of prisma.restaurant.findUnique.mock.calls)
      expect(args.where.id).toBe('r1');
  });
  it('uses the verified owner fallback for BOTH printer access and feature entitlement', async () => {
    actor = { id: 'owner', role: 'OWNER', restaurantId: 'r2' };
    await request(app.getHttpServer()).get('/print-stations').expect(200);
    expect(printers.list).toHaveBeenCalledWith('r1');
    expect(prisma.restaurant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: 'owner', deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
    );
    for (const [args] of prisma.restaurant.findUnique.mock.calls)
      expect(args.where.id).toBe('r1');
  });
  it('still enforces the thermal-printer feature after owner authorization', async () => {
    restaurant.tier = 'FREE';
    await request(app.getHttpServer())
      .get('/print-stations?restaurantId=r1')
      .expect(403);
    expect(printers.list).not.toHaveBeenCalled();
  });
  it.each([
    '/dashboard/summary?restaurantId=r1',
    '/print-stations?restaurantId=r1',
  ])(
    'preserves the localized suspension error code before FeatureGuard: %s',
    async (url) => {
      restaurant.isActive = false;
      const response = await request(app.getHttpServer()).get(url).expect(403);
      expect(response.body).toMatchObject({ code: 'RESTAURANT_SUSPENDED' });
      expect(dashboard.getSummary).not.toHaveBeenCalled();
      expect(printers.list).not.toHaveBeenCalled();
    },
  );
  it('uses the latest feature-check tier for analytics response filtering', async () => {
    // The former controller checked tier AFTER FeatureGuard. Moving access to
    // an earlier guard must not resurrect premium fields after a tier downgrade.
    prisma.restaurant.findUnique
      .mockResolvedValueOnce({ ...restaurant, tier: 'ENTERPRISE' })
      .mockResolvedValueOnce({ ...restaurant, tier: 'STARTER' });
    dashboard.getAnalytics.mockResolvedValue({
      totalRevenue: 100,
      topItems: ['premium'],
      paymentsByMethod: ['premium'],
    });
    const response = await request(app.getHttpServer())
      .get('/dashboard/analytics?restaurantId=r1')
      .expect(200);
    expect(response.body).toEqual({ totalRevenue: 100 });
    expect(dashboard.getAnalytics).toHaveBeenCalledWith(
      'r1',
      7,
      undefined,
      undefined,
      false,
      undefined,
    );
  });
  it.each(['reactivate', 'revoke'] as const)(
    'keeps printer %s owner-only and scopes the token to the authorized restaurant',
    async (action) => {
      const url =
        action === 'reactivate'
          ? '/print-stations/tokens/t1/reactivate?restaurantId=r1'
          : '/print-stations/tokens/t1?restaurantId=r1';
      const call = () =>
        action === 'reactivate'
          ? request(app.getHttpServer()).post(url)
          : request(app.getHttpServer()).delete(url);
      actor = { id: 'manager', role: 'MANAGER', restaurantId: 'r1' };
      await call().expect(403);
      const method =
        action === 'reactivate'
          ? printers.reactivateAgentToken
          : printers.revokeToken;
      expect(method).not.toHaveBeenCalled();
      actor = { id: 'owner', role: 'OWNER' };
      await call().expect(action === 'reactivate' ? 201 : 200);
      expect(method).toHaveBeenCalledWith('r1', 't1');
    },
  );
  it('passes the effective caller role and audit identity to staff reset, never the body/query tenant', async () => {
    actor = { id: 'manager', role: 'MANAGER', restaurantId: 'r1' };
    await request(app.getHttpServer())
      .post('/restaurants/r1/staff/waiter/reset-pin?restaurantId=r2')
      .send({ restaurantId: 'r3', role: 'OWNER' })
      .expect(201);
    expect(staff.resetStaffPin).toHaveBeenCalledWith(
      'r1',
      'waiter',
      'MANAGER',
      'manager',
    );
  });
  it.each(['STAFF', 'MANAGER', 'WAITER', 'KITCHEN'])(
    'allows assigned %s scan reporting without a paid-tier gate',
    async (role) => {
      actor = { id: 'staff', role, restaurantId: 'r1' };
      restaurant.tier = 'FREE';
      await request(app.getHttpServer())
        .get('/dashboard/scan-stats/r1')
        .expect(200, { totalViews: 3 });
    },
  );
  it('leaves public scan recording anonymous', async () => {
    actor = undefined;
    await request(app.getHttpServer())
      .post('/menu/public/r1/view')
      .send({ table: '5', visitorId: 'visitor' })
      .expect(204);
    expect(views.recordView).toHaveBeenCalledWith('r1', {
      table: '5',
      visitorId: 'visitor',
    });
    expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
  });
  it.each([
    '',
    '?restaurantId=',
    '?restaurantId=r1&restaurantId=r2',
    '?restaurantId[x]=r1',
  ])(
    'rejects missing/ambiguous dashboard query before Prisma: %s',
    async (query) => {
      await request(app.getHttpServer())
        .get('/dashboard/summary' + query)
        .expect(400);
      expect(prisma.restaurant.findUnique).not.toHaveBeenCalled();
    },
  );
});
