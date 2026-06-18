import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RestaurantsService } from './restaurants.service';

const makeRestaurant = (overrides: Record<string, unknown> = {}) => ({
  id: 'rest1',
  ownerId: 'user1',
  name: 'Test Restaurant',
  stripeAccountId: null,
  stripeOnboarded: false,
  targetLanguages: [] as string[],
  ...overrides,
});

describe('RestaurantsService', () => {
  let service: RestaurantsService;
  let mockPrisma: any;
  let mockTranslation: any;
  let mockStripe: any;
  let mockFeature: any;
  let mockDeviceEnrollment: any;

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
    };

    mockTranslation = {
      translateObject: jest.fn().mockResolvedValue({}),
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
      restaurantHasFeature: jest.fn(function (this: any, r: any, f: any) {
        return this.hasFeature(
          this.getEffectiveTier(r?.tier ?? 'FREE', r?.forceTier ?? null),
          f,
        );
      }),
    };

    mockDeviceEnrollment = {
      revokeRestaurantDevices: jest.fn().mockResolvedValue({ success: true, count: 0 }),
      evictRestaurantDevices: jest.fn().mockResolvedValue({ success: true, count: 0 }),
    };

    service = new RestaurantsService(
      mockPrisma,
      mockTranslation,
      mockStripe,
      mockFeature,
      mockDeviceEnrollment,
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
          where: { ownerId: 'user1' },
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
          where: { id: 'rest1' },
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

      await expect(
        service.update('rest1', {} as any, 'waiter1'),
      ).rejects.toThrow(ForbiddenException);
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
        { sharedDeviceModeEnabled: false } as any,
        'user1',
      );

      expect(mockDeviceEnrollment.evictRestaurantDevices).toHaveBeenCalledWith('rest1');
      expect(mockDeviceEnrollment.revokeRestaurantDevices).not.toHaveBeenCalled();
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
    it('calls findOne then deletes restaurant', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(makeRestaurant());
      const deleted = makeRestaurant();
      mockPrisma.restaurant.delete.mockResolvedValue(deleted);

      const result = await service.remove('rest1', 'user1');

      expect(mockPrisma.restaurant.delete).toHaveBeenCalledWith({
        where: { id: 'rest1' },
      });
      expect(result).toBe(deleted);
    });

    it('throws ForbiddenException when not owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'other' }),
      );
      await expect(service.remove('rest1', 'user1')).rejects.toThrow(
        ForbiddenException,
      );
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

  describe('translateAll', () => {
    const restaurant = makeRestaurant({ targetLanguages: ['en', 'ro'] });

    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(restaurant);
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'OWNER',
      });
      // Prevent real 300ms delays in loops
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        if (typeof fn === 'function') fn();
        return 0 as any;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('returns error when DEEPL_API_KEY is not set', async () => {
      const prev = process.env.DEEPL_API_KEY;
      delete process.env.DEEPL_API_KEY;

      const result = await service.translateAll('rest1', 'user1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not configured');

      if (prev !== undefined) process.env.DEEPL_API_KEY = prev;
    });

    it('returns error when targetLanguages is empty', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ targetLanguages: [] }),
      );
      const prev = process.env.DEEPL_API_KEY;
      process.env.DEEPL_API_KEY = 'test-key';

      const result = await service.translateAll('rest1', 'user1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No target languages');

      process.env.DEEPL_API_KEY = prev ?? '';
      if (prev === undefined) delete process.env.DEEPL_API_KEY;
    });

    it('translates categories, items, and options and returns success', async () => {
      const prev = process.env.DEEPL_API_KEY;
      process.env.DEEPL_API_KEY = 'test-key';

      mockPrisma.menuCategory.findMany.mockResolvedValue([
        { id: 'cat1', name: 'Starters', translations: {} },
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item1',
          name: 'Soup',
          description: 'Hot soup',
          allergens: [],
          dietaryTags: [],
          translations: {},
        },
      ]);
      mockPrisma.menuOption.findMany.mockResolvedValue([
        {
          id: 'opt1',
          name: 'Size',
          choices: [{ name: 'Large', priceModifier: 1 }],
          translations: {},
        },
      ]);

      mockTranslation.translateObject.mockResolvedValue({
        en: { name: 'Starters' },
      });

      const result = await service.translateAll('rest1', 'user1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('1 categories');
      expect(result.message).toContain('1 items');
      expect(result.message).toContain('1 options');
      expect(mockPrisma.menuCategory.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.menuItem.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.menuOption.update).toHaveBeenCalledTimes(1);

      process.env.DEEPL_API_KEY = prev ?? '';
      if (prev === undefined) delete process.env.DEEPL_API_KEY;
    });

    it('includes allergens and dietaryTags in item translation payload', async () => {
      const prev = process.env.DEEPL_API_KEY;
      process.env.DEEPL_API_KEY = 'test-key';

      mockPrisma.menuCategory.findMany.mockResolvedValue([]);
      mockPrisma.menuOption.findMany.mockResolvedValue([]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        {
          id: 'item1',
          name: 'Salad',
          description: null,
          allergens: ['Nuts'],
          dietaryTags: ['Vegan'],
          translations: {},
        },
      ]);

      let capturedPayload: Record<string, string> = {};
      mockTranslation.translateObject.mockImplementation(
        (payload: Record<string, string>) => {
          capturedPayload = payload;
          return Promise.resolve({});
        },
      );

      await service.translateAll('rest1', 'user1');

      expect(capturedPayload['allergen_Nuts']).toBe('Nuts');
      expect(capturedPayload['tag_Vegan']).toBe('Vegan');

      process.env.DEEPL_API_KEY = prev ?? '';
      if (prev === undefined) delete process.env.DEEPL_API_KEY;
    });

    it('throws ForbiddenException when not owner or manager', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(
        makeRestaurant({ ownerId: 'other' }),
      );
      mockPrisma.user.findUnique.mockResolvedValue({
        restaurantId: null,
        role: 'WAITER',
      });

      await expect(service.translateAll('rest1', 'waiter1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
