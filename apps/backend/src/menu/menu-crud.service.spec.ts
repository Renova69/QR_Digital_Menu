import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { MenuCrudService } from './menu-crud.service';
import { PrismaService } from '../prisma/prisma.service';
import { MenuTranslationReadService } from './menu-translation-read.service';
import { MenuTranslationEnqueueService } from './menu-translation-enqueue.service';
import { MenuTranslationWorkerService } from './menu-translation-worker.service';
import { FeatureService } from '../subscription/feature.service';
import { StorageService } from '../storage/storage.service';
import { EventsGateway } from '../events/events.gateway';
import { WeatherUpsellService } from './upsell/weather-upsell.service';

const mockPrisma = {
  restaurant: { findUnique: jest.fn() },
  // Non-owner ownership checks now look up the user to allow assigned MANAGERs
  // (#15). Default null в†’ not a manager в†’ ForbiddenException as before.
  user: { findUnique: jest.fn().mockResolvedValue(null) },
  printStation: { findUnique: jest.fn() },
  menuCategory: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  menuItem: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  },
  menuOption: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  menuTranslationState: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  orderItem: { groupBy: jest.fn() },
  $transaction: jest.fn(),
};

const mockMenuTranslationRead = { applyStoredTranslations: jest.fn() };
const mockTranslationEnqueue = {
  enqueueCategory: jest.fn().mockResolvedValue(undefined),
  enqueueItem: jest.fn().mockResolvedValue(undefined),
  enqueueOption: jest.fn().mockResolvedValue(undefined),
};
const mockTranslationWorker = { kick: jest.fn() };
const mockStorage = {
  delete: jest.fn().mockResolvedValue(undefined),
  deleteExact: jest.fn().mockResolvedValue(undefined),
};
const mockEvents = { emitPublicMenuItemAvailability: jest.fn() };
const mockWeatherUpsell = { getContexts: jest.fn() };

// Pre-warm enqueue calls are fire-and-forget (`void enqueueX(...).then(...)`)
// — flush the microtask queue so the assertion runs after they settle.
const flushMicrotasks = () => new Promise((r) => setImmediate(r));

const BASE_RESTAURANT = {
  id: 'rest-1',
  ownerId: 'user-1',
  name: 'Test Restaurant',
  logoUrl: null,
  accentColor: '#FF0000',
  fontHeading: 'Inter',
  fontBody: 'Inter',
  themeBgColor: '#FFFFFF',
  themeTextColor: '#000000',
  themeCardColor: '#F5F5F5',
  targetLanguages: ['en', 'bg'],
  dashboardLanguage: 'en',
  menuSourceLanguage: 'bg',
  city: 'Sofia',
  timezone: 'Europe/Sofia',
  defaultTheme: 'light',
  tier: 'FREE',
  trendingMode: 'OFF',
  loyaltyRedeemRate: 150,
};

const makeCategory = (overrides: object = {}) => ({
  id: 'cat-1',
  restaurantId: 'rest-1',
  name: 'Starters',
  order: 0,
  imageUrl: null,
  thumbnailUrl: null,
  availabilityType: 'ALWAYS',
  startTime: null,
  endTime: null,
  daysOfWeek: [],
  items: [],
  translations: {},
  isDrinkCategory: false,
  ...overrides,
});

const makeItem = (overrides: object = {}) => ({
  id: 'item-1',
  categoryId: 'cat-1',
  name: 'Soup',
  price: 5,
  description: 'Hot soup',
  imageUrl: null,
  thumbnailUrl: null,
  isOutOfStock: false,
  order: 0,
  translations: {},
  allergens: [],
  dietaryTags: [],
  relatedItemIds: [],
  rewardPointsMode: 'OFF',
  rewardPointsPrice: null,
  category: { restaurantId: 'rest-1' },
  options: [],
  ...overrides,
});

describe('MenuCrudService', () => {
  let service: MenuCrudService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuCrudService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: MenuTranslationReadService,
          useValue: mockMenuTranslationRead,
        },
        {
          provide: MenuTranslationEnqueueService,
          useValue: mockTranslationEnqueue,
        },
        {
          provide: MenuTranslationWorkerService,
          useValue: mockTranslationWorker,
        },
        { provide: StorageService, useValue: mockStorage },
        { provide: EventsGateway, useValue: mockEvents },
        { provide: WeatherUpsellService, useValue: mockWeatherUpsell },
        FeatureService,
      ],
    }).compile();

    service = module.get<MenuCrudService>(MenuCrudService);
    jest.clearAllMocks();
    // clearAllMocks wipes call data but NOT implementations вЂ” re-assert the
    // non-manager default so a manager override in one test can't leak forward.
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockMenuTranslationRead.applyStoredTranslations.mockReturnValue(undefined);
    mockTranslationEnqueue.enqueueCategory.mockResolvedValue(undefined);
    mockTranslationEnqueue.enqueueItem.mockResolvedValue(undefined);
    mockTranslationEnqueue.enqueueOption.mockResolvedValue(undefined);
    mockStorage.delete.mockResolvedValue(undefined);
    mockStorage.deleteExact.mockResolvedValue(undefined);
    mockWeatherUpsell.getContexts.mockResolvedValue(new Set());
    mockPrisma.menuTranslationState.findMany.mockResolvedValue([]);
    mockPrisma.$transaction.mockResolvedValue([]);
  });

  // в”Ђв”Ђ getPublicMenu в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  describe('getPublicMenu', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(service.getPublicMenu('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns restaurant and categories', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      const result = await service.getPublicMenu('rest-1');

      expect(result).toHaveProperty('restaurant');
      expect(result.restaurant).toMatchObject({ city: 'Sofia' });
      expect(result).toHaveProperty('categories');
    });

    it('calculates automatic reward prices in the full public menu', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        loyaltyRedeemRate: 100,
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        makeCategory({
          items: [
            makeItem({
              price: 9.9,
              rewardPointsMode: 'AUTO',
              rewardPointsPrice: null,
            }),
          ],
        }),
      ]);

      const result = await service.getPublicMenu('rest-1');

      expect(result.categories[0].items[0].rewardPointsPrice).toBe(990);
      expect(result.restaurant).not.toHaveProperty('loyaltyRedeemRate');
    });

    it('fetches restaurant by restaurantId', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([]);

      await service.getPublicMenu('rest-1');

      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledWith({
        where: { id: 'rest-1' },
        select: expect.any(Object),
      });
    });

    it('filters out HIDDEN categories', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        makeCategory({ availabilityType: 'ALWAYS' }),
        makeCategory({ id: 'cat-2', availabilityType: 'HIDDEN' }),
      ]);

      const result = await service.getPublicMenu('rest-1');

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]?.id).toBe('cat-1');
    });

    it('filters out SCHEDULED category when current day not in daysOfWeek', async () => {
      // Pin to 2026-01-14T10:00Z = Wednesday in Sofia (UTC+2) в†’ weekday 3
      const spy = jest
        .spyOn(DateTime, 'now')
        .mockReturnValue(
          DateTime.fromISO(
            '2026-01-14T10:00:00.000Z',
          ) as unknown as DateTime<true>,
        );
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        makeCategory({ availabilityType: 'ALWAYS' }),
        makeCategory({
          id: 'cat-2',
          availabilityType: 'SCHEDULED',
          daysOfWeek: [1, 2],
          startTime: null,
          endTime: null,
        }),
      ]);

      const result = await service.getPublicMenu('rest-1');

      spy.mockRestore();
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]?.id).toBe('cat-1');
    });

    it('filters out SCHEDULED category when current time outside range', async () => {
      // Pin to 2026-01-14T18:00Z = 20:00 Sofia вЂ” outside 09:00-17:00
      const spy = jest
        .spyOn(DateTime, 'now')
        .mockReturnValue(
          DateTime.fromISO(
            '2026-01-14T18:00:00.000Z',
          ) as unknown as DateTime<true>,
        );
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        makeCategory({ availabilityType: 'ALWAYS' }),
        makeCategory({
          id: 'cat-2',
          availabilityType: 'SCHEDULED',
          daysOfWeek: [],
          startTime: '09:00',
          endTime: '17:00',
        }),
      ]);

      const result = await service.getPublicMenu('rest-1');

      spy.mockRestore();
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0]?.id).toBe('cat-1');
    });

    it('calls applyLazyTranslations when lang in targetLanguages and translation provider enabled', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      }); // targetLanguages: ['en','bg']
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      await service.getPublicMenu('rest-1', 'bg');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledWith(expect.any(Array), 'bg');
    });

    it('translates the full menu into the menu source language without requiring multi-language targets', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        menuSourceLanguage: 'en',
        targetLanguages: ['fr'],
        tier: 'FREE',
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      await service.getPublicMenu('rest-1', 'en');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledWith(expect.any(Array), 'en');
    });

    it('does not call applyLazyTranslations when lang not in targetLanguages', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        targetLanguages: [],
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      await service.getPublicMenu('rest-1', 'ro');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).not.toHaveBeenCalled();
    });
  });

  // в”Ђв”Ђ getPublicMenuMeta в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  describe('getPublicMenuMeta', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(service.getPublicMenuMeta('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns restaurant and category metadata', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      const result = await service.getPublicMenuMeta('rest-1');

      expect(result).toHaveProperty('restaurant');
      expect(result.restaurant).toMatchObject({
        menuSourceLanguage: 'bg',
        city: 'Sofia',
      });
      expect(result).toHaveProperty('categories');
      expect(result.categories).toHaveLength(1);
      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            menuSourceLanguage: true,
            city: true,
          }),
        }),
      );
    });

    it('strips branding fields when effective tier lacks BRANDING_CUSTOM', async () => {
      // BASE_RESTAURANT is FREE вЂ” branding must not render on the public menu
      // even if stale columns persist from a prior paid tier (downgrade).
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([]);

      const { restaurant } = await service.getPublicMenuMeta('rest-1');

      expect(restaurant).not.toHaveProperty('accentColor');
      expect(restaurant).not.toHaveProperty('fontHeading');
      expect(restaurant).not.toHaveProperty('themeBgColor');
      expect(restaurant).not.toHaveProperty('logoUrl');
      // Non-branding fields survive.
      expect(restaurant).toMatchObject({ name: 'Test Restaurant' });
    });

    it('keeps branding fields when effective tier has BRANDING_CUSTOM', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([]);

      const { restaurant } = await service.getPublicMenuMeta('rest-1');

      expect(restaurant).toMatchObject({
        accentColor: '#FF0000',
        fontHeading: 'Inter',
      });
    });

    it('uses the forced tier when deciding branding entitlement', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'FREE',
        forceTier: 'PROFESSIONAL',
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([]);

      const { restaurant } = await service.getPublicMenuMeta('rest-1');

      expect(restaurant).toMatchObject({ accentColor: '#FF0000' });
    });

    it('translates category names when lang is a target language and translation provider is enabled', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      await service.getPublicMenuMeta('rest-1', 'bg');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledWith(expect.any(Array), 'bg');
    });

    it('uses the menu source language by default without requiring multi-language targets', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        menuSourceLanguage: 'en',
        targetLanguages: ['fr'],
        tier: 'FREE',
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      await service.getPublicMenuMeta('rest-1');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledWith(expect.any(Array), 'en');
    });

    it('uses the menu source language when lang is not a target language', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      await service.getPublicMenuMeta('rest-1', 'zz');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledWith(expect.any(Array), 'bg');
    });

    it('matches a requested target language case-insensitively', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      await service.getPublicMenuMeta('rest-1', 'BG');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledWith(expect.any(Array), 'bg');
    });
  });

  // в”Ђв”Ђ getCategoryItems в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  describe('getCategoryItems', () => {
    it('throws NotFoundException when category not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findFirst.mockResolvedValue(null);

      await expect(
        service.getCategoryItems('rest-1', 'missing'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns items for existing category', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findFirst.mockResolvedValue(makeCategory());
      mockPrisma.menuItem.findMany.mockResolvedValue([makeItem()]);

      const result = await service.getCategoryItems('rest-1', 'cat-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('item-1');
    });

    it('translates items into the menu source language without requiring multi-language targets', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        menuSourceLanguage: 'en',
        targetLanguages: ['fr'],
        tier: 'FREE',
      });
      mockPrisma.menuCategory.findFirst.mockResolvedValue(makeCategory());
      mockPrisma.menuItem.findMany.mockResolvedValue([makeItem()]);

      await service.getCategoryItems('rest-1', 'cat-1', 'en');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledWith(expect.any(Array), 'en');
      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({ menuSourceLanguage: true }),
        }),
      );
    });

    it('throws ForbiddenException for a hidden category', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findFirst.mockResolvedValue(
        makeCategory({ availabilityType: 'HIDDEN' }),
      );

      await expect(service.getCategoryItems('rest-1', 'cat-1')).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrisma.menuItem.findMany).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException for a scheduled category outside its availability window', async () => {
      const spy = jest
        .spyOn(DateTime, 'now')
        .mockReturnValue(
          DateTime.fromISO(
            '2026-01-14T18:00:00.000Z',
          ) as unknown as DateTime<true>,
        );

      try {
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          ...BASE_RESTAURANT,
          tier: 'PROFESSIONAL',
        });
        mockPrisma.menuCategory.findFirst.mockResolvedValue(
          makeCategory({
            availabilityType: 'SCHEDULED',
            daysOfWeek: [],
            startTime: '09:00',
            endTime: '17:00',
          }),
        );

        await expect(
          service.getCategoryItems('rest-1', 'cat-1'),
        ).rejects.toThrow(ForbiddenException);
        expect(mockPrisma.menuItem.findMany).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });
  });

  // в”Ђв”Ђ getTrendingItems в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  describe('getPublicMenuItems', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(service.getPublicMenuItems('nope')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when restaurant is suspended', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        isActive: false,
      });

      await expect(service.getPublicMenuItems('rest-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns items keyed by categoryId for every visible category', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        makeCategory({ id: 'cat-1', items: [makeItem({ id: 'item-1' })] }),
        makeCategory({
          id: 'cat-2',
          name: 'Mains',
          items: [makeItem({ id: 'item-2', categoryId: 'cat-2' })],
        }),
      ]);

      const result = await service.getPublicMenuItems('rest-1');

      expect(Object.keys(result)).toEqual(['cat-1', 'cat-2']);
      expect(result['cat-1']).toHaveLength(1);
      expect(result['cat-1'][0].id).toBe('item-1');
      expect(result['cat-2'][0].id).toBe('item-2');
    });

    it('returns the effective automatic reward price from restaurant settings', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        loyaltyRedeemRate: 100,
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        makeCategory({
          items: [
            makeItem({
              price: 9.9,
              rewardPointsMode: 'AUTO',
              rewardPointsPrice: null,
            }),
          ],
        }),
      ]);

      const result = await service.getPublicMenuItems('rest-1');

      expect(result['cat-1'][0].rewardPointsPrice).toBe(990);
    });

    it('omits HIDDEN categories from the map', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        makeCategory({ id: 'cat-1', items: [makeItem()] }),
        makeCategory({
          id: 'cat-2',
          availabilityType: 'HIDDEN',
          items: [makeItem({ id: 'hidden' })],
        }),
      ]);

      const result = await service.getPublicMenuItems('rest-1');

      expect(Object.keys(result)).toEqual(['cat-1']);
    });

    it('only fetches in-stock items', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      await service.getPublicMenuItems('rest-1');

      expect(mockPrisma.menuCategory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            items: expect.objectContaining({
              where: { isOutOfStock: false },
            }),
          }),
        }),
      );
    });

    it('calls applyLazyTranslations once for the whole menu when lang valid and DEEPL key set', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        makeCategory({ items: [makeItem()] }),
      ]);

      await service.getPublicMenuItems('rest-1', 'bg');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledWith(expect.any(Array), 'bg');
    });
  });

  describe('getTrendingItems', () => {
    it('returns [] when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      expect(await service.getTrendingItems('missing')).toEqual([]);
    });

    it('returns [] when trendingMode is OFF', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'OFF',
        id: 'rest-1',
      });

      expect(await service.getTrendingItems('rest-1')).toEqual([]);
    });

    it('returns featured items when trendingMode is MANUAL', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'MANUAL',
        id: 'rest-1',
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuItem.findMany.mockResolvedValue([makeItem()]);

      const result = await service.getTrendingItems('rest-1');

      expect(mockPrisma.menuItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            category: { restaurantId: 'rest-1' },
            isFeatured: true,
            isOutOfStock: false,
          },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('returns ordered items by popularity when trendingMode is AUTO', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'AUTO',
        id: 'rest-1',
        tier: 'PROFESSIONAL',
      });
      mockPrisma.orderItem.groupBy.mockResolvedValue([
        { menuItemId: 'item-2', _sum: { quantity: 10 } },
        { menuItemId: 'item-1', _sum: { quantity: 5 } },
      ]);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { ...makeItem(), id: 'item-2' },
        makeItem(),
      ]);

      const result = await service.getTrendingItems('rest-1');

      // Ordered by groupBy rank: item-2 first
      expect((result[0] as { id: string }).id).toBe('item-2');
    });

    describe('Contextual Upselling Scoring', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('boosts rank of MORNING tagged item during morning hours (09:00)', async () => {
        jest.setSystemTime(new Date('2023-10-10T09:00:00Z')); // A Tuesday at 09:00 AM UTC
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'MANUAL',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
        });

        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', tags: [] },
          { ...makeItem(), id: 'item-2', tags: ['MORNING'] },
          { ...makeItem(), id: 'item-3', tags: [] },
          { ...makeItem(), id: 'item-4', tags: [] },
        ]);

        const result = await service.getTrendingItems('rest-1');

        // item-2 should be boosted and rank above item-1
        expect(result).toHaveLength(4);
        expect((result[0] as { id: string }).id).toBe('item-2');
        expect((result[1] as { id: string }).id).toBe('item-1');
      });

      it('boosts rank of MORNING tagged item during morning hours in America/New_York (09:00 EDT = 13:00 UTC)', async () => {
        jest.setSystemTime(new Date('2023-10-10T13:00:00Z')); // 13:00 UTC is 09:00 EDT
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'MANUAL',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'America/New_York',
        });

        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', tags: [] },
          { ...makeItem(), id: 'item-2', tags: ['MORNING'] },
          { ...makeItem(), id: 'item-3', tags: [] },
          { ...makeItem(), id: 'item-4', tags: [] },
        ]);

        const result = await service.getTrendingItems('rest-1');

        expect(result).toHaveLength(4);
        expect((result[0] as { id: string }).id).toBe('item-2');
        expect((result[1] as { id: string }).id).toBe('item-1');
      });

      it('boosts rank of LUNCH tagged item during lunch hours (13:00)', async () => {
        jest.setSystemTime(new Date('2023-10-10T13:00:00Z')); // A Tuesday at 13:00 UTC
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'MANUAL',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
        });
        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', tags: [] },
          { ...makeItem(), id: 'item-2', tags: ['LUNCH'] },
          { ...makeItem(), id: 'item-3', tags: [] },
          { ...makeItem(), id: 'item-4', tags: [] },
        ]);
        const result = await service.getTrendingItems('rest-1');
        expect(result).toHaveLength(4);
        expect((result[0] as { id: string }).id).toBe('item-2');
      });

      it('boosts rank of EVENING tagged item during evening hours (19:00)', async () => {
        jest.setSystemTime(new Date('2023-10-10T19:00:00Z')); // A Tuesday at 19:00 UTC
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'MANUAL',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
        });
        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', tags: [] },
          { ...makeItem(), id: 'item-2', tags: ['EVENING'] },
          { ...makeItem(), id: 'item-3', tags: [] },
          { ...makeItem(), id: 'item-4', tags: [] },
        ]);
        const result = await service.getTrendingItems('rest-1');
        expect(result).toHaveLength(4);
        expect((result[0] as { id: string }).id).toBe('item-2');
      });

      it('boosts rank of LATE_NIGHT tagged item at 23:00 (late night)', async () => {
        jest.setSystemTime(new Date('2023-10-10T23:00:00Z')); // A Tuesday at 23:00 UTC
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'MANUAL',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
        });
        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', tags: [] },
          { ...makeItem(), id: 'item-2', tags: ['LATE_NIGHT'] },
          { ...makeItem(), id: 'item-3', tags: [] },
          { ...makeItem(), id: 'item-4', tags: [] },
        ]);
        const result = await service.getTrendingItems('rest-1');
        expect(result).toHaveLength(4);
        expect((result[0] as { id: string }).id).toBe('item-2');
      });

      it('boosts rank of LATE_NIGHT tagged item at 01:00 (late night)', async () => {
        jest.setSystemTime(new Date('2023-10-11T01:00:00Z')); // A Wednesday at 01:00 UTC
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'MANUAL',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
        });
        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', tags: [] },
          { ...makeItem(), id: 'item-2', tags: ['LATE_NIGHT'] },
          { ...makeItem(), id: 'item-3', tags: [] },
          { ...makeItem(), id: 'item-4', tags: [] },
        ]);
        const result = await service.getTrendingItems('rest-1');
        expect(result).toHaveLength(4);
        expect((result[0] as { id: string }).id).toBe('item-2');
      });

      it('boosts rank of WEEKEND tagged item on Saturday (12:00)', async () => {
        jest.setSystemTime(new Date('2023-10-14T12:00:00Z')); // A Saturday at 12:00 UTC
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'MANUAL',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
        });
        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', tags: [] },
          { ...makeItem(), id: 'item-2', tags: ['WEEKEND'] },
          { ...makeItem(), id: 'item-3', tags: [] },
          { ...makeItem(), id: 'item-4', tags: [] },
        ]);
        const result = await service.getTrendingItems('rest-1');
        expect(result).toHaveLength(4);
        expect((result[0] as { id: string }).id).toBe('item-2');
      });

      it('combines multiple active contexts within the bounded boost', async () => {
        jest.setSystemTime(new Date('2023-10-14T12:00:00Z')); // Saturday lunch: LUNCH + WEEKEND
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'MANUAL',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
        });
        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', tags: [] },
          { ...makeItem(), id: 'item-2', tags: [] },
          { ...makeItem(), id: 'item-3', tags: ['LUNCH', 'WEEKEND'] },
          { ...makeItem(), id: 'item-4', tags: [] },
        ]);

        const result = await service.getTrendingItems('rest-1');

        expect(result.map((item) => (item as { id: string }).id)).toEqual([
          'item-3',
          'item-1',
          'item-2',
          'item-4',
        ]);
      });

      it('boosts rank of MORNING tagged item in AUTO mode during morning hours', async () => {
        jest.setSystemTime(new Date('2023-10-10T09:00:00Z')); // A Tuesday at 09:00 AM UTC
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'AUTO',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
        });

        mockPrisma.orderItem.groupBy.mockResolvedValue([
          { menuItemId: 'item-1', _sum: { quantity: 10 } },
          { menuItemId: 'item-2', _sum: { quantity: 5 } },
          { menuItemId: 'item-3', _sum: { quantity: 1 } },
          { menuItemId: 'item-4', _sum: { quantity: 1 } },
        ]);

        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', tags: [] },
          { ...makeItem(), id: 'item-2', tags: ['MORNING'] },
          { ...makeItem(), id: 'item-3', tags: [] },
          { ...makeItem(), id: 'item-4', tags: [] },
        ]);

        const result = await service.getTrendingItems('rest-1');

        // item-2 should be boosted and rank above item-1 despite lower order quantity
        expect(result).toHaveLength(4);
        expect((result[0] as { id: string }).id).toBe('item-2');
        expect((result[1] as { id: string }).id).toBe('item-1');
      });

      it('does not reuse AUTO cache entries across active-context changes inside the TTL', async () => {
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'AUTO',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
        });
        mockPrisma.orderItem.groupBy.mockResolvedValue([
          { menuItemId: 'item-1', _sum: { quantity: 10 } },
        ]);
        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', tags: [] },
        ]);

        jest.setSystemTime(new Date('2023-10-10T10:59:00Z'));
        await service.getTrendingItems('rest-1');

        jest.setSystemTime(new Date('2023-10-10T11:00:00Z'));
        await service.getTrendingItems('rest-1');

        expect(mockPrisma.orderItem.groupBy).toHaveBeenCalledTimes(2);
      });

      it('combines weather with time context when ranking items', async () => {
        jest.setSystemTime(new Date('2026-01-13T09:00:00Z'));
        mockWeatherUpsell.getContexts.mockResolvedValue(new Set(['COLD']));
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'MANUAL',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
          city: 'Sofia',
          country: 'Bulgaria',
        });
        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', upsellContexts: [] },
          { ...makeItem(), id: 'item-2', upsellContexts: [] },
          {
            ...makeItem(),
            id: 'item-3',
            upsellContexts: ['MORNING', 'COLD'],
          },
          { ...makeItem(), id: 'item-4', upsellContexts: [] },
        ]);

        const result = await service.getTrendingItems('rest-1');

        expect(mockWeatherUpsell.getContexts).toHaveBeenCalledWith({
          city: 'Sofia',
          country: 'Bulgaria',
          timezone: 'UTC',
        });
        expect((result[0] as { id: string }).id).toBe('item-3');
      });

      it('keeps serving time-based recommendations when weather lookup rejects', async () => {
        jest.setSystemTime(new Date('2026-01-13T09:00:00Z'));
        mockWeatherUpsell.getContexts.mockRejectedValue(
          new Error('provider unavailable'),
        );
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'MANUAL',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
          city: 'Sofia',
          country: 'Bulgaria',
        });
        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', upsellContexts: [] },
          {
            ...makeItem(),
            id: 'item-2',
            upsellContexts: ['MORNING'],
          },
        ]);

        await expect(service.getTrendingItems('rest-1')).resolves.toEqual([
          expect.objectContaining({ id: 'item-2' }),
          expect.objectContaining({ id: 'item-1' }),
        ]);
      });

      it('does not reuse AUTO cache entries across weather-context changes', async () => {
        mockWeatherUpsell.getContexts
          .mockResolvedValueOnce(new Set(['COLD']))
          .mockResolvedValueOnce(new Set(['HOT']));
        mockPrisma.restaurant.findUnique.mockResolvedValue({
          trendingMode: 'AUTO',
          id: 'rest-1',
          tier: 'PROFESSIONAL',
          timezone: 'UTC',
          city: 'Sofia',
          country: 'Bulgaria',
        });
        mockPrisma.orderItem.groupBy.mockResolvedValue([
          { menuItemId: 'item-1', _sum: { quantity: 10 } },
        ]);
        mockPrisma.menuItem.findMany.mockResolvedValue([
          { ...makeItem(), id: 'item-1', upsellContexts: [] },
        ]);

        await service.getTrendingItems('rest-1');
        await service.getTrendingItems('rest-1');

        expect(mockPrisma.orderItem.groupBy).toHaveBeenCalledTimes(2);
      });
    });

    it('returns [] in AUTO mode when no orders exist', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'AUTO',
        id: 'rest-1',
        tier: 'PROFESSIONAL',
      });
      mockPrisma.orderItem.groupBy.mockResolvedValue([]);

      expect(await service.getTrendingItems('rest-1')).toEqual([]);
    });

    it('deduplicates concurrent AUTO cache misses for the same context key', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'AUTO',
        id: 'rest-1',
        tier: 'PROFESSIONAL',
        timezone: 'UTC',
      });
      let resolveGroupBy:
        | ((
            value: Array<{ menuItemId: string; _sum: { quantity: number } }>,
          ) => void)
        | undefined;
      mockPrisma.orderItem.groupBy.mockReturnValue(
        new Promise((resolve) => {
          resolveGroupBy = resolve;
        }),
      );
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { ...makeItem(), id: 'item-1', tags: [] },
      ]);

      const first = service.getTrendingItems('rest-1');
      const second = service.getTrendingItems('rest-1');
      resolveGroupBy!([{ menuItemId: 'item-1', _sum: { quantity: 10 } }]);

      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(mockPrisma.orderItem.groupBy).toHaveBeenCalledTimes(1);
      expect(firstResult).toBe(secondResult);
      expect((firstResult[0] as { id: string }).id).toBe('item-1');
    });

    it('uses forceTier when deciding if trending is available', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'MANUAL',
        id: 'rest-1',
        tier: 'FREE',
        forceTier: 'PROFESSIONAL',
      });
      mockPrisma.menuItem.findMany.mockResolvedValue([makeItem()]);

      const result = await service.getTrendingItems('rest-1');

      expect(mockPrisma.menuItem.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('translates trending item names when lang is a target language and translation provider is enabled', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'MANUAL',
        id: 'rest-1',
        tier: 'PROFESSIONAL',
        forceTier: null,
        targetLanguages: ['en', 'bg'],
      });
      mockPrisma.menuItem.findMany.mockResolvedValue([makeItem()]);

      await service.getTrendingItems('rest-1', 'bg');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledWith(expect.any(Array), 'bg');
    });

    it('translates trending items into the menu source language when it is not a target language', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'MANUAL',
        id: 'rest-1',
        tier: 'PROFESSIONAL',
        forceTier: null,
        menuSourceLanguage: 'ro',
        targetLanguages: ['fr'],
      });
      mockPrisma.menuItem.findMany.mockResolvedValue([makeItem()]);

      await service.getTrendingItems('rest-1', 'ro');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).toHaveBeenCalledWith(expect.any(Array), 'ro');
    });

    it('does not translate trending items when lang is not a target language', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'MANUAL',
        id: 'rest-1',
        tier: 'PROFESSIONAL',
        forceTier: null,
        targetLanguages: ['en', 'bg'],
      });
      mockPrisma.menuItem.findMany.mockResolvedValue([makeItem()]);

      await service.getTrendingItems('rest-1', 'zz');

      expect(
        mockMenuTranslationRead.applyStoredTranslations,
      ).not.toHaveBeenCalled();
    });
  });

  // в”Ђв”Ђ Category CRUD в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  describe('createCategory', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(
        service.createCategory(
          'missing',
          { name: 'Drinks' } as Parameters<typeof service.createCategory>[1],
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when not restaurant owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      await expect(
        service.createCategory(
          'rest-1',
          { name: 'Drinks' } as Parameters<typeof service.createCategory>[1],
          'other-user',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for a soft-deleted/suspended restaurant, even for its own owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        isActive: false,
        deletedAt: new Date(),
      });

      await expect(
        service.createCategory(
          'rest-1',
          { name: 'Drinks' } as Parameters<typeof service.createCategory>[1],
          'user-1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.menuCategory.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when deletedAt is set even if isActive was not cleared', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        isActive: true,
        deletedAt: new Date(),
      });

      await expect(
        service.createCategory(
          'rest-1',
          { name: 'Drinks' } as Parameters<typeof service.createCategory>[1],
          'user-1',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.menuCategory.create).not.toHaveBeenCalled();
    });

    it('creates and returns category', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.count.mockResolvedValue(2);
      mockPrisma.menuCategory.create.mockResolvedValue(
        makeCategory({ order: 2 }),
      );

      const result = await service.createCategory(
        'rest-1',
        { name: 'Starters' },
        'user-1',
      );

      expect(mockPrisma.menuCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ restaurantId: 'rest-1', order: 2 }),
        }),
      );
      expect(result.id).toBe('cat-1');
    });

    it('allows an assigned MANAGER to create a category (#15)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.user.findUnique.mockResolvedValue({
        role: 'MANAGER',
        restaurantId: 'rest-1',
      });
      mockPrisma.menuCategory.count.mockResolvedValue(0);
      mockPrisma.menuCategory.create.mockResolvedValue(
        makeCategory({ order: 0 }),
      );

      const result = await service.createCategory(
        'rest-1',
        { name: 'Starters' },
        'manager-1',
      );

      expect(result.id).toBe('cat-1');
      expect(mockPrisma.menuCategory.create).toHaveBeenCalled();
    });

    it('throws BadRequestException if print station belongs to another restaurant (IDOR)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'ENTERPRISE',
      });
      mockPrisma.printStation.findUnique.mockResolvedValue({
        id: 'station-1',
        restaurantId: 'other-rest-id',
      });

      await expect(
        service.createCategory(
          'rest-1',
          { name: 'Drinks', printStationId: 'station-1' } as Parameters<
            typeof service.createCategory
          >[1],
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects printer assignment when the plan lacks thermal printers', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });

      await expect(
        service.createCategory(
          'rest-1',
          { name: 'Drinks', printStationId: 'station-1' } as Parameters<
            typeof service.createCategory
          >[1],
          'user-1',
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FEATURE_LOCKED' }),
      });
      expect(mockPrisma.printStation.findUnique).not.toHaveBeenCalled();
    });

    it('enqueues translation work and kicks the worker when the tier has multi-language + target languages configured', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuCategory.count.mockResolvedValue(0);
      const created = makeCategory({ order: 0 });
      mockPrisma.menuCategory.create.mockResolvedValue(created);

      await service.createCategory('rest-1', { name: 'Starters' }, 'user-1');
      await flushMicrotasks();

      expect(mockTranslationEnqueue.enqueueCategory).toHaveBeenCalledWith(
        'rest-1',
        created,
        ['en', 'bg'],
        'bg',
      );
      expect(mockTranslationWorker.kick).toHaveBeenCalledTimes(1);
    });

    it('does not enqueue translation work when the tier lacks multi-language (FREE)', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT); // FREE
      mockPrisma.menuCategory.count.mockResolvedValue(0);
      mockPrisma.menuCategory.create.mockResolvedValue(makeCategory());

      await service.createCategory('rest-1', { name: 'Starters' }, 'user-1');
      await flushMicrotasks();

      expect(mockTranslationEnqueue.enqueueCategory).not.toHaveBeenCalled();
      expect(mockTranslationWorker.kick).not.toHaveBeenCalled();
    });
  });

  describe('findAllCategories', () => {
    it('returns categories for owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      const result = await service.findAllCategories('rest-1', 'user-1');

      expect(result).toHaveLength(1);
    });

    it('throws ForbiddenException for non-owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      await expect(
        service.findAllCategories('rest-1', 'other'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateCategory', () => {
    it('throws NotFoundException when category not found', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCategory(
          'missing',
          { name: 'New' } as Parameters<typeof service.updateCategory>[1],
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when not owner', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(makeCategory());
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      await expect(
        service.updateCategory(
          'cat-1',
          { name: 'New' } as Parameters<typeof service.updateCategory>[1],
          'other',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates and returns category', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(makeCategory());
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.update.mockResolvedValue({
        ...makeCategory(),
        name: 'Updated',
      });

      const result = await service.updateCategory(
        'cat-1',
        { name: 'Updated' },
        'user-1',
      );

      expect(result.name).toBe('Updated');
    });

    it('throws BadRequestException if assigned print station belongs to another restaurant (IDOR)', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(makeCategory());
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'ENTERPRISE',
      });
      mockPrisma.printStation.findUnique.mockResolvedValue({
        id: 'station-1',
        restaurantId: 'another-restaurant',
      });

      await expect(
        service.updateCategory(
          'cat-1',
          { name: 'Updated', printStationId: 'station-1' } as Parameters<
            typeof service.updateCategory
          >[1],
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('enqueues translation work when the name actually changed', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(
        makeCategory({ name: 'Starters' }),
      );
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      const updated = makeCategory({ name: 'Updated' });
      mockPrisma.menuCategory.update.mockResolvedValue(updated);

      await service.updateCategory('cat-1', { name: 'Updated' }, 'user-1');
      await flushMicrotasks();

      expect(mockTranslationEnqueue.enqueueCategory).toHaveBeenCalledWith(
        'rest-1',
        updated,
        ['en', 'bg'],
        'bg',
      );
      expect(mockTranslationWorker.kick).toHaveBeenCalledTimes(1);
    });

    it('does not enqueue translation work when the name is unchanged', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(
        makeCategory({ name: 'Starters' }),
      );
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuCategory.update.mockResolvedValue(
        makeCategory({ name: 'Starters' }),
      );

      await service.updateCategory(
        'cat-1',
        { name: 'Starters', order: 5 } as Parameters<
          typeof service.updateCategory
        >[1],
        'user-1',
      );
      await flushMicrotasks();

      expect(mockTranslationEnqueue.enqueueCategory).not.toHaveBeenCalled();
    });
  });

  describe('updateCategoryOrder', () => {
    it('reorders via transaction and returns success', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        { id: 'cat-1' },
        { id: 'cat-2' },
      ]);
      mockPrisma.menuCategory.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateCategoryOrder(
        'rest-1',
        ['cat-1', 'cat-2'],
        'user-1',
      );

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('removeCategory', () => {
    it('throws NotFoundException when category not found', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(null);

      await expect(service.removeCategory('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('deletes category', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
        imageUrl: null,
        thumbnailUrl: null,
        items: [],
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.delete.mockResolvedValue(makeCategory());

      await service.removeCategory('cat-1', 'user-1');

      expect(mockPrisma.menuCategory.delete).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
      });
    });
  });

  describe('updateCategoryImage', () => {
    it('throws NotFoundException when category not found', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCategoryImage('missing', 'url', 'thumb', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates imageUrl and thumbnailUrl', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
        imageUrl: null,
        thumbnailUrl: null,
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuCategory.update.mockResolvedValue(makeCategory());

      await service.updateCategoryImage('cat-1', 'url', 'thumb', 'user-1');

      expect(mockPrisma.menuCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            imageUrl: 'url',
            thumbnailUrl: 'thumb',
          }),
        }),
      );
    });
  });

  // в”Ђв”Ђ Item CRUD в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  describe('createItem', () => {
    it('throws NotFoundException when category not found', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.createItem(
          'missing',
          { name: 'Soup', price: 5 } as Parameters<
            typeof service.createItem
          >[1],
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when not owner', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      await expect(
        service.createItem(
          'cat-1',
          { name: 'Soup', price: 5 } as Parameters<
            typeof service.createItem
          >[1],
          'other',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('creates item with correct order index', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.count.mockResolvedValue(3);
      mockPrisma.menuItem.create.mockResolvedValue(makeItem({ order: 3 }));

      const result = await service.createItem(
        'cat-1',
        { name: 'Soup', price: 5 } as Parameters<typeof service.createItem>[1],
        'user-1',
      );

      expect(mockPrisma.menuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: 'cat-1', order: 3 }),
        }),
      );
      expect(result.id).toBe('item-1');
    });

    it('treats a legacy manual reward price as CUSTOM', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.count.mockResolvedValue(0);
      mockPrisma.menuItem.create.mockResolvedValue(
        makeItem({ rewardPointsMode: 'CUSTOM', rewardPointsPrice: 500 }),
      );

      await service.createItem(
        'cat-1',
        { name: 'Soup', price: 5, rewardPointsPrice: 500 } as Parameters<
          typeof service.createItem
        >[1],
        'user-1',
      );

      expect(mockPrisma.menuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rewardPointsMode: 'CUSTOM',
            rewardPointsPrice: 500,
          }),
        }),
      );
    });

    it('rejects CUSTOM mode without a custom points price', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      await expect(
        service.createItem(
          'cat-1',
          {
            name: 'Soup',
            price: 5,
            rewardPointsMode: 'CUSTOM',
          } as unknown as Parameters<typeof service.createItem>[1],
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('enqueues translation work and kicks the worker when the tier has multi-language configured', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuItem.count.mockResolvedValue(0);
      const created = makeItem();
      mockPrisma.menuItem.create.mockResolvedValue(created);

      await service.createItem(
        'cat-1',
        { name: 'Soup', price: 5 } as Parameters<typeof service.createItem>[1],
        'user-1',
      );
      await flushMicrotasks();

      expect(mockTranslationEnqueue.enqueueItem).toHaveBeenCalledWith(
        'rest-1',
        created,
        ['en', 'bg'],
        'bg',
      );
      expect(mockTranslationWorker.kick).toHaveBeenCalledTimes(1);
    });
  });

  describe('findAllItemsInCategory', () => {
    it('throws NotFoundException when category not found', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.findAllItemsInCategory('missing', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns items for owner', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.findMany.mockResolvedValue([makeItem()]);

      const result = await service.findAllItemsInCategory('cat-1', 'user-1');

      expect(result).toHaveLength(1);
    });
  });

  describe('updateItem', () => {
    it('throws NotFoundException when item not found', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(null);

      await expect(
        service.updateItem(
          'missing',
          { name: 'New' } as Parameters<typeof service.updateItem>[1],
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates and returns item', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(makeItem());
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.update.mockResolvedValue({
        ...makeItem(),
        name: 'Updated',
      });

      const result = await service.updateItem(
        'item-1',
        { name: 'Updated' },
        'user-1',
      );

      expect(result.name).toBe('Updated');
      expect(mockEvents.emitPublicMenuItemAvailability).not.toHaveBeenCalled();
    });

    it('emits a live availability event when isOutOfStock changes', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(
        makeItem({ isOutOfStock: false }),
      );
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.update.mockResolvedValue(
        makeItem({ isOutOfStock: true }),
      );

      await service.updateItem('item-1', { isOutOfStock: true }, 'user-1');

      expect(mockEvents.emitPublicMenuItemAvailability).toHaveBeenCalledWith(
        'rest-1',
        { itemId: 'item-1', categoryId: 'cat-1', isOutOfStock: true },
      );
    });

    it('does not emit when isOutOfStock is set to its current value', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(
        makeItem({ isOutOfStock: false }),
      );
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.update.mockResolvedValue(
        makeItem({ isOutOfStock: false }),
      );

      await service.updateItem('item-1', { isOutOfStock: false }, 'user-1');

      expect(mockEvents.emitPublicMenuItemAvailability).not.toHaveBeenCalled();
    });

    it('enqueues translation work when the name changed', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(
        makeItem({ name: 'Soup' }),
      );
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      const updated = makeItem({ name: 'Updated Soup' });
      mockPrisma.menuItem.update.mockResolvedValue(updated);

      await service.updateItem('item-1', { name: 'Updated Soup' }, 'user-1');
      await flushMicrotasks();

      expect(mockTranslationEnqueue.enqueueItem).toHaveBeenCalledWith(
        'rest-1',
        updated,
        ['en', 'bg'],
        'bg',
      );
      expect(mockTranslationWorker.kick).toHaveBeenCalledTimes(1);
    });

    it('does not enqueue translation work when neither name nor description changed', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(
        makeItem({ name: 'Soup', description: 'Hot soup' }),
      );
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuItem.update.mockResolvedValue(
        makeItem({ name: 'Soup', description: 'Hot soup' }),
      );

      await service.updateItem('item-1', { isOutOfStock: true }, 'user-1');
      await flushMicrotasks();

      expect(mockTranslationEnqueue.enqueueItem).not.toHaveBeenCalled();
    });

    it('purging stale cached translations never removes a name override', async () => {
      // Regression guard for the MANUAL translation override feature: the
      // stale-cache purge loop below only ever deletes `allergens`,
      // `dietaryTags`, and `description` keys from cached translations —
      // never `name`. That gap is the only reason a MANUAL name override
      // survives an ordinary allergen/tag/description edit. If a future
      // field added to that loop starts touching `name`, this test must
      // fail loudly rather than silently eating an owner's override.
      mockPrisma.menuItem.findUnique.mockResolvedValue(
        makeItem({
          name: 'Джин Beefeater',
          allergens: ['nuts'],
          translations: {
            en: { name: 'Beefeater Gin', allergens: { nuts: 'Nuts' } },
          },
        }),
      );
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.update.mockResolvedValue(makeItem({ allergens: [] }));

      await service.updateItem('item-1', { allergens: [] }, 'user-1');

      const purgeCall = mockPrisma.menuItem.update.mock.calls.find(
        (call: any[]) => call[0]?.data?.translations,
      );
      expect(purgeCall).toBeDefined();
      expect(purgeCall![0].data.translations.en.name).toBe('Beefeater Gin');
      expect(purgeCall![0].data.translations.en).not.toHaveProperty(
        'allergens',
      );
    });

    it('clearing the source description preserves MANUAL descriptions only', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(
        makeItem({
          description: 'London dry gin',
          translations: {
            en: {
              name: 'Beefeater Gin',
              description: 'Owner-authored English description',
            },
            de: {
              name: 'Beefeater Gin DE',
              description: 'Automatically translated description',
            },
          },
        }),
      );
      mockPrisma.menuTranslationState.findMany.mockResolvedValue([
        { locale: 'en' },
      ]);
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.update.mockResolvedValue(
        makeItem({ description: null }),
      );

      await service.updateItem('item-1', { description: '' }, 'user-1');

      const purgeCall = mockPrisma.menuItem.update.mock.calls.find(
        (call: any[]) => call[0]?.data?.translations,
      );
      expect(purgeCall).toBeDefined();
      expect(purgeCall![0].data.translations.en.description).toBe(
        'Owner-authored English description',
      );
      expect(purgeCall![0].data.translations.de).not.toHaveProperty(
        'description',
      );
      expect(mockPrisma.menuTranslationState.findMany).toHaveBeenCalledWith({
        where: {
          entityType: 'ITEM',
          entityId: 'item-1',
          field: 'DESCRIPTION',
          status: 'MANUAL',
        },
        select: { locale: true },
      });
    });
  });

  describe('updateItemImage', () => {
    it('throws NotFoundException when item not found', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(null);

      await expect(
        service.updateItemImage('missing', 'url', 'thumb', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates image fields', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(makeItem());
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.update.mockResolvedValue(makeItem());

      await service.updateItemImage('item-1', 'url', 'thumb', 'user-1');

      expect(mockPrisma.menuItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { imageUrl: 'url', thumbnailUrl: 'thumb' },
        }),
      );
    });
  });

  describe('updateItemOrder', () => {
    it('throws NotFoundException when category not found', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.updateItemOrder('missing', ['item-1'], 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('reorders items via transaction', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue({
        restaurantId: 'rest-1',
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.findMany.mockResolvedValue([{ id: 'item-1' }]);
      mockPrisma.menuItem.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateItemOrder(
        'cat-1',
        ['item-1'],
        'user-1',
      );

      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });
  });

  describe('removeItem', () => {
    it('throws NotFoundException when item not found', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(null);

      await expect(service.removeItem('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('removes itemId from relatedItemIds of other items before deleting', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(makeItem());
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.findMany.mockResolvedValue([
        { id: 'item-2', relatedItemIds: ['item-1', 'item-3'] },
      ]);
      mockPrisma.menuItem.update.mockResolvedValue({});
      mockPrisma.menuItem.delete.mockResolvedValue(makeItem());

      await service.removeItem('item-1', 'user-1');

      expect(mockPrisma.menuItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-2' },
          data: { relatedItemIds: ['item-3'] },
        }),
      );
      expect(mockPrisma.menuItem.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
    });

    it('deletes item directly when no relatedItemIds references exist', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(makeItem());
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.findMany.mockResolvedValue([]);
      mockPrisma.menuItem.delete.mockResolvedValue(makeItem());

      await service.removeItem('item-1', 'user-1');

      expect(mockPrisma.menuItem.update).not.toHaveBeenCalled();
      expect(mockPrisma.menuItem.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
    });
  });

  // в”Ђв”Ђ Option CRUD в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  describe('createMenuOption', () => {
    it('throws NotFoundException when item not found', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(null);

      await expect(
        service.createMenuOption(
          'missing',
          { name: 'Size', choices: '[]' } as Parameters<
            typeof service.createMenuOption
          >[1],
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when choices is not a JSON array', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(makeItem());
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      await expect(
        service.createMenuOption(
          'item-1',
          { name: 'Size', choices: '{"key":"val"}' } as Parameters<
            typeof service.createMenuOption
          >[1],
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when choices is malformed JSON', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(makeItem());
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      await expect(
        service.createMenuOption(
          'item-1',
          { name: 'Size', choices: '[bad json' } as Parameters<
            typeof service.createMenuOption
          >[1],
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates and returns option', async () => {
      const option = {
        id: 'opt-1',
        name: 'Size',
        choices: [],
        menuItemId: 'item-1',
      };
      mockPrisma.menuItem.findUnique.mockResolvedValue(makeItem());
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuOption.create.mockResolvedValue(option);

      const result = await service.createMenuOption(
        'item-1',
        {
          name: 'Size',
          choices: '[{"name":"Small","priceModifier":0}]',
        } as Parameters<typeof service.createMenuOption>[1],
        'user-1',
      );

      expect(mockPrisma.menuOption.create).toHaveBeenCalled();
      expect(result.name).toBe('Size');
    });

    it('enqueues translation work with the parsed choices when the tier has multi-language configured', async () => {
      const option = {
        id: 'opt-1',
        name: 'Size',
        choices: [{ name: 'Small', priceModifier: 0 }],
        menuItemId: 'item-1',
      };
      mockPrisma.menuItem.findUnique.mockResolvedValue(makeItem());
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      mockPrisma.menuOption.create.mockResolvedValue(option);

      await service.createMenuOption(
        'item-1',
        {
          name: 'Size',
          choices: '[{"name":"Small","priceModifier":0}]',
        } as Parameters<typeof service.createMenuOption>[1],
        'user-1',
      );
      await flushMicrotasks();

      expect(mockTranslationEnqueue.enqueueOption).toHaveBeenCalledWith(
        'rest-1',
        {
          id: 'opt-1',
          name: 'Size',
          choices: [{ name: 'Small', priceModifier: 0 }],
        },
        ['en', 'bg'],
        'bg',
      );
      expect(mockTranslationWorker.kick).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateMenuOption', () => {
    it('throws NotFoundException when option not found', async () => {
      mockPrisma.menuOption.findUnique.mockResolvedValue(null);

      await expect(
        service.updateMenuOption(
          'missing',
          { name: 'New' } as Parameters<typeof service.updateMenuOption>[1],
          'user-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when choices is invalid JSON array', async () => {
      mockPrisma.menuOption.findUnique.mockResolvedValue({
        translations: {},
        menuItem: { category: { restaurantId: 'rest-1' } },
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      await expect(
        service.updateMenuOption(
          'opt-1',
          { choices: '"not-array"' } as Parameters<
            typeof service.updateMenuOption
          >[1],
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates option', async () => {
      mockPrisma.menuOption.findUnique.mockResolvedValue({
        translations: {},
        menuItem: { category: { restaurantId: 'rest-1' } },
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuOption.update.mockResolvedValue({
        id: 'opt-1',
        name: 'Updated',
      });

      const result = await service.updateMenuOption(
        'opt-1',
        { name: 'Updated' },
        'user-1',
      );

      expect(result.name).toBe('Updated');
    });

    it('enqueues translation work unconditionally (hash-based dedup handles no-op updates)', async () => {
      mockPrisma.menuOption.findUnique.mockResolvedValue({
        translations: {},
        menuItem: { category: { restaurantId: 'rest-1' } },
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      });
      const updated = {
        id: 'opt-1',
        name: 'Updated',
        choices: [{ name: 'Large', priceModifier: 1 }],
      };
      mockPrisma.menuOption.update.mockResolvedValue(updated);

      await service.updateMenuOption('opt-1', { name: 'Updated' }, 'user-1');
      await flushMicrotasks();

      expect(mockTranslationEnqueue.enqueueOption).toHaveBeenCalledWith(
        'rest-1',
        {
          id: 'opt-1',
          name: 'Updated',
          choices: [{ name: 'Large', priceModifier: 1 }],
        },
        ['en', 'bg'],
        'bg',
      );
      expect(mockTranslationWorker.kick).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeMenuOption', () => {
    it('throws NotFoundException when option not found', async () => {
      mockPrisma.menuOption.findUnique.mockResolvedValue(null);

      await expect(
        service.removeMenuOption('missing', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes option', async () => {
      mockPrisma.menuOption.findUnique.mockResolvedValue({
        menuItem: { category: { restaurantId: 'rest-1' } },
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuOption.delete.mockResolvedValue({ id: 'opt-1' });

      await service.removeMenuOption('opt-1', 'user-1');

      expect(mockPrisma.menuOption.delete).toHaveBeenCalledWith({
        where: { id: 'opt-1' },
      });
    });
  });

  // в”Ђв”Ђ Image cleanup вЂ” shared-URL reference guard в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  describe('shared image URL guard on delete', () => {
    const SHARED = 'https://cdn.example.com/shared.webp';
    const SHARED_THUMB = 'https://cdn.example.com/shared_thumb.webp';

    const arrangeRemoveItem = () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue({
        imageUrl: SHARED,
        thumbnailUrl: SHARED_THUMB,
        category: { restaurantId: 'rest-1' },
      });
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);
      mockPrisma.menuItem.findMany.mockResolvedValue([]);
      mockPrisma.menuItem.delete.mockResolvedValue({ id: 'item-1' });
    };

    it('does NOT delete the R2 object when another row still references it', async () => {
      arrangeRemoveItem();
      mockPrisma.menuItem.count.mockResolvedValue(1); // another item shares it
      mockPrisma.menuCategory.count.mockResolvedValue(0);

      await service.removeItem('item-1', 'user-1');

      expect(mockStorage.deleteExact).not.toHaveBeenCalled();
    });

    it('deletes the R2 object when no other row references it', async () => {
      arrangeRemoveItem();
      mockPrisma.menuItem.count.mockResolvedValue(0);
      mockPrisma.menuCategory.count.mockResolvedValue(0);

      await service.removeItem('item-1', 'user-1');

      expect(mockStorage.deleteExact).toHaveBeenCalledWith(SHARED);
      expect(mockStorage.deleteExact).toHaveBeenCalledWith(SHARED_THUMB);
    });

    it('excludes the row being deleted from the reference check', async () => {
      arrangeRemoveItem();
      mockPrisma.menuItem.count.mockResolvedValue(0);
      mockPrisma.menuCategory.count.mockResolvedValue(0);

      await service.removeItem('item-1', 'user-1');

      expect(mockPrisma.menuItem.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { notIn: ['item-1'] } }),
        }),
      );
    });
  });

  describe('Upsells (Trending Items Feature Flag)', () => {
    it('returns empty array when restaurant lacks UPSELLING feature', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        trendingMode: 'MANUAL',
        tier: 'FREE',
      });
      jest
        .spyOn(service['featureService'], 'restaurantHasFeature')
        .mockReturnValue(false);

      const result = await service.getTrendingItems('rest-1');

      expect(result).toEqual([]);
      expect(mockPrisma.menuItem.findMany).not.toHaveBeenCalled();
    });

    it('returns featured items when restaurant has UPSELLING feature enabled', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        trendingMode: 'MANUAL',
        tier: 'PROFESSIONAL',
      });
      jest
        .spyOn(service['featureService'], 'restaurantHasFeature')
        .mockReturnValue(true);
      mockPrisma.menuItem.findMany.mockResolvedValue([makeItem()]);

      const result = await service.getTrendingItems('rest-1');

      expect(result).toHaveLength(1);
      expect(mockPrisma.menuItem.findMany).toHaveBeenCalled();
    });
  });
});
