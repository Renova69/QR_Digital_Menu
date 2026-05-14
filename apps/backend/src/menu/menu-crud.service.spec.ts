import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MenuCrudService } from './menu-crud.service';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';
import { MenuTranslationService } from './menu-translation.service';

const mockPrisma = {
  restaurant: {
    findUnique: jest.fn().mockResolvedValue({
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
    }),
  },
  menuCategory: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  menuItem: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  orderItem: {} as any,
};

const mockTranslation = {};

const mockMenuTranslation = {
  applyLazyTranslations: jest.fn().mockResolvedValue(undefined),
};

describe('MenuCrudService', () => {
  let service: MenuCrudService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuCrudService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TranslationService, useValue: mockTranslation },
        { provide: MenuTranslationService, useValue: mockMenuTranslation },
      ],
    }).compile();

    service = module.get<MenuCrudService>(MenuCrudService);
  });

  describe('getPublicMenu', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('returns restaurant and categories for valid restaurantId', async () => {
      const result = await service.getPublicMenu('rest-1');
      expect(result).toBeDefined();
      expect(result).toHaveProperty('restaurant');
      expect(result).toHaveProperty('categories');
    });

    it('fetches restaurant from prisma by restaurantId', async () => {
      await service.getPublicMenu('rest-1');
      expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledWith({
        where: { id: 'rest-1' },
        select: expect.any(Object),
      });
    });

    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce(null);
      await expect(service.getPublicMenu('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('fetches categories from prisma and returns them', async () => {
      const mockCategories = [
        { id: 'cat-1', availabilityType: 'ALWAYS', items: [] },
      ];
      mockPrisma.menuCategory.findMany.mockResolvedValue(mockCategories);

      const result = await service.getPublicMenu('rest-1');

      expect(mockPrisma.menuCategory.findMany).toHaveBeenCalledWith({
        where: { restaurantId: 'rest-1' },
        include: expect.any(Object),
        orderBy: { order: 'asc' },
      });
      expect(result.categories).toEqual(mockCategories);
    });

    it('filters out HIDDEN categories', async () => {
      const mockCategories = [
        { id: 'cat-1', availabilityType: 'ALWAYS', items: [] },
        { id: 'cat-2', availabilityType: 'HIDDEN', items: [] },
      ];
      mockPrisma.menuCategory.findMany.mockResolvedValue(mockCategories);

      const result = await service.getPublicMenu('rest-1');

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].id).toBe('cat-1');
    });

    it('filters out SCHEDULED categories when current day not in daysOfWeek', async () => {
      const mockCategories = [
        { id: 'cat-1', availabilityType: 'ALWAYS', items: [] },
        {
          id: 'cat-2',
          availabilityType: 'SCHEDULED',
          daysOfWeek: [1, 2],
          startTime: null,
          endTime: null,
          items: [],
        },
      ];
      mockPrisma.menuCategory.findMany.mockResolvedValue(mockCategories);

      const result = await service.getPublicMenu('rest-1');

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].id).toBe('cat-1');
    });

    it('filters out SCHEDULED category when current time outside range', async () => {
      const mockCategories = [
        { id: 'cat-1', availabilityType: 'ALWAYS', items: [] },
        {
          id: 'cat-2',
          availabilityType: 'SCHEDULED',
          daysOfWeek: null,
          startTime: '09:00',
          endTime: '17:00',
          items: [],
        },
      ];
      mockPrisma.menuCategory.findMany.mockResolvedValue(mockCategories);

      const result = await service.getPublicMenu('rest-1');

      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].id).toBe('cat-1');
    });

    it('calls applyLazyTranslations when lang is in targetLanguages and DEEPL_API_KEY is set', async () => {
      const prevKey = process.env.DEEPL_API_KEY;
      process.env.DEEPL_API_KEY = 'test-key';

      const mockCategories = [
        { id: 'cat-1', availabilityType: 'ALWAYS', items: [] },
      ];
      mockPrisma.menuCategory.findMany.mockResolvedValue(mockCategories);

      await service.getPublicMenu('rest-1', 'bg');

      expect(mockMenuTranslation.applyLazyTranslations).toHaveBeenCalledWith(
        mockCategories,
        'bg',
      );

      if (prevKey === undefined) {
        delete process.env.DEEPL_API_KEY;
      } else {
        process.env.DEEPL_API_KEY = prevKey;
      }
    });
  });

  describe('getTrendingItems', () => {
    it('returns empty array when trendingMode is OFF', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'OFF',
        id: 'rest-1',
      });

      const result = await service.getTrendingItems('rest-1');

      expect(result).toEqual([]);
    });

    it('returns featured items when trendingMode is MANUAL', async () => {
      const featuredItems = [
        { id: 'item-1', name: 'Burger', isFeatured: true },
      ];
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'MANUAL',
        id: 'rest-1',
      });
      mockPrisma.menuItem.findMany = jest.fn().mockResolvedValue(featuredItems);

      const result = await service.getTrendingItems('rest-1');

      expect(mockPrisma.menuItem.findMany).toHaveBeenCalledWith({
        where: {
          category: { restaurantId: 'rest-1' },
          isFeatured: true,
          isOutOfStock: false,
        },
        take: 4,
        orderBy: { order: 'asc' },
        include: {
          options: true,
          category: { select: { isDrinkCategory: true, name: true } },
        },
      });
      expect(result).toEqual(featuredItems);
    });

    it('returns top items by order count when trendingMode is AUTO', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        trendingMode: 'AUTO',
        id: 'rest-1',
      });

      const mostOrdered = [
        { menuItemId: 'item-2', _sum: { quantity: 10 } },
        { menuItemId: 'item-1', _sum: { quantity: 5 } },
      ];
      mockPrisma.orderItem.groupBy = jest.fn().mockResolvedValue(mostOrdered);

      const trendingItems = [
        { id: 'item-2', name: 'Pizza', options: [], category: { isDrinkCategory: false, name: 'Mains' } },
        { id: 'item-1', name: 'Burger', options: [], category: { isDrinkCategory: false, name: 'Mains' } },
      ];
      mockPrisma.menuItem.findMany = jest.fn().mockResolvedValue(trendingItems);

      const result = await service.getTrendingItems('rest-1');

      expect(mockPrisma.orderItem.groupBy).toHaveBeenCalledWith({
        by: ['menuItemId'],
        where: {
          order: { restaurantId: 'rest-1' },
          menuItemId: { not: null },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 4,
      });
      expect(result).toEqual(trendingItems);
    });
  });
});
