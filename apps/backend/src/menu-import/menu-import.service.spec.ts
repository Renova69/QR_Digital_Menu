import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MenuImportService } from './menu-import.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FeatureService } from '../subscription/feature.service';
import { AvailabilityType, Currency, OptionType } from '@prisma/client';

// ─── Mocks ───────────────────────────────────────────────────────────────────

/** Minimal transaction mock — only the write operations needed by upsertMenu.
 *  No findFirst/aggregate since the new implementation preloads before tx.
 *  deleteMany is tracked on categories/items to assert additive-only contract. */
const makeTx = () => ({
  restaurant: {
    findUnique: jest
      .fn()
      .mockResolvedValue({ tier: 'ENTERPRISE', forceTier: null }),
  },
  menuCategory: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'cat-1' }),
    update: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn(), // must NOT be called (L3.2)
  },
  menuItem: {
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'item-1' }),
    update: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn(), // must NOT be called (L3.2)
  },
  menuOption: {
    create: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }), // options ARE wiped per item
  },
});

const mockStorageService = {
  delete: jest.fn().mockResolvedValue(undefined),
  deleteExact: jest.fn().mockResolvedValue(undefined),
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
    findUnique: jest
      .fn()
      .mockResolvedValue({ tier: 'ENTERPRISE', forceTier: null }),
    update: jest.fn().mockResolvedValue({}),
  },
  menuCategory: {
    // Preload — returns [] (no existing cats) by default
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  menuItem: {
    count: jest.fn().mockResolvedValue(0),
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
    mockPrisma.menuCategory.count.mockResolvedValue(0);
    mockPrisma.menuItem.count.mockResolvedValue(0);
    mockStorageService.delete.mockResolvedValue(undefined);
    mockStorageService.deleteExact.mockResolvedValue(undefined);
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
        service.upsertMenu('rest-1', { categories: [] } as Parameters<
          typeof service.upsertMenu
        >[1]),
      ).rejects.toThrow('No categories in payload');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects aggregate imports that exceed the total item cap before opening a transaction', async () => {
      const categories = Array.from({ length: 11 }, (_, catIndex) => ({
        name: `Category ${catIndex}`,
        items: Array.from({ length: 100 }, (_, itemIndex) => ({
          name: `Item ${catIndex}-${itemIndex}`,
          price: 1,
          options: [],
        })),
      }));

      await expect(
        service.upsertMenu('rest-1', { categories } as Parameters<
          typeof service.upsertMenu
        >[1]),
      ).rejects.toThrow('exceeds the 1000 item limit');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates category and item when neither exists', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );

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
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );

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
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );

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

    // F-FE-1/F-FE-3: EUR is the only transactional currency — a BGN-tagged
    // import must be normalized to EUR, never stored as authoritative BGN.
    it('normalizes a BGN-tagged import to EUR at the fixed rate', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'BGN Menu',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Item BGN',
                price: 1.95583 * 2,
                currency: 'BGN',
                options: [],
              },
            ],
          },
        ],
      });

      expect(tx.menuItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currency: Currency.EUR, price: 2 }),
        }),
      );
    });

    // Security-review finding: choice price deltas live on the option, not
    // the item, so the item-level BGN conversion above doesn't touch them —
    // a BGN "+2 лв" upcharge must also convert, or it gets reinterpreted as
    // "+2 EUR" downstream (order totals treat every stored number as EUR).
    it('normalizes BGN choice price modifiers to EUR at the fixed rate', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'BGN Menu',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Pizza',
                price: 1.95583 * 10,
                currency: 'BGN',
                options: [
                  {
                    name: 'Size',
                    type: 'ADDON',
                    choices: [{ name: 'Large', price: 1.95583 * 2 }],
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(tx.menuOption.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            choices: [
              expect.objectContaining({ name: 'Large', priceModifier: 2 }),
            ],
          }),
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

    // Unsupported currencies must be rejected, not silently coerced to EUR.
    it('rejects an import item with an unsupported currency', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await expect(
        service.upsertMenu('rest-1', {
          categories: [
            {
              name: 'USD Menu',
              availabilityType: AvailabilityType.ALWAYS,
              items: [
                { name: 'Item USD', price: 5, currency: 'USD', options: [] },
              ],
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(tx.menuItem.create).not.toHaveBeenCalled();
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
            translations: { en: { name: 'Cat' } },
            imageUrl: 'https://img.example.com/cat.webp',
            thumbnailUrl: 'https://img.example.com/cat_thumb.webp',
            items: [
              {
                name: 'Item',
                price: 5,
                translations: { en: { name: 'Item' } },
                imageUrl: 'https://img.example.com/item.webp',
                thumbnailUrl: 'https://img.example.com/item_thumb.webp',
                options: [],
              },
            ],
          },
        ],
      });

      expect(tx.menuCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            translations: { en: { name: 'Cat' } },
          }),
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
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            imageUrl: 'https://r2.example.com/new-cat.webp',
            items: [],
          },
        ],
      });

      expect(mockStorageService.deleteExact).toHaveBeenCalledWith(OLD_URL);
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
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            imageUrl: SAME_URL,
            items: [],
          },
        ],
      });

      expect(mockStorageService.deleteExact).not.toHaveBeenCalled();
    });

    it('does NOT delete a replaced category image when another row still references the old URL', async () => {
      const tx = makeTx();
      const OLD_URL = 'https://r2.example.com/shared-cat.webp';
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
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );
      mockPrisma.menuItem.count.mockResolvedValue(1);
      mockPrisma.menuCategory.count.mockResolvedValue(0);

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            imageUrl: 'https://r2.example.com/new-cat.webp',
            items: [],
          },
        ],
      });

      expect(mockStorageService.deleteExact).not.toHaveBeenCalled();
      expect(mockPrisma.menuCategory.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { notIn: ['cat-existing'] } }),
        }),
      );
    });

    it('does not fail a committed import when best-effort image cleanup cannot count references', async () => {
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
      mockPrisma.$transaction.mockImplementation(
        async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx),
      );
      mockPrisma.menuItem.count.mockRejectedValue(new Error('count failed'));

      await expect(
        service.upsertMenu('rest-1', {
          categories: [
            {
              name: 'Mains',
              availabilityType: AvailabilityType.ALWAYS,
              imageUrl: 'https://r2.example.com/new-cat.webp',
              items: [],
            },
          ],
        }),
      ).resolves.toEqual({
        success: true,
        created: 0,
        updated: 0,
        categories: 0,
      });

      expect(mockStorageService.deleteExact).not.toHaveBeenCalled();
    });

    it('increments nextCatOrder from max existing order', async () => {
      const tx = makeTx();
      // Preload shows cats with orders 0,1,2 so next should be 3
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        {
          id: 'c0',
          name: 'Existing',
          order: 2,
          imageUrl: null,
          thumbnailUrl: null,
          items: [],
        },
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
        expect.objectContaining({
          data: expect.objectContaining({ order: 3 }),
        }),
      );
    });

    // L3.2 — Additive-only contract: import never deletes categories or items
    it('never deletes categories or items — only options are wiped-and-rebuilt', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Burger',
                price: 10,
                options: [
                  {
                    name: 'Size',
                    type: 'VARIATION',
                    choices: [{ name: 'Large', price: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(tx.menuCategory.deleteMany).not.toHaveBeenCalled();
      expect(tx.menuItem.deleteMany).not.toHaveBeenCalled();
      expect(tx.menuOption.deleteMany).toHaveBeenCalled(); // options DO get wiped
    });

    // L3.1 — Duplicate name detection
    it('throws BadRequestException on duplicate category names (case-insensitive)', async () => {
      await expect(
        service.upsertMenu('rest-1', {
          categories: [
            {
              name: 'Mains',
              availabilityType: AvailabilityType.ALWAYS,
              items: [],
            },
            {
              name: 'mains',
              availabilityType: AvailabilityType.ALWAYS,
              items: [],
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on duplicate item names within a category', async () => {
      await expect(
        service.upsertMenu('rest-1', {
          categories: [
            {
              name: 'Mains',
              availabilityType: AvailabilityType.ALWAYS,
              items: [
                { name: 'Burger', price: 10, options: [] },
                { name: 'BURGER', price: 12, options: [] }, // duplicate, case-insensitive
              ],
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('deletes old R2 objects (H1.1) when thumbnail is replaced on existing category', async () => {
      const tx = makeTx();
      const OLD_URL = 'https://r2.example.com/old-cat-thumb.webp';
      mockPrisma.menuCategory.findMany.mockResolvedValue([
        {
          id: 'cat-existing',
          name: 'Mains',
          order: 0,
          imageUrl: null,
          thumbnailUrl: OLD_URL,
          items: [],
        },
      ]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            thumbnailUrl: 'https://r2.example.com/new-cat-thumb.webp',
            items: [],
          },
        ],
      });

      expect(mockStorageService.deleteExact).toHaveBeenCalledWith(OLD_URL);
    });

    it('deletes old R2 objects when image is replaced on existing item', async () => {
      const tx = makeTx();
      const OLD_URL = 'https://r2.example.com/old-item.webp';
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
              imageUrl: OLD_URL,
              thumbnailUrl: null,
            },
          ],
        },
      ]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Burger',
                price: 10,
                options: [],
                imageUrl: 'https://r2.example.com/new-item.webp',
              },
            ],
          },
        ],
      });

      expect(mockStorageService.deleteExact).toHaveBeenCalledWith(OLD_URL);
    });

    it('deletes old R2 objects when thumbnail is replaced on existing item', async () => {
      const tx = makeTx();
      const OLD_URL = 'https://r2.example.com/old-item-thumb.webp';
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
              thumbnailUrl: OLD_URL,
            },
          ],
        },
      ]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Burger',
                price: 10,
                options: [],
                thumbnailUrl: 'https://r2.example.com/new-item-thumb.webp',
              },
            ],
          },
        ],
      });

      expect(mockStorageService.deleteExact).toHaveBeenCalledWith(OLD_URL);
    });

    it('uses provided txClient if passed and does not open a new transaction', async () => {
      const txClient = makeTx();

      await service.upsertMenu(
        'rest-1',
        {
          categories: [
            {
              name: 'Mains',
              availabilityType: AvailabilityType.ALWAYS,
              items: [],
            },
          ],
        },
        txClient as unknown as Parameters<typeof service.upsertMenu>[2],
      );

      expect(txClient.menuCategory.create).toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('defers image cleanup for an external transaction until the caller runs the post-commit task', async () => {
      const txClient = makeTx();
      const OLD_URL = 'https://r2.example.com/old-cat.webp';
      txClient.menuCategory.findMany.mockResolvedValue([
        {
          id: 'cat-existing',
          name: 'Mains',
          order: 0,
          imageUrl: OLD_URL,
          thumbnailUrl: null,
          items: [],
        },
      ]);
      const postCommitCleanup: Array<() => Promise<void>> = [];

      await service.upsertMenu(
        'rest-1',
        {
          categories: [
            {
              name: 'Mains',
              availabilityType: AvailabilityType.ALWAYS,
              imageUrl: 'https://r2.example.com/new-cat.webp',
              items: [],
            },
          ],
        },
        txClient as unknown as Parameters<typeof service.upsertMenu>[2],
        postCommitCleanup,
      );

      expect(mockStorageService.deleteExact).not.toHaveBeenCalled();
      expect(postCommitCleanup).toHaveLength(1);

      await postCommitCleanup[0]();

      expect(mockStorageService.deleteExact).toHaveBeenCalledWith(OLD_URL);
    });

    it('rejects aggregate imports that exceed the total option cap', async () => {
      const categories = [
        {
          name: 'Cat 1',
          items: [
            {
              name: 'Item 1',
              price: 1,
              options: Array.from({ length: 2001 }, (_, i) => ({
                name: `Opt ${i}`,
                type: 'VARIATION',
                choices: [],
              })),
            },
          ],
        },
      ];

      await expect(
        service.upsertMenu('rest-1', { categories } as Parameters<
          typeof service.upsertMenu
        >[1]),
      ).rejects.toThrow('exceeds the 2000 option limit');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects aggregate imports that exceed the total choice cap', async () => {
      const categories = [
        {
          name: 'Cat 1',
          items: [
            {
              name: 'Item 1',
              price: 1,
              options: [
                {
                  name: 'Opt 1',
                  type: 'VARIATION',
                  choices: Array.from({ length: 5001 }, (_, i) => ({
                    name: `Choice ${i}`,
                    price: 1,
                  })),
                },
              ],
            },
          ],
        },
      ];

      await expect(
        service.upsertMenu('rest-1', { categories } as Parameters<
          typeof service.upsertMenu
        >[1]),
      ).rejects.toThrow('exceeds the 5000 choice limit');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('preserves existing option translations when item is updated', async () => {
      const tx = makeTx();
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
              options: [
                { name: 'Size', translations: { es: { name: 'Tamaño' } } },
              ],
            },
          ],
        },
      ]);
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Mains',
            availabilityType: AvailabilityType.ALWAYS,
            items: [
              {
                name: 'Burger',
                price: 10,
                options: [
                  {
                    name: 'Size',
                    type: 'VARIATION',
                    choices: [{ name: 'Large', price: 1 }],
                  },
                ],
              },
            ],
          },
        ],
      });

      expect(tx.menuOption.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            translations: { es: { name: 'Tamaño' } },
          }),
        }),
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
      expect((result as { apiKey?: string }).apiKey).toBeUndefined();
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

  describe('Import/Export Edge Cases (Expanded Coverage)', () => {
    it('successfully processes an import with a category but no items', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      const result = await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Empty Category',
            availabilityType: 'ALWAYS' as AvailabilityType,
            items: [],
          },
        ],
      });

      expect(tx.menuCategory.create).toHaveBeenCalled();
      expect(tx.menuItem.create).not.toHaveBeenCalled();
      expect(result.categories).toBe(1);
      expect(result.created).toBe(0);
    });

    it('correctly associates options with their respective items when multiple items exist', async () => {
      const tx = makeTx();
      mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));

      await service.upsertMenu('rest-1', {
        categories: [
          {
            name: 'Combo Meals',
            availabilityType: 'ALWAYS' as AvailabilityType,
            items: [
              {
                name: 'Burger Combo',
                price: 15,
                options: [
                  {
                    name: 'Drink Size',
                    type: 'VARIATION',
                    choices: [{ name: 'Large', price: 1 }],
                  },
                ],
              },
              {
                name: 'Salad Combo',
                price: 12,
                options: [],
              },
            ],
          },
        ],
      });

      expect(tx.menuItem.create).toHaveBeenCalledTimes(2);
      expect(tx.menuOption.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an import payload if the structure is completely invalid', async () => {
      await expect(
        service.upsertMenu(
          'rest-1',
          null as unknown as Parameters<typeof service.upsertMenu>[1],
        ),
      ).rejects.toThrow();
    });
  });
});
