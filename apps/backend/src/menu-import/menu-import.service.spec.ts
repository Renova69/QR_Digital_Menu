import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MenuImportService } from './menu-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FeatureService } from '../subscription/feature.service';
import { AvailabilityType, Currency, OptionType } from '@prisma/client';

// ─── Mocks ───────────────────────────────────────────────────────────────────

/** Minimal transaction mock — only the write operations needed by upsertMenu.
 *  No findFirst/aggregate since the new implementation preloads before tx. */
const makeTx = () => ({
  menuCategory: {
    create: jest.fn().mockResolvedValue({ id: 'cat-1' }),
    update: jest.fn().mockResolvedValue({}),
  },
  menuItem: {
    create: jest.fn().mockResolvedValue({ id: 'item-1' }),
    update: jest.fn().mockResolvedValue({}),
  },
  menuOption: {
    create: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

const mockStorageService = {
  delete: jest.fn().mockResolvedValue(undefined),
};

// Default: dayparting enabled (ENTERPRISE tier) so SCHEDULED is preserved in tests
const mockFeatureService = {
  hasFeature: jest.fn().mockReturnValue(true),
  getEffectiveTier: jest.fn().mockReturnValue('ENTERPRISE'),
  restaurantHasFeature: jest.fn().mockReturnValue(true),
};

const mockPrisma = {
  restaurant: {
    // Used by checkOwnership AND by upsertMenu tier fetch
    findUnique: jest.fn().mockResolvedValue({ tier: 'ENTERPRISE', forceTier: null }),
    update: jest.fn().mockResolvedValue({}),
  },
  menuCategory: {
    // Preload — returns [] (no existing cats) by default
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
        { provide: StorageService, useValue: mockStorageService },
        { provide: FeatureService, useValue: mockFeatureService },
      ],
    }).compile();

    service = module.get<MenuImportService>(MenuImportService);
    jest.clearAllMocks();
    mockPrisma.restaurant.update.mockResolvedValue({});
    // Default: no existing categories (all creates)
    mockPrisma.menuCategory.findMany.mockResolvedValue([]);
  });

  // ── checkOwnership ────────────────────────────────────────────────────────

  describe('checkOwnership', () => {
    it('throws NotFoundException when restaurant not found', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue(null);
      await expect(service.checkOwnership('rest-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user is not owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'owner-99',
      });
      await expect(service.checkOwnership('rest-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns restaurant when user is owner', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'user-1',
      });
      const result = await service.checkOwnership('rest-1', 'user-1');
      expect(result.id).toBe('rest-1');
    });
  });

  // ── upsertMenu ────────────────────────────────────────────────────────────

  describe('upsertMenu', () => {
    it('throws immediately (before transaction) when dto.categories is empty', async () => {
      // BadRequestException is thrown before the $transaction call in the new impl
      await expect(
        service.upsertMenu('rest-1', { categories: [] } as any),
      ).rejects.toThrow('No categories in payload');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates category and item when neither exists', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      const result = await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Burger',
                price: 10,
                currency: Currency.EUR,
                options: [],
              },
            ],
          },
        ],
      });

      expect(tx.menuCategory.create).toHaveBeenCalled();
      expect(tx.menuItem.create).toHaveBeenCalled();
      expect(result.created).toBe(1);
      expect(result.categories).toBe(1);
    });

    it('updates category and item when both already exist (preloaded)', async () => {
      const tx = makeTx();
      // Preload returns an existing category with an existing item
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        {
          id: 'cat-existing',
          name: 'Mains',
          order: 0,
          imageUrl: null,
          thumbnailUrl: null,
          items: [
            {
              id: 'item-existing',
              name: 'Burger',
              order: 0,
              imageUrl: null,
              thumbnailUrl: null,
            },
          ],
        },
      ]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      const result = await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Burger',
                price: 10,
                currency: Currency.EUR,
                options: [],
              },
            ],
          },
        ],
      });

      expect(tx.menuCategory.create).not.toHaveBeenCalled();
      expect(tx.menuCategory.update).toHaveBeenCalled();
      expect(tx.menuItem.create).not.toHaveBeenCalled();
      expect(tx.menuItem.update).toHaveBeenCalled();
      expect(result.updated).toBe(1);
      expect(result.categories).toBe(0);
    });

    it('defaults to ALWAYS when availabilityType is invalid', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Drinks',
            availabilityType: 'INVALID_TYPE',
            items: [{ name: 'Water', price: 1, options: [] }],
          },
        ],
      });

      expect(tx.menuCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            availabilityType: AvailabilityType.ALWAYS,
          }),
        }),
      );
    });

    it('uses BGN currency when item.currency is BGN', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'BGN Menu',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              { name: 'Item BGN', price: 2, currency: 'BGN', options: [] },
            ],
          },
        ],
      });

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
        categories: [
          {
            name: 'EUR Menu',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              { name: 'Item EUR', price: 5, currency: 'EUR', options: [] },
            ],
          },
        ],
      });

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
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Pizza',
                price: 12,
                options: [
                  {
                    name: 'Size',
                    type: 'ADDON',
                    choices: [{ name: 'Large', price: 2, weight: '300g' }],
                  },
                ],
              },
            ],
          },
        ],
      });

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
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Steak',
                price: 20,
                options: [
                  {
                    name: 'Doneness',
                    type: 'VARIATION',
                    choices: [{ name: 'Medium', price: 0 }],
                  },
                ],
              },
            ],
          },
        ],
      });

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
        categories: [
          {
            name: 'Drinks',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Water',
                price: 1,
                options: [{ name: 'Size', type: 'VARIATION', choices: [] }],
              },
            ],
          },
        ],
      });

      expect(tx.menuOption.create).not.toHaveBeenCalled();
    });

    it('spreads optional fields (translations, imageUrl, thumbnailUrl) when provided', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Cat',
            availabilityType: AvailabilityType.ALWAYS,
            translations: { en: 'Cat' },
            imageUrl: 'https://img.example.com/cat.webp',
            thumbnailUrl: 'https://img.example.com/cat_thumb.webp',
            items: [
              {
                name: 'Item',
                price: 5,
                translations: { en: 'Item' },
                imageUrl: 'https://img.example.com/item.webp',
                thumbnailUrl: 'https://img.example.com/item_thumb.webp',
                options: [],
              },
            ],
          },
        ],
      } as any);

      expect(tx.menuCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ translations: { en: 'Cat' } }),
        }),
      );
    });

    it('deletes old R2 objects (H1.1) when image is replaced on existing category', async () => {
      const tx = makeTx();
      const OLD_URL = 'https://r2.example.com/old-cat.webp';
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        {
          id: 'cat-existing',
          name: 'Mains',
          order: 0,
          imageUrl: OLD_URL,
          thumbnailUrl: null,
          items: [],
        },
      ]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            imageUrl: 'https://r2.example.com/new-cat.webp',
            items: [],
          },
        ],
      } as any);

      expect(mockStorageService.delete).toHaveBeenCalledWith(OLD_URL);
    });

    it('does NOT delete old image when same URL is re-sent', async () => {
      const tx = makeTx();
      const SAME_URL = 'https://r2.example.com/cat.webp';
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        {
          id: 'cat-existing',
          name: 'Mains',
          order: 0,
          imageUrl: SAME_URL,
          thumbnailUrl: null,
          items: [],
        },
      ]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            imageUrl: SAME_URL,
            items: [],
          },
        ],
      } as any);

      expect(mockStorageService.delete).not.toHaveBeenCalled();
    });

    it('increments nextCatOrder from max existing order', async () => {
      const tx = makeTx();
      // Preload shows cats with orders 0,1,2 so next should be 3
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        { id: 'c0', name: 'Existing', order: 2, imageUrl: null, thumbnailUrl: null, items: [] },
      ]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'NewCat',
            availabilityType: AvailabilityType.ALWAYS,
            items: [{ name: 'Item', price: 5, options: [] }],
          },
        ],
      });

      expect(tx.menuCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ order: 3 }) }),
      );
    });
  });

  // ── exportMenu ────────────────────────────────────────────────────────────

  describe('exportMenu', () => {
    beforeEach(() => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'user-1',
      });
    });

    it('exports categories with full optional fields', async () => {
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        {
          name: 'Mains',
          order: 0,
          availabilityType: AvailabilityType.ALWAYS,
          imageUrl: 'https://img.example.com/mains.webp',
          thumbnailUrl: 'https://img.example.com/mains_thumb.webp',
          translations: { en: 'Mains' },
          items: [
            {
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
              options: [
                {
                  name: 'Size',
                  type: OptionType.VARIATION,
                  choices: [
                    { name: 'Large', priceModifier: 2, weight: '500g' },
                  ],
                },
              ],
            },
          ],
        },
      ]);

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
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        {
          name: 'Drinks',
          order: 1,
          availabilityType: AvailabilityType.ALWAYS,
          imageUrl: null,
          thumbnailUrl: null,
          translations: null,
          items: [
            {
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
            },
          ],
        },
      ]);

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
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        id: 'rest-1',
        ownerId: 'user-1',
      }); // checkOwnership
    });

    it('reports configured without revealing the key when a hash exists', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        importApiKeyHash: 'deadbeef',
      });

      const result = await service.getOrCreateApiKey('rest-1', 'user-1');

      expect(result).toEqual({ configured: true });
      expect((result as any).apiKey).toBeUndefined();
      expect(mockPrisma.restaurant.update).not.toHaveBeenCalled();
    });

    it('generates a key once and stores only its hash when none exists', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValueOnce({
        importApiKeyHash: null,
      });

      const result = await service.getOrCreateApiKey('rest-1', 'user-1');

      expect(result.generated).toBe(true);
      expect(result.apiKey).toMatch(/^ocrk_/);
      // Stored value is the hash of the returned key, never the key itself.
      const stored =
        mockPrisma.restaurant.update.mock.calls[0][0].data.importApiKeyHash;
      expect(stored).toBe(service.hashKey(result.apiKey!));
      expect(stored).not.toBe(result.apiKey);
    });
  });

  // ── regenerateApiKey ─────────────────────────────────────────────────────

  describe('regenerateApiKey', () => {
    it('returns a new key once and stores only its hash', async () => {
      mockPrisma.restaurant.findUnique.mockResolvedValue({
        id: 'rest-1',
        ownerId: 'user-1',
      });

      const result = await service.regenerateApiKey('rest-1', 'user-1');

      expect(result.apiKey).toMatch(/^ocrk_/);
      const stored =
        mockPrisma.restaurant.update.mock.calls[0][0].data.importApiKeyHash;
      expect(stored).toBe(service.hashKey(result.apiKey));
    });
  });
});
