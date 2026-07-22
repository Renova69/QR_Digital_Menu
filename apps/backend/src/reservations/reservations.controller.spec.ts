import { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlag } from '../subscription/feature-flag.enum';
import { FeatureGuard } from '../subscription/feature.guard';
import { FeatureService } from '../subscription/feature.service';
import { REQUIRE_FEATURE_KEY } from '../subscription/require-feature.decorator';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

function guardNames(metadataTarget: object | Function): string[] {
  return (Reflect.getMetadata(GUARDS_METADATA, metadataTarget) ?? []).map(
    (guard: unknown) => {
      if (typeof guard === 'function') return guard.name;
      return (guard as { constructor?: { name?: string } })?.constructor?.name;
    },
  );
}

describe('ReservationsController entitlement coverage', () => {
  it('gates the entire controller behind the paid reservations feature', () => {
    expect(guardNames(ReservationsController)).toEqual(
      expect.arrayContaining([JwtAuthGuard.name, FeatureGuard.name]),
    );
    // A class-level RequireFeature gates every route — including list/action/
    // updateInternal, which previously shipped ungated — and any future handler,
    // since FeatureGuard resolves the flag via getAllAndOverride([handler, class]).
    expect(
      Reflect.getMetadata(REQUIRE_FEATURE_KEY, ReservationsController),
    ).toEqual([FeatureFlag.RESERVATIONS]);
  });
});

describe('ReservationsController HTTP entitlement boundary', () => {
  let app: INestApplication;
  let tier = 'STARTER';
  const reservations = {
    getSettings: jest.fn().mockResolvedValue({ settings: null }),
    list: jest.fn().mockResolvedValue([]),
  };
  const prisma = {
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ restaurantId: null, role: 'OWNER' }),
    },
    restaurant: {
      findUnique: jest.fn().mockImplementation(async () => ({
        ownerId: 'user-1',
        tier,
        forceTier: null,
        isActive: true,
      })),
      findFirst: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReservationsController],
      providers: [
        FeatureGuard,
        FeatureService,
        { provide: PrismaService, useValue: prisma },
        { provide: ReservationsService, useValue: reservations },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          context.switchToHttp().getRequest().user = { id: 'user-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    tier = 'STARTER';
    jest.clearAllMocks();
  });

  it('blocks reservation servicing below the required tier and allows it at/above', async () => {
    // Full lockdown: a sub-PROFESSIONAL tier cannot even list existing bookings.
    await request(app.getHttpServer()).get('/reservations/rest-1').expect(403);
    expect(reservations.list).not.toHaveBeenCalled();

    await request(app.getHttpServer())
      .get('/reservations/rest-1/settings')
      .expect(403);
    expect(reservations.getSettings).not.toHaveBeenCalled();

    tier = 'PROFESSIONAL';
    await request(app.getHttpServer())
      .get('/reservations/rest-1')
      .expect(200, []);
    expect(reservations.list).toHaveBeenCalledWith(
      'rest-1',
      'user-1',
      expect.any(Object),
    );

    await request(app.getHttpServer())
      .get('/reservations/rest-1/settings')
      .expect(200, { settings: null });
    expect(reservations.getSettings).toHaveBeenCalledWith('rest-1', 'user-1');
  });

  it('returns 403 for getSettings when user tier is FREE', async () => {
    tier = 'FREE';
    await request(app.getHttpServer())
      .get('/reservations/rest-1/settings')
      .expect(403);
  });

  it('allows getSettings for ENTERPRISE tier', async () => {
    tier = 'ENTERPRISE';
    await request(app.getHttpServer())
      .get('/reservations/rest-1/settings')
      .expect(200, { settings: null });
    expect(reservations.getSettings).toHaveBeenCalledWith('rest-1', 'user-1');
  });
});
