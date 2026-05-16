import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MenuImportService } from './menu-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityType, Currency, OptionType } from '@prisma/client';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const makeTx = () => ({
  menuCategory: {
    aggregate: jest.fn().mockResolvedValue({ _max: { order: 2 } }),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'cat-1' }),
    update: jest.fn().mockResolvedValue({}),
  },
  menuItem: {
    aggregate: jest.fn().mockResolvedValue({ _max: { order: 1 } }),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 'item-1' }),
    update: jest.fn().mockResolvedValue({}),
  },
  menuOption: {
    create: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

const mockPrisma = {
  restaurant: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  menuCategory: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  $transaction: jest.fn(),
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('MenuImportService', () => {
  let service: MenuImportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuImportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<MenuImportService>(MenuImportService);
    jest.clearAllMocks();
    mockPrisma.restaurant.update.mockResolvedValue({});
    mockPrisma.menuCategory.findMany.mockResolvedValue([]);
  });

  // ── checkOwnership ────────────────────────────────────────────────────────

  describe('checkOwnership', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      await expect(service.checkOwnership('rest-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'owner-99' });
      await expect(service.checkOwnership('rest-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('returns restaurant when user is owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'user-1' });
      const result = await service.checkOwnership('rest-1', 'user-1');
      expect(result.id).toBe('rest-1');
    });
  });

  // ── upsertMenu ────────────────────────────────────────────────────────────

  describe('upsertMenu', () => {
    it('throws when dto.categories is empty', async () => {
      mockPrisma.$transaction.mockImplementation(async (fn: any) => {
        await fn(makeTx());
      });
      await expect(
        service.upsertMenu('rest-1', { categories: [] } as any),
      ).rejects.toThrow('No categories in payload');
    });

    it('creates category and item when neither exists', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      const result = await service.upsertMenu('rest-1', {
        categories: [{
          name: 'Mains',
          availabilityType: AvailabilityType.ALWAYS,
          items: [{ name: 'Burger', price: 10, currency: Currency.EUR, options: [] }],
        }],
      } as any);

      expect(tx.menuCategory.create).toHaveBeenCalled();
      expect(tx.menuItem.create).toHaveBeenCalled();
      expect(result.created).toBe(1);
      expect(result.categories).toBe(1);
    });

    it('updates category and item when both already exist', async () => {
      const tx = makeTx();
      tx.menuCategory.findFirst.mockResolvedValue({ id: 'cat-existing' });
      tx.menuItem.findFirst.mockResolvedValue({ id: 'item-existing' });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      const result = await service.upsertMenu('rest-1', {
        categories: [{
          name: 'Mains',
          availabilityType: AvailabilityType.ALWAYS,
          items: [{ name: 'Burger', price: 10, currency: Currency.EUR, options: [] }],
        }],
      } as any);

      expect(tx.menuCategory.update).toHaveBeenCalled();
      expect(tx.menuItem.update).toHaveBeenCalled();
      expect(result.updated).toBe(1);
    });

    it('defaults to ALWAYS when availabilityType is invalid', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [{
          name: 'Drinks',
          availabilityType: 'INVALID_TYPE',
          items: [{ name: 'Water', price: 1, options: [] }],
        }],
      } as any);

      expect(tx.menuCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ availabilityType: AvailabilityType.ALWAYS }),
        }),
      );
    });

    it('uses BGN currency when item.currency is BGN', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [{
          name: 'BGN Menu',
          availabilityType: AvailabilityType.ALWAYS,
          items: [{ name: 'Item BGN', price: 2, currency: 'BGN', options: [] }],
        }],
      } as any);

      expect(tx.menuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currency: Currency.BGN }),
        }),
      );
    });

    it('uses EUR currency for non-BGN items', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [{
          name: 'EUR Menu',
          availabilityType: AvailabilityType.ALWAYS,
          items: [{ name: 'Item EUR', price: 5, currency: 'EUR', options: [] }],
        }],
      } as any);

      expect(tx.menuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currency: Currency.EUR }),
        }),
      );
    });

    it('creates option with ADDON type and weighted choices', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [{
          name: 'Mains',
          availabilityType: AvailabilityType.ALWAYS,
          items: [{
            name: 'Pizza',
            price: 12,
            options: [{
              name: 'Size',
              type: 'ADDON',
              choices: [{ name: 'Large', price: 2, weight: '300g' }],
            }],
          }],
        }],
      } as any);

      expect(tx.menuOption.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: OptionType.ADDON }),
        }),
      );
    });

    it('creates option with VARIATION type when type is not ADDON', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [{
          name: 'Mains',
          availabilityType: AvailabilityType.ALWAYS,
          items: [{
            name: 'Steak',
            price: 20,
            options: [{
              name: 'Doneness',
              type: 'VARIATION',
              choices: [{ name: 'Medium', price: 0 }],
            }],
          }],
        }],
      } as any);

      expect(tx.menuOption.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: OptionType.VARIATION }),
        }),
      );
    });

    it('skips option when choices array is empty', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [{
          name: 'Drinks',
          availabilityType: AvailabilityType.ALWAYS,
          items: [{
            name: 'Water',
            price: 1,
            options: [{ name: 'Size', type: 'VARIATION', choices: [] }],
          }],
        }],
      } as any);

      expect(tx.menuOption.create).not.toHaveBeenCalled();
    });

    it('spreads optional fields (translations, imageUrl, thumbnailUrl) when provided', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [{
          name: 'Cat',
          availabilityType: AvailabilityType.ALWAYS,
          translations: { en: 'Cat' },
          imageUrl: 'https://img.example.com/cat.webp',
          thumbnailUrl: 'https://img.example.com/cat_thumb.webp',
          items: [{
            name: 'Item',
            price: 5,
            translations: { en: 'Item' },
            imageUrl: 'https://img.example.com/item.webp',
            thumbnailUrl: 'https://img.example.com/item_thumb.webp',
            options: [],
          }],
        }],
      } as any);

      expect(tx.menuCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ translations: { en: 'Cat' } }),
        }),
      );
    });

    it('uses null order (_max.order = null) and increments from 0', async () => {
      const tx = makeTx();
      tx.menuCategory.aggregate.mockResolvedValue({ _max: { order: null } });
      tx.menuItem.aggregate.mockResolvedValue({ _max: { order: null } });
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      const result = await service.upsertMenu('rest-1', {
        categories: [{
          name: 'Soups',
          availabilityType: AvailabilityType.ALWAYS,
          items: [{ name: 'Tomato', price: 6, options: [] }],
        }],
      } as any);

      expect(result.created).toBe(1);
    });
  });

  // ── exportMenu ────────────────────────────────────────────────────────────

  describe('exportMenu', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'user-1' });
    });

    it('exports categories with full optional fields', async () => {
      mockPrisma.menuCategory.findMany.mockResolvedValue([{
        name: 'Mains',
        order: 0,
        availabilityType: AvailabilityType.ALWAYS,
        imageUrl: 'https://img.example.com/mains.webp',
        thumbnailUrl: 'https://img.example.com/mains_thumb.webp',
        translations: { en: 'Mains' },
        items: [{
          name: 'Pizza',
          description: 'Classic margherita',
          price: 12,
          currency: Currency.EUR,
          weight: '400g',
          allergens: ['Gluten'],
          dietaryTags: ['Vegetarian'],
          order: 0,
          imageUrl: 'https://img.example.com/pizza.webp',
          thumbnailUrl: 'https://img.example.com/pizza_thumb.webp',
          translations: { en: 'Pizza' },
          options: [{
            name: 'Size',
            type: OptionType.VARIATION,
            choices: [{ name: 'Large', priceModifier: 2, weight: '500g' }],
          }],
        }],
      }]);

      const result = await service.exportMenu('rest-1', 'user-1');

      expect(result.restaurantId).toBe('rest-1');
      expect(result.categories).toHaveLength(1);
      const cat = result.categories[0];
      expect(cat.imageUrl).toBe('https://img.example.com/mains.webp');
      const item = cat.items[0];
      expect(item.description).toBe('Classic margherita');
      expect(item.allergens).toHaveLength(1);
    });

    it('exports categories without optional fields when absent', async () => {
      mockPrisma.menuCategory.findMany.mockResolvedValue([{
        name: 'Drinks',
        order: 1,
        availabilityType: AvailabilityType.ALWAYS,
        imageUrl: null,
        thumbnailUrl: null,
        translations: null,
        items: [{
          name: 'Water',
          description: null,
          price: 1,
          currency: Currency.EUR,
          weight: null,
          allergens: [],
          dietaryTags: [],
          order: 0,
          imageUrl: null,
          thumbnailUrl: null,
          translations: null,
          options: [],
        }],
      }]);

      const result = await service.exportMenu('rest-1', 'user-1');
      const cat = result.categories[0];
      expect(cat).not.toHaveProperty('imageUrl');
      expect(cat.items[0]).not.toHaveProperty('description');
      expect(cat.items[0]).not.toHaveProperty('options');
    });
  });

  // ── getOrCreateApiKey ─────────────────────────────────────────────────────

  describe('getOrCreateApiKey', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique
        .mockResolvedValueOnce({ id: 'rest-1', ownerId: 'user-1' }); // checkOwnership
    });

    it('returns masked existing key without generating new one', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({ importApiKey: 'ocrk_existingkey12345678' });

      const result = await service.getOrCreateApiKey('rest-1', 'user-1');

      expect(result.apiKey).toContain('••••');
      expect(mockPrisma.restaurant.update).not.toHaveBeenCalled();
    });

    it('generates and stores new key when none exists', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({ importApiKey: null });

      const result = await service.getOrCreateApiKey('rest-1', 'user-1');

      expect(result.generated).toBe(true);
      expect(mockPrisma.restaurant.update).toHaveBeenCalled();
    });
  });

  // ── revealApiKey ─────────────────────────────────────────────────────────

  describe('revealApiKey', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique
        .mockResolvedValueOnce({ id: 'rest-1', ownerId: 'user-1' }); // checkOwnership
    });

    it('returns existing key plaintext', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({ importApiKey: 'ocrk_abc123' });

      const result = await service.revealApiKey('rest-1', 'user-1');

      expect(result.apiKey).toBe('ocrk_abc123');
    });

    it('generates new key when none stored', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({ importApiKey: null });

      const result = await service.revealApiKey('rest-1', 'user-1');

      expect(result.apiKey).toMatch(/^ocrk_/);
      expect(mockPrisma.restaurant.update).toHaveBeenCalled();
    });
  });

  // ── regenerateApiKey ─────────────────────────────────────────────────────

  describe('regenerateApiKey', () => {
    it('always updates key and returns new one', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({ id: 'rest-1', ownerId: 'user-1' });

      const result = await service.regenerateApiKey('rest-1', 'user-1');

      expect(result.apiKey).toMatch(/^ocrk_/);
      expect(mockPrisma.restaurant.update).toHaveBeenCalled();
    });
  });
});
