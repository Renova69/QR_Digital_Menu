import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter } from 'events';
import * as dns from 'dns';
import * as https from 'https';
import * as http from 'http';
import { RestaurantsService } from './restaurants.service';

// http.request/https.request are non-configurable on the live module binding
// in this Node version, so jest.spyOn(http, 'request') throws "Cannot
// redefine property". Replace the whole module with the real exports plus a
// mockable `request`, instead of trying to redefine the live property.
jest.mock('http', () => ({
  ...jest.requireActual('http'),
  request: jest.fn(),
}));
jest.mock('https', () => ({
  ...jest.requireActual('https'),
  request: jest.fn(),
}));

/** Mocks https.request/http.request to simulate a response without any real
 *  network I/O, and captures the exact options the SUT connected with (so
 *  tests can assert the connection target/headers, e.g. that the resolved IP
 *  — not a re-resolved hostname — was used). */
function mockPinnedHttpResponse(opts: {
  secure?: boolean;
  statusCode?: number;
  contentType?: string | null;
  body?: Buffer;
}) {
  const {
    secure = true,
    statusCode = 200,
    contentType = 'image/png',
    body = Buffer.from('logo-bytes'),
  } = opts;
  const target = secure ? https : http;
  const spy = (target.request as jest.Mock).mockImplementation(
    (options: any, callback: any) => {
      const req: any = new EventEmitter();
      req.end = jest.fn();
      req.destroy = jest.fn();
      const res: any = new EventEmitter();
      res.statusCode = statusCode;
      res.headers = { 'content-type': contentType };
      res.resume = jest.fn();
      process.nextTick(() => {
        callback(res);
        res.emit('data', body);
        res.emit('end');
      });
      return req;
    },
  );
  return { spy, options: () => spy.mock.calls[0]?.[0] };
}

const makeRestaurant = (overrides: Record<string, unknown> = {}) => ({
  id: 'rest1',
  ownerId: 'user1',
  name: 'Test Restaurant',
  stripeAccountId: null,
  stripeOnboarded: false,
  targetLanguages: [] as string[],
  dashboardLanguage: 'en',
  menuSourceLanguage: 'bg',
  isActive: true,
  deletedAt: null,
  ...overrides,
});

describe('RestaurantsService', () => {
  let service: RestaurantsService;
  let mockPrisma: Record<string, Record<string, jest.Mock>>;
  let mockTranslation: Record<string, jest.Mock>;
  let mockStripe: Record<string, jest.Mock>;
  let mockFeature: Record<string, jest.Mock>;
  let mockDeviceEnrollment: Record<string, jest.Mock>;
  let mockEvents: Record<string, jest.Mock>;
  let mockTranslationEnqueue: Record<string, jest.Mock>;
  let mockTranslationWorker: Record<string, jest.Mock>;
  let mockTranslationQuota: Record<string, jest.Mock>;

  beforeEach(() => {
    mockPrisma = {
      restaurant: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue(makeRestaurant()),
        delete: jest.fn().mockResolvedValue(makeRestaurant()),
      },
      user: {
        findUnique: jest.fn(),
      },
      menuCategory: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      menuItem: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      menuOption: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      translationRun: {
        create: jest.fn().mockResolvedValue({
          id: 'run-1',
          createdAt: new Date('2026-08-09T10:00:00.000Z'),
        }),
        update: jest.fn().mockResolvedValue({ id: 'run-1' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      menuTranslationState: {
        groupBy: jest
          .fn()
          .mockResolvedValue([{ status: 'STALE', _count: { _all: 1 } }]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockTranslation = {
      translateObject: jest.fn().mockResolvedValue({}),
      isEnabled: jest.fn().mockReturnValue(true),
    };

    mockTranslationEnqueue = {
      enqueueCategory: jest.fn().mockResolvedValue(undefined),
      enqueueItem: jest.fn().mockResolvedValue(undefined),
      enqueueOption: jest.fn().mockResolvedValue(undefined),
      enqueueBatch: jest
        .fn()
        .mockImplementation(async (thunks: Array<() => Promise<void>>) => {
          for (const thunk of thunks) await thunk();
        }),
    };

    mockTranslationWorker = {
      kick: jest.fn(),
      isAvailable: jest.fn().mockReturnValue(true),
      getRestaurantProgress: jest.fn().mockResolvedValue({
        done: 0,
        total: 0,
        pending: 0,
        failed: 0,
        current: 0,
        active: false,
        status: null,
        runId: null,
      }),
    };

    mockTranslationQuota = {
      assertCanSpend: jest
        .fn()
        .mockResolvedValue({ allowed: true, remaining: 1000 }),
    };

    mockStripe = {
      createExpressAccount: jest.fn().mockResolvedValue('acct_new'),
      createAccountLink: jest
        .fn()
        .mockResolvedValue('https://connect.stripe.com'),
      retrieveAccount: jest.fn().mockResolvedValue(true),
    };

    mockFeature = {
      getEffectiveTier: jest.fn(
        (tier: string, force?: string | null) => force ?? tier,
      ),
      hasFeature: jest.fn().mockReturnValue(true),
      restaurantHasFeature: jest.fn(function (
        this: {
          hasFeature: (tier: string, flag: string) => boolean;
          getEffectiveTier: (tier: string, force?: string | null) => string;
        },
        r: { tier?: string; forceTier?: string | null },
        f: string,
      ) {
        return this.hasFeature(
          this.getEffectiveTier(r?.tier ?? 'FREE', r?.forceTier ?? null),
          f,
        );
      }),
    };

    mockDeviceEnrollment = {
      revokeRestaurantDevices: jest
        .fn()
        .mockResolvedValue({ success: true, count: 0 }),
      evictRestaurantDevices: jest
        .fn()
        .mockResolvedValue({ success: true, count: 0 }),
    };

    mockEvents = {
      emitToRestaurant: jest.fn(),
    };

    service = new RestaurantsService(
      mockPrisma as unknown as ConstructorParameters<
        typeof RestaurantsService
      >[0],
      mockTranslation as unknown as ConstructorParameters<
        typeof RestaurantsService
      >[1],
      mockStripe as unknown as ConstructorParameters<
        typeof RestaurantsService
      >[2],
      mockFeature as unknown as ConstructorParameters<
        typeof RestaurantsService
      >[3],
      mockDeviceEnrollment as unknown as ConstructorParameters<
        typeof RestaurantsService
      >[4],
      mockEvents as unknown as ConstructorParameters<
        typeof RestaurantsService
      >[5],
      mockTranslationEnqueue as unknown as ConstructorParameters<
        typeof RestaurantsService
      >[6],
      mockTranslationWorker as unknown as ConstructorParameters<
        typeof RestaurantsService
      >[7],
      mockTranslationQuota as unknown as ConstructorParameters<
        typeof RestaurantsService
      >[8],
    );
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates restaurant with ownerId set to userId', async () => {
      const dto = { name: 'New Place' };
      const expected = makeRestaurant({ name: 'New Place' });
      mockPrisma.restaurant.create.mockResolvedValue(expected);

      const result = await service.create(dto, 'user1');

      expect(mockPrisma.restaurant.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ...dto, ownerId: 'user1' }),
      });
      expect(result).toBe(expected);
    });

    it('strips branding fields — new restaurants start on FREE', async () => {
      const dto = {
        name: 'New Place',
        logoUrl: 'https://r2/logo.webp',
        accentColor: '#abc',
      };
      mockPrisma.restaurant.create.mockResolvedValue(makeRestaurant());

      await service.create(dto, 'user1');

      const sentData = mockPrisma.restaurant.create.mock.calls[0][0].data;
      expect(sentData).not.toHaveProperty('logoUrl');
      expect(sentData).not.toHaveProperty('accentColor');
      expect(sentData).toMatchObject({ name: 'New Place', ownerId: 'user1' });
    });
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns restaurants owned by userId when user has no restaurantId', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });
      mockPrisma.restaurant.findMany.mockResolvedValue([makeRestaurant()]);

      const result = await service.findAll('user1');

      expect(mockPrisma.restaurant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ownerId: 'user1', deletedAt: null },
          select: expect.objectContaining({ id: true, tier: true }),
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('returns restaurants by restaurantId when user is staff', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest1' });
      mockPrisma.restaurant.findMany.mockResolvedValue([makeRestaurant()]);

      await service.findAll('staff1');

      expect(mockPrisma.restaurant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rest1', deletedAt: null },
          select: expect.objectContaining({ id: true, tier: true }),
        }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      await expect(service.findOne('rest1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user is not owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'other' }),
      );
      await expect(service.findOne('rest1', 'user1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns restaurant when user is owner', async () => {
      const restaurant = makeRestaurant();
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);

      const result = await service.findOne('rest1', 'user1');
      expect(result).toMatchObject({ id: 'rest1', name: 'Test Restaurant' });
      expect(result).not.toHaveProperty('stripeAccountId');
    });
  });

  // ─── findOneOrStaff ──────────────────────────────────────────────────────────

  describe('findOneOrStaff', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });

      await expect(service.findOneOrStaff('rest1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns restaurant for owner', async () => {
      const restaurant = makeRestaurant();
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null });

      const result = await service.findOneOrStaff('rest1', 'user1');
      expect(result).toMatchObject({ id: 'rest1', name: 'Test Restaurant' });
      expect(result).not.toHaveProperty('stripeAccountId');
    });

    it('returns restaurant for staff member assigned to it', async () => {
      const restaurant = makeRestaurant({ ownerId: 'owner1' });
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);
      mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: 'rest1' });

      const result = await service.findOneOrStaff('rest1', 'staff1');
      expect(result).toMatchObject({ id: 'rest1', name: 'Test Restaurant' });
      expect(result).not.toHaveProperty('stripeAccountId');
    });

    it('throws ForbiddenException when neither owner nor staff', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'owner1' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'other-rest',
      });

      await expect(service.findOneOrStaff('rest1', 'random')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── findOneForManagement ────────────────────────────────────────────────────

  describe('findOneForManagement', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'WAITER',
      });

      await expect(
        service.findOneForManagement('rest1', 'user1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns restaurant for owner', async () => {
      const restaurant = makeRestaurant();
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });

      const result = await service.findOneForManagement('rest1', 'user1');
      expect(result).toBe(restaurant);
    });

    it('returns restaurant for MANAGER assigned to it', async () => {
      const restaurant = makeRestaurant({ ownerId: 'owner1' });
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest1',
        role: 'MANAGER',
      });

      const result = await service.findOneForManagement('rest1', 'manager1');
      expect(result).toBe(restaurant);
    });

    it('throws ForbiddenException for WAITER even if assigned', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'owner1' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'rest1',
        role: 'WAITER',
      });

      await expect(
        service.findOneForManagement('rest1', 'waiter1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for MANAGER assigned to a different restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'owner1' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: 'other-rest',
        role: 'MANAGER',
      });

      await expect(
        service.findOneForManagement('rest1', 'manager1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('calls findOneForManagement then updates restaurant', async () => {
      const restaurant = makeRestaurant();
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });
      const updated = makeRestaurant({ name: 'Updated' });
      mockPrisma.restaurant.update.mockResolvedValue(updated);

      const result = await service.update(
        'rest1',
        { name: 'Updated' },
        'user1',
      );

      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rest1' },
          data: { name: 'Updated' },
        }),
      );
      expect(result).toMatchObject({ id: 'rest1', name: 'Updated' });
      expect(result).not.toHaveProperty('stripeAccountId');
    });

    it('throws ForbiddenException when not owner or manager', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'owner1' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'WAITER',
      });

      await expect(service.update('rest1', {}, 'waiter1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('evicts shared-device sessions without revoking tokens when Shared Device Mode is disabled', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ sharedDeviceModeEnabled: true }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });
      mockPrisma.restaurant.update.mockResolvedValue(
        makeRestaurant({ sharedDeviceModeEnabled: false }),
      );

      await service.update(
        'rest1',
        { sharedDeviceModeEnabled: false },
        'user1',
      );

      expect(mockDeviceEnrollment.evictRestaurantDevices).toHaveBeenCalledWith(
        'rest1',
      );
      expect(
        mockDeviceEnrollment.revokeRestaurantDevices,
      ).not.toHaveBeenCalled();
    });

    it('invalidates cached targets when the explicit menu source language changes', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ dashboardLanguage: 'en', menuSourceLanguage: 'bg' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });
      mockPrisma.restaurant.update.mockResolvedValue(
        makeRestaurant({ dashboardLanguage: 'en', menuSourceLanguage: 'ro' }),
      );

      await service.update('rest1', { menuSourceLanguage: 'ro' }, 'user1');

      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith({
        where: { restaurantId: 'rest1', locale: { not: 'ro' } },
        data: expect.objectContaining({
          status: 'STALE',
          sourceLang: 'ro',
          failureCount: 0,
        }),
      });
      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledWith({
        where: { restaurantId: 'rest1', locale: 'ro' },
        data: expect.objectContaining({ status: 'CURRENT', sourceLang: 'ro' }),
      });
      expect(mockTranslationWorker.kick).toHaveBeenCalledTimes(1);
    });

    it('detaches re-queued units from their old run so a finished run cannot be re-opened', async () => {
      // Run membership is owned by Translate All. A source-language change is
      // an owner edit: it must not push units back into a run whose
      // totalUnits is already frozen, or getRestaurantProgress recomputes
      // done = total - outstanding downward and the bar walks backward on an
      // already-COMPLETED run.
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ menuSourceLanguage: 'bg' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });
      mockPrisma.restaurant.update.mockResolvedValue(
        makeRestaurant({ menuSourceLanguage: 'ro' }),
      );

      await service.update('rest1', { menuSourceLanguage: 'ro' }, 'user1');

      for (const call of mockPrisma.menuTranslationState.updateMany.mock
        .calls) {
        expect(call[0].data).toMatchObject({ runId: null });
      }
      expect(mockPrisma.menuTranslationState.updateMany).toHaveBeenCalledTimes(
        2,
      );
    });

    it('does not invalidate menu translations when only dashboard language changes', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ dashboardLanguage: 'en', menuSourceLanguage: 'bg' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });

      await service.update('rest1', { dashboardLanguage: 'ro' }, 'user1');

      expect(mockPrisma.menuTranslationState.updateMany).not.toHaveBeenCalled();
      expect(mockTranslationWorker.kick).not.toHaveBeenCalled();
    });
  });

  // ─── branding tier enforcement ────────────────────────────────────────────────

  describe('update — branding tier gating', () => {
    const brandingDto = {
      name: 'Updated',
      fontHeading: 'Lobster',
      themeDarkAccentColor: '#ff0000',
      logoUrl: 'https://r2/evil.webp',
    };

    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ tier: 'STARTER', forceTier: null }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });
    });

    it('strips branding fields when tier lacks BRANDING_CUSTOM', async () => {
      mockFeature.hasFeature.mockReturnValue(false);

      await service.update('rest1', brandingDto, 'user1');

      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rest1' },
          data: { name: 'Updated' },
        }),
      );
      const sentData = mockPrisma.restaurant.update.mock.calls[0][0].data;
      expect(sentData).not.toHaveProperty('fontHeading');
      expect(sentData).not.toHaveProperty('themeDarkAccentColor');
      expect(sentData).not.toHaveProperty('logoUrl');
    });

    it('keeps branding fields when tier has BRANDING_CUSTOM', async () => {
      mockFeature.hasFeature.mockReturnValue(true);

      await service.update('rest1', brandingDto, 'user1');

      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rest1' },
          data: brandingDto,
        }),
      );
    });

    it('resolves the effective (forced) tier before checking the feature', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ tier: 'FREE', forceTier: 'PROFESSIONAL' }),
      );
      mockFeature.hasFeature.mockReturnValue(true);

      await service.update('rest1', brandingDto, 'user1');

      expect(mockFeature.getEffectiveTier).toHaveBeenCalledWith(
        'FREE',
        'PROFESSIONAL',
      );
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes restaurant instead of cascading financial history', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(makeRestaurant());
      const deleted = makeRestaurant({
        isActive: false,
        deletedAt: new Date(),
      });
      mockPrisma.restaurant.update.mockResolvedValue(deleted);

      const result = await service.remove('rest1', 'user1');

      expect(mockPrisma.restaurant.delete).not.toHaveBeenCalled();
      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rest1' },
          data: expect.objectContaining({
            isActive: false,
            deletedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockDeviceEnrollment.evictRestaurantDevices).toHaveBeenCalledWith(
        'rest1',
      );
      expect(result).toMatchObject({ id: 'rest1', isActive: false });
    });

    it('throws ForbiddenException when not owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'other' }),
      );
      await expect(service.remove('rest1', 'user1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when restaurant is already soft-deleted', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ deletedAt: new Date(), isActive: false }),
      );

      await expect(service.remove('rest1', 'user1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.restaurant.update).not.toHaveBeenCalled();
    });
  });

  // ─── updateLogo ──────────────────────────────────────────────────────────────

  describe('updateLogo', () => {
    it('updates logoUrl and logoThumbnailUrl', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(makeRestaurant());
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });

      await service.updateLogo(
        'rest1',
        'https://r2/logo.webp',
        'https://r2/logo_thumb.webp',
        'user1',
      );

      expect(mockPrisma.restaurant.update).toHaveBeenCalledWith({
        where: { id: 'rest1' },
        data: {
          logoUrl: 'https://r2/logo.webp',
          logoThumbnailUrl: 'https://r2/logo_thumb.webp',
        },
      });
    });

    it('throws ForbiddenException when not owner or manager', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'other' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'WAITER',
      });

      await expect(
        service.updateLogo('rest1', 'url', 'thumb', 'waiter1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── translateAll ────────────────────────────────────────────────────────────

  describe('enqueueTranslateAll', () => {
    const restaurant = makeRestaurant({ targetLanguages: ['en', 'ro'] });

    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });
    });

    it('returns an idempotent completed result when targetLanguages is empty', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ targetLanguages: [] }),
      );

      const result = await service.enqueueTranslateAll('rest1', 'user1');

      expect(result).toMatchObject({
        success: true,
        runId: null,
        done: 0,
        total: 0,
        status: 'COMPLETED',
      });
      expect(mockTranslationEnqueue.enqueueCategory).not.toHaveBeenCalled();
    });

    it('returns completed when the only configured target is the menu source', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({
          menuSourceLanguage: 'bg',
          targetLanguages: ['BG', ' bg '],
        }),
      );

      const result = await service.enqueueTranslateAll('rest1', 'user1');

      expect(result).toMatchObject({
        success: true,
        runId: null,
        total: 0,
        status: 'COMPLETED',
      });
      expect(mockTranslationEnqueue.enqueueCategory).not.toHaveBeenCalled();
    });

    it('returns a clear error without creating a run when translation is unavailable', async () => {
      mockTranslationWorker.isAvailable.mockReturnValue(false);

      const result = await service.enqueueTranslateAll('rest1', 'user1');

      expect(result).toMatchObject({
        success: false,
        runId: null,
        status: 'FAILED',
      });
      expect(result.message).toContain('disabled or not configured');
      expect(mockTranslationEnqueue.enqueueCategory).not.toHaveBeenCalled();
      expect(mockPrisma.translationRun.create).not.toHaveBeenCalled();
      expect(mockTranslationWorker.kick).not.toHaveBeenCalled();
    });

    it('does not create another run while the latest persisted run is active', async () => {
      mockTranslationWorker.getRestaurantProgress.mockResolvedValue({
        done: 2,
        total: 10,
        pending: 8,
        failed: 0,
        current: 2,
        active: true,
        status: 'RUNNING',
        runId: 'run-active',
      });

      const result = await service.enqueueTranslateAll('rest1', 'user1');

      expect(result).toMatchObject({
        success: true,
        runId: 'run-active',
        status: 'RUNNING',
      });
      expect(mockPrisma.translationRun.create).not.toHaveBeenCalled();
      expect(mockTranslationEnqueue.enqueueCategory).not.toHaveBeenCalled();
    });

    it('returns error and enqueues nothing when the quota check denies the request', async () => {
      mockTranslationQuota.assertCanSpend.mockResolvedValue({
        allowed: false,
        reason: 'platform_quota_exceeded',
        remaining: 0,
      });

      const result = await service.enqueueTranslateAll('rest1', 'user1');

      // Same envelope as every other early exit — the dashboard reads
      // runId/done/total/status off this response without a shape check.
      expect(result).toMatchObject({
        success: false,
        runId: null,
        done: 0,
        total: 0,
        status: 'FAILED',
      });
      expect(result.message).toContain('quota');
      expect(mockPrisma.translationRun.create).not.toHaveBeenCalled();
      expect(mockTranslationEnqueue.enqueueCategory).not.toHaveBeenCalled();
      expect(mockTranslationEnqueue.enqueueItem).not.toHaveBeenCalled();
      expect(mockTranslationEnqueue.enqueueOption).not.toHaveBeenCalled();
      expect(mockTranslationWorker.kick).not.toHaveBeenCalled();
    });

    it('enqueues every category, item, and option, creates a run, and kicks the worker', async () => {
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        { id: 'cat1', name: 'Starters' },
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item1',
          name: 'Soup',
          description: 'Hot soup',
          allergens: [],
          dietaryTags: [],
        },
      ]);
      mockPrisma.menuOption.findMany.mockResolvedValue([
        {
          id: 'opt1',
          name: 'Size',
          choices: [{ name: 'Large', priceModifier: 1 }],
          translations: { en: { name: 'Size' } },
        },
      ]);

      const result = await service.enqueueTranslateAll('rest1', 'user1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 categories');
      expect(result.message).toContain('1 items');
      expect(result.message).toContain('1 options');
      expect(mockTranslationEnqueue.enqueueCategory).toHaveBeenCalledWith(
        'rest1',
        { id: 'cat1', name: 'Starters' },
        ['en', 'ro'],
        'bg',
        'run-1',
      );
      expect(mockTranslationEnqueue.enqueueItem).toHaveBeenCalledWith(
        'rest1',
        expect.objectContaining({ id: 'item1', name: 'Soup' }),
        ['en', 'ro'],
        'bg',
        'run-1',
      );
      expect(mockTranslationEnqueue.enqueueOption).toHaveBeenCalledWith(
        'rest1',
        expect.objectContaining({
          id: 'opt1',
          name: 'Size',
          translations: { en: { name: 'Size' } },
        }),
        ['en', 'ro'],
        'bg',
        'run-1',
      );
      expect(mockPrisma.translationRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            restaurantId: 'rest1',
            requestedById: 'user1',
            status: 'QUEUED',
            locales: ['en', 'ro'],
          }),
        }),
      );
      expect(mockPrisma.translationRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'RUNNING',
          totalUnits: 1,
          doneUnits: 0,
        }),
      });
      expect(mockPrisma.menuTranslationState.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { runId: 'run-1' } }),
      );
      expect(mockTranslationWorker.kick).toHaveBeenCalledTimes(1);
      expect(result.runId).toBe('run-1');
    });

    it('does not claim everything is current while values are parked for manual review', async () => {
      // NEEDS_REVIEW rows are terminal, not queued, so they are detached from
      // the run and never reach totalUnits. Reporting "already current" while
      // the status badge shows failures is the owner-facing contradiction.
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'CURRENT', _count: { _all: 12 } },
      ]);
      mockPrisma.menuTranslationState.count.mockResolvedValue(2);

      const result = await service.enqueueTranslateAll('rest1', 'user1');

      expect(mockPrisma.menuTranslationState.count).toHaveBeenCalledWith({
        where: {
          restaurantId: 'rest1',
          locale: { in: ['en', 'ro'] },
          status: 'NEEDS_REVIEW',
        },
      });
      expect(result).toMatchObject({
        success: true,
        runId: null,
        total: 0,
        status: 'COMPLETED',
        // Machine-readable, because the dashboard renders its own localized
        // copy — a prose-only message is dropped on this code path.
        needsReview: 2,
      });
      expect(result.message).toContain('2');
      expect(result.message).toMatch(/review/i);
      expect(result.message).not.toContain('already current');
    });

    it('still reports everything current when nothing is queued and nothing needs review', async () => {
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'CURRENT', _count: { _all: 12 } },
      ]);
      mockPrisma.menuTranslationState.count.mockResolvedValue(0);

      const result = await service.enqueueTranslateAll('rest1', 'user1');

      expect(result.message).toContain('already current');
      expect(result).toMatchObject({
        status: 'COMPLETED',
        total: 0,
        needsReview: 0,
      });
    });

    it('returns the atomically winning active run when two Translate All requests race', async () => {
      mockPrisma.translationRun.create.mockRejectedValueOnce({ code: 'P2002' });
      mockPrisma.translationRun.findFirst.mockResolvedValueOnce({
        id: 'run-winner',
        status: 'QUEUED',
        totalUnits: 0,
      });

      const result = await service.enqueueTranslateAll('rest1', 'user1');

      expect(result).toMatchObject({
        success: true,
        runId: 'run-winner',
        status: 'RUNNING',
      });
      expect(mockTranslationEnqueue.enqueueBatch).not.toHaveBeenCalled();
      expect(mockTranslationWorker.kick).not.toHaveBeenCalled();
    });

    it('emits a queued translate:progress event with the run id', async () => {
      await service.enqueueTranslateAll('rest1', 'user1');

      expect(mockEvents.emitToRestaurant).toHaveBeenCalledWith(
        'rest1',
        'translate:progress',
        expect.objectContaining({ status: 'RUNNING', runId: 'run-1' }),
      );
    });

    it('throws ForbiddenException when not owner or manager', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'other' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'WAITER',
      });

      await expect(
        service.enqueueTranslateAll('rest1', 'waiter1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getTranslationStatus', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(makeRestaurant());
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });
    });

    it('aggregates STALE+PENDING into "pending" and reports active=true when work is outstanding', async () => {
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'STALE', _count: { _all: 3 } },
        { status: 'PENDING', _count: { _all: 2 } },
        { status: 'FAILED', _count: { _all: 1 } },
        { status: 'CURRENT', _count: { _all: 40 } },
      ]);
      mockPrisma.translationRun.findFirst.mockResolvedValue({
        id: 'run-1',
        status: 'RUNNING',
        createdAt: new Date(),
      });
      mockTranslationWorker.getRestaurantProgress.mockResolvedValue({
        done: 34,
        total: 40,
        pending: 5,
        failed: 1,
        current: 40,
        active: true,
        status: 'RUNNING',
        runId: 'run-1',
      });

      const result = await service.getTranslationStatus('rest1', 'user1');

      expect(result).toMatchObject({
        pending: 5,
        failed: 1,
        current: 40,
        active: true,
        latestRunId: 'run-1',
        latestRunStatus: 'RUNNING',
      });
    });

    it('reports NEEDS_REVIEW as failed instead of hiding terminal translation issues', async () => {
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'NEEDS_REVIEW', _count: { _all: 2 } },
        { status: 'CURRENT', _count: { _all: 40 } },
      ]);

      const result = await service.getTranslationStatus('rest1', 'user1');

      expect(result.failed).toBe(2);
    });

    it('reports active=false and null run info when there is no outstanding work or run history', async () => {
      mockPrisma.menuTranslationState.groupBy.mockResolvedValue([
        { status: 'CURRENT', _count: { _all: 10 } },
      ]);
      mockPrisma.translationRun.findFirst.mockResolvedValue(null);

      const result = await service.getTranslationStatus('rest1', 'user1');

      expect(result).toMatchObject({
        pending: 0,
        failed: 0,
        active: false,
        latestRunId: null,
        latestRunStatus: null,
      });
    });

    it('throws ForbiddenException when not owner or manager', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'other' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'WAITER',
      });

      await expect(
        service.getTranslationStatus('rest1', 'waiter1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getLogoBase64', () => {
    beforeEach(() => {
      // L4: getLogoBase64 now verifies owner/manager access first. These tests
      // exercise the SSRF hardening, not authz, so stub the ownership check.
      jest
        .spyOn(service, 'findOneForManagement')
        .mockResolvedValue({ id: 'rest1' } as any);
    });

    afterEach(() => {
      jest.restoreAllMocks();
      (http.request as jest.Mock).mockReset();
      (https.request as jest.Mock).mockReset();
    });

    it('returns null if logoUrl is a literal internal IP (SSRF prevention)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        logoUrl: 'http://169.254.169.254/latest/meta-data/',
      });
      const lookupSpy = jest
        .spyOn(dns.promises, 'lookup')
        .mockResolvedValue({ address: '169.254.169.254', family: 4 });

      const result = await service.getLogoBase64('rest1', 'owner1');

      expect(result).toBeNull();
      expect(lookupSpy).toHaveBeenCalledTimes(1);
      // Blocked before any connection is attempted.
      expect(http.request as jest.Mock).not.toHaveBeenCalled();
    });

    it('returns null if logoUrl is localhost (SSRF prevention)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        logoUrl: 'http://localhost:3000/secret',
      });
      const lookupSpy = jest.spyOn(dns.promises, 'lookup');

      const result = await service.getLogoBase64('rest1', 'owner1');

      expect(result).toBeNull();
      // Rejected on the hostname string check, before even resolving DNS.
      expect(lookupSpy).not.toHaveBeenCalled();
    });

    it('rejects an IPv4-mapped IPv6 literal for a cloud-metadata address (bypass check)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        logoUrl: 'http://metadata.example.com/latest/meta-data/',
      });
      jest.spyOn(dns.promises, 'lookup').mockResolvedValue({
        address: '::ffff:169.254.169.254',
        family: 6,
      });

      const result = await service.getLogoBase64('rest1', 'owner1');

      expect(result).toBeNull();
      expect(http.request as jest.Mock).not.toHaveBeenCalled();
    });

    it('rejects hex-form IPv4-mapped IPv6 metadata addresses', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        logoUrl: 'http://metadata.example.com/latest/meta-data/',
      });
      jest.spyOn(dns.promises, 'lookup').mockResolvedValue({
        address: '::ffff:a9fe:a9fe',
        family: 6,
      });

      const result = await service.getLogoBase64('rest1', 'owner1');

      expect(result).toBeNull();
      expect(http.request as jest.Mock).not.toHaveBeenCalled();
    });

    it('rejects the full IPv6 link-local fe80::/10 range, not only fe80::/16', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        logoUrl: 'http://linklocal.example.com/logo.png',
      });
      jest.spyOn(dns.promises, 'lookup').mockResolvedValue({
        address: 'fe90::1',
        family: 6,
      });

      const result = await service.getLogoBase64('rest1', 'owner1');

      expect(result).toBeNull();
      expect(http.request as jest.Mock).not.toHaveBeenCalled();
    });

    it('rejects expanded IPv6 loopback addresses', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        logoUrl: 'http://loopback.example.com/logo.png',
      });
      jest.spyOn(dns.promises, 'lookup').mockResolvedValue({
        address: '0:0:0:0:0:0:0:1',
        family: 6,
      });

      const result = await service.getLogoBase64('rest1', 'owner1');

      expect(result).toBeNull();
      expect(http.request as jest.Mock).not.toHaveBeenCalled();
    });

    it('fetches and returns base64 if URL is valid', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        logoUrl: 'https://example.com/logo.png',
      });
      jest
        .spyOn(dns.promises, 'lookup')
        .mockResolvedValue({ address: '93.184.216.34', family: 4 });
      const { options } = mockPinnedHttpResponse({
        contentType: 'image/png',
        body: Buffer.from('logo-bytes'),
      });

      const result = await service.getLogoBase64('rest1', 'owner1');

      expect(result).toEqual({
        dataUrl: expect.stringContaining('data:image/png;base64,'),
      });
      expect(
        Buffer.from(result!.dataUrl.split(',')[1], 'base64').toString(),
      ).toBe('logo-bytes');
      // Connects to the resolved IP directly, not the hostname — this is what
      // actually pins the request against DNS rebinding.
      expect(options().host).toBe('93.184.216.34');
      expect(options().headers.Host).toBe('example.com');
      expect(options().servername).toBe('example.com');
    });

    it('never re-resolves DNS between validation and the actual request (no rebinding window)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        logoUrl: 'https://example.com/logo.png',
      });
      const lookupSpy = jest
        .spyOn(dns.promises, 'lookup')
        .mockResolvedValue({ address: '93.184.216.34', family: 4 });
      mockPinnedHttpResponse({ contentType: 'image/png' });

      await service.getLogoBase64('rest1', 'owner1');

      expect(lookupSpy).toHaveBeenCalledTimes(1);
    });

    it('returns null when the response exceeds the size cap', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        logoUrl: 'https://example.com/logo.png',
      });
      jest
        .spyOn(dns.promises, 'lookup')
        .mockResolvedValue({ address: '93.184.216.34', family: 4 });
      mockPinnedHttpResponse({
        contentType: 'image/png',
        body: Buffer.alloc(6 * 1024 * 1024), // over the 5MB cap
      });

      const result = await service.getLogoBase64('rest1', 'owner1');

      expect(result).toBeNull();
    });

    it('returns null on a non-2xx response', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        logoUrl: 'https://example.com/logo.png',
      });
      jest
        .spyOn(dns.promises, 'lookup')
        .mockResolvedValue({ address: '93.184.216.34', family: 4 });
      mockPinnedHttpResponse({ statusCode: 404 });

      const result = await service.getLogoBase64('rest1', 'owner1');

      expect(result).toBeNull();
    });
  });
});
