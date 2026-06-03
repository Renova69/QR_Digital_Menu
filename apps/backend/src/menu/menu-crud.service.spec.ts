import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { MenuCrudService } from './menu-crud.service';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';
import { MenuTranslationService } from './menu-translation.service';
import { FeatureService } from '../subscription/feature.service';
import { StorageService } from '../storage/storage.service';

const mockPrisma = {
  restaurant: { findUnique: jest.fn() },
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
  orderItem: { groupBy: jest.fn() },
  $transaction: jest.fn(),
};

const mockTranslation = { translateObject: jest.fn() };
const mockMenuTranslation = { applyLazyTranslations: jest.fn() };
const mockStorage = { delete: jest.fn().mockResolvedValue(undefined) };

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
  timezone: 'Europe/Sofia',
  defaultTheme: 'light',
  tier: 'FREE',
  trendingMode: 'OFF',
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
        { provide: TranslationService, useValue: mockTranslation },
        { provide: MenuTranslationService, useValue: mockMenuTranslation },
        { provide: StorageService, useValue: mockStorage },
        FeatureService,
      ],
    }).compile();

    service = module.get<MenuCrudService>(MenuCrudService);
    jest.clearAllMocks();
    mockMenuTranslation.applyLazyTranslations.mockResolvedValue(undefined);
    mockTranslation.translateObject.mockResolvedValue({});
    mockStorage.delete.mockResolvedValue(undefined);
    mockPrisma.$transaction.mockResolvedValue([]);
  });

  // ── getPublicMenu ─────────────────────────────────────────────────────────

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
      expect(result).toHaveProperty('categories');
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
      // Pin to 2026-01-14T10:00Z = Wednesday in Sofia (UTC+2) → weekday 3
      const spy = jest
        .spyOn(DateTime, 'now')
        .mockReturnValue(DateTime.fromISO('2026-01-14T10:00:00.000Z') as any);
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
      // Pin to 2026-01-14T18:00Z = 20:00 Sofia — outside 09:00-17:00
      const spy = jest
        .spyOn(DateTime, 'now')
        .mockReturnValue(DateTime.fromISO('2026-01-14T18:00:00.000Z') as any);
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

    it('calls applyLazyTranslations when lang in targetLanguages and DEEPL_API_KEY set', async () => {
      const prevKey = process.env.DEEPL_API_KEY;
      process.env.DEEPL_API_KEY = 'test-key';
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        tier: 'PROFESSIONAL',
      }); // targetLanguages: ['en','bg']
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      await service.getPublicMenu('rest-1', 'bg');

      expect(mockMenuTranslation.applyLazyTranslations).toHaveBeenCalledWith(
        expect.any(Array),
        'bg',
      );
      if (prevKey === undefined) delete process.env.DEEPL_API_KEY;
      else process.env.DEEPL_API_KEY = prevKey;
    });

    it('does not call applyLazyTranslations when lang not in targetLanguages', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        ...BASE_RESTAURANT,
        targetLanguages: [],
      });
      mockPrisma.menuCategory.findMany.mockResolvedValue([makeCategory()]);

      await service.getPublicMenu('rest-1', 'ro');

      expect(mockMenuTranslation.applyLazyTranslations).not.toHaveBeenCalled();
    });
  });

  // ── getPublicMenuMeta ─────────────────────────────────────────────────────

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
      expect(result).toHaveProperty('categories');
      expect(result.categories).toHaveLength(1);
    });

    it('strips branding fields when effective tier lacks BRANDING_CUSTOM', async () => {
      // BASE_RESTAURANT is FREE — branding must not render on the public menu
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
  });

  // ── getCategoryItems ──────────────────────────────────────────────────────

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
        .mockReturnValue(DateTime.fromISO('2026-01-14T18:00:00.000Z') as any);

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

  // ── getTrendingItems ──────────────────────────────────────────────────────

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
      expect((result[0] as any).id).toBe('item-2');
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
  });

  // ── Category CRUD ─────────────────────────────────────────────────────────

  describe('createCategory', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);

      await expect(
        service.createCategory('missing', { name: 'Drinks' } as any, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when not restaurant owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      await expect(
        service.createCategory(
          'rest-1',
          { name: 'Drinks' } as any,
          'other-user',
        ),
      ).rejects.toThrow(ForbiddenException);
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
        service.updateCategory('missing', { name: 'New' } as any, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when not owner', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(makeCategory());
      mockPrisma.restaurant.findUnique.mockResolvedValue(BASE_RESTAURANT);

      await expect(
        service.updateCategory('cat-1', { name: 'New' } as any, 'other'),
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

  // ── Item CRUD ─────────────────────────────────────────────────────────────

  describe('createItem', () => {
    it('throws NotFoundException when category not found', async () => {
      mockPrisma.menuCategory.findUnique.mockResolvedValue(null);

      await expect(
        service.createItem(
          'missing',
          { name: 'Soup', price: 5 } as any,
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
        service.createItem('cat-1', { name: 'Soup', price: 5 } as any, 'other'),
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
        { name: 'Soup', price: 5 } as any,
        'user-1',
      );

      expect(mockPrisma.menuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ categoryId: 'cat-1', order: 3 }),
        }),
      );
      expect(result.id).toBe('item-1');
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
        service.updateItem('missing', { name: 'New' } as any, 'user-1'),
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

  // ── Option CRUD ───────────────────────────────────────────────────────────

  describe('createMenuOption', () => {
    it('throws NotFoundException when item not found', async () => {
      mockPrisma.menuItem.findUnique.mockResolvedValue(null);

      await expect(
        service.createMenuOption(
          'missing',
          { name: 'Size', choices: '[]' } as any,
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
          { name: 'Size', choices: '{"key":"val"}' } as any,
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
          { name: 'Size', choices: '[bad json' } as any,
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
        } as any,
        'user-1',
      );

      expect(mockPrisma.menuOption.create).toHaveBeenCalled();
      expect(result.name).toBe('Size');
    });
  });

  describe('updateMenuOption', () => {
    it('throws NotFoundException when option not found', async () => {
      mockPrisma.menuOption.findUnique.mockResolvedValue(null);

      await expect(
        service.updateMenuOption('missing', { name: 'New' } as any, 'user-1'),
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
          { choices: '"not-array"' } as any,
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
});
