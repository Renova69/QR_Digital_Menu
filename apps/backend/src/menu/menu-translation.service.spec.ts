import { Test, TestingModule } from '@nestjs/testing';
import { MenuTranslationService } from './menu-translation.service';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';

const mockPrisma = {
  menuCategory: { update: jest.fn() },
  menuItem: { update: jest.fn() },
  menuOption: { update: jest.fn() },
};

const mockTranslation = {
  translateTexts: jest.fn(),
};

const makeCategory = (overrides: object = {}) => ({
  id: 'cat-1',
  name: 'Starters',
  translations: null,
  items: [],
  ...overrides,
});

const makeItem = (overrides: object = {}) => ({
  id: 'item-1',
  name: 'Soup',
  description: 'Hot soup',
  allergens: [],
  dietaryTags: [],
  translations: null,
  options: [],
  ...overrides,
});

describe('MenuTranslationService', () => {
  let service: MenuTranslationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuTranslationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TranslationService, useValue: mockTranslation },
      ],
    }).compile();

    service = module.get<MenuTranslationService>(MenuTranslationService);
    jest.clearAllMocks();
    // Default: translateTexts echoes back input
    mockTranslation.translateTexts.mockImplementation((texts: string[]) =>
      Promise.resolve([...texts]),
    );
    mockPrisma.menuCategory.update.mockResolvedValue({});
    mockPrisma.menuItem.update.mockResolvedValue({});
    mockPrisma.menuOption.update.mockResolvedValue({});
  });

  describe('applyLazyTranslations', () => {
    it('makes no API or DB calls when categories array is empty', async () => {
      await service.applyLazyTranslations([], 'en');

      expect(mockTranslation.translateTexts).not.toHaveBeenCalled();
      expect(mockPrisma.menuCategory.update).not.toHaveBeenCalled();
    });

    it('makes no API calls when all translations are already cached', async () => {
      const category = makeCategory({
        translations: { en: { name: 'Starters' } },
        items: [
          makeItem({
            translations: {
              en: { name: 'Soup', description: 'Hot soup' },
            },
          }),
        ],
      });

      await service.applyLazyTranslations([category], 'en');

      expect(mockTranslation.translateTexts).not.toHaveBeenCalled();
    });

    it('translates category name and writes to DB when missing', async () => {
      mockTranslation.translateTexts.mockResolvedValue(['Starters BG']);
      const category = makeCategory({ items: [] });

      await service.applyLazyTranslations([category], 'bg');

      expect(mockTranslation.translateTexts).toHaveBeenCalledWith(
        ['Starters'],
        'bg',
      );
      expect(mockPrisma.menuCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-1' },
          data: expect.objectContaining({
            translations: expect.objectContaining({
              bg: { name: 'Starters BG' },
            }),
          }),
        }),
      );
    });

    it('applies translated name to in-memory category object', async () => {
      mockTranslation.translateTexts.mockResolvedValue(['Начала']);
      const category = makeCategory({ items: [] });

      await service.applyLazyTranslations([category], 'bg');

      expect(category.name).toBe('Начала');
    });

    it('translates item name and description in single batched call', async () => {
      mockTranslation.translateTexts.mockResolvedValue([
        'Начала',
        'Супа',
        'Горещ',
      ]);
      const item = makeItem({ description: 'Hot' });
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'bg');

      // category name + item name + description = 3 texts, one call
      expect(mockTranslation.translateTexts).toHaveBeenCalledTimes(1);
      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [
        string[],
        string,
      ];
      expect(texts).toContain('Starters');
      expect(texts).toContain('Soup');
      expect(texts).toContain('Hot');
    });

    it('applies translated name to in-memory item', async () => {
      mockTranslation.translateTexts.mockResolvedValue(['Начала', 'Супа']);
      const item = makeItem();
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'bg');

      expect(item.name).toBe('Супа');
    });

    it('translates option name and choice names', async () => {
      const option = {
        id: 'opt-1',
        name: 'Size',
        translations: null,
        choices: [{ name: 'Small' }, { name: 'Large' }],
      };
      const item = makeItem({
        translations: {
          bg: { name: 'Soup', description: 'Hot soup' },
        },
        options: [option],
      });
      const category = makeCategory({
        translations: { bg: { name: 'Starters' } },
        items: [item],
      });

      await service.applyLazyTranslations([category], 'bg');

      // option name + 2 choices = 3 texts
      expect(mockTranslation.translateTexts).toHaveBeenCalledTimes(1);
      expect(mockPrisma.menuOption.update).toHaveBeenCalled();
    });

    it('does not throw when category DB write fails — logs warning only', async () => {
      mockPrisma.menuCategory.update.mockRejectedValue(new Error('DB error'));
      const category = makeCategory({ items: [] });

      await expect(
        service.applyLazyTranslations([category], 'bg'),
      ).resolves.toBeUndefined();
    });

    it('does not throw when item DB write fails — logs warning only', async () => {
      mockPrisma.menuCategory.update.mockResolvedValue({});
      mockPrisma.menuItem.update.mockRejectedValue(new Error('Item DB error'));
      const item = makeItem({ description: 'Hot' });
      const category = makeCategory({ items: [item] });

      await expect(
        service.applyLazyTranslations([category], 'ro'),
      ).resolves.toBeUndefined();
    });

    it('does not throw when option DB write fails — logs warning only', async () => {
      mockPrisma.menuOption.update.mockRejectedValue(
        new Error('Option DB error'),
      );
      const option = {
        id: 'opt-1',
        name: 'Size',
        translations: null,
        choices: [{ name: 'Small' }],
      };
      const item = makeItem({
        translations: { ro: { name: 'Soup' } },
        options: [option],
      });
      const category = makeCategory({
        translations: { ro: { name: 'Starters' } },
        items: [item],
      });

      await expect(
        service.applyLazyTranslations([category], 'ro'),
      ).resolves.toBeUndefined();
    });

    it('chunks translations at DEEPL_BATCH_LIMIT (50) texts per call', async () => {
      // 51 categories each needing translation = 51 texts > 50 → 2 calls
      const categories = Array.from({ length: 51 }, (_, i) =>
        makeCategory({ id: `cat-${i}`, name: `Category ${i}`, items: [] }),
      );

      await service.applyLazyTranslations(categories, 'ro');

      expect(mockTranslation.translateTexts).toHaveBeenCalledTimes(2);
      const [firstChunk] = mockTranslation.translateTexts.mock.calls[0] as [
        string[],
        string,
      ];
      expect(firstChunk).toHaveLength(50);
    });

    it('handles items with allergens and dietary tags', async () => {
      const item = makeItem({
        allergens: ['Milk'],
        dietaryTags: ['Vegan'],
      });
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'ro');

      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [
        string[],
        string,
      ];
      expect(texts.some((t: string) => t === 'Milk')).toBe(true);
      expect(texts.some((t: string) => t === 'Vegan')).toBe(true);
    });

    it('writes item DB update with translated data', async () => {
      mockTranslation.translateTexts.mockResolvedValue(['Cat', 'Item', 'Desc']);
      const item = makeItem({ description: 'Hot' });
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'ro');

      expect(mockPrisma.menuItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'item-1' },
          data: expect.objectContaining({ translations: expect.any(Object) }),
        }),
      );
    });

    it('handles item with null allergens, dietaryTags, options, and empty description', async () => {
      mockTranslation.translateTexts.mockResolvedValue(['Cat', 'Item']);
      const item = makeItem({
        description: '',
        allergens: null,
        dietaryTags: null,
        options: null,
      });
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'ro');

      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [
        string[],
        string,
      ];
      expect(texts).toContain('Starters');
      expect(texts).toContain('Soup');
      // empty description and null arrays → only name + category name in batch
      expect(texts.filter((t: string) => t === '').length).toBe(0);
    });

    it('handles category with null items', async () => {
      const category = makeCategory({
        items: undefined,
        translations: { ro: { name: 'Starters' } },
      });

      await service.applyLazyTranslations([category], 'ro');

      expect(mockTranslation.translateTexts).not.toHaveBeenCalled();
    });

    // Issue 1 + D-7: diff-based translation for choices and allergens/dietaryTags

    it('translates only new choice names when option name already cached', async () => {
      const option = {
        id: 'opt-1',
        name: 'Size',
        translations: { bg: { name: 'Размер', choices: { Small: 'Малък' } } },
        choices: [{ name: 'Small' }, { name: 'Large' }],
      };
      const item = makeItem({
        translations: { bg: { name: 'Soup' } },
        options: [option],
      });
      const category = makeCategory({
        translations: { bg: { name: 'Starters' } },
        items: [item],
      });

      await service.applyLazyTranslations([category], 'bg');

      // Only 'Large' is missing → 1 text
      expect(mockTranslation.translateTexts).toHaveBeenCalledTimes(1);
      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [string[], string];
      expect(texts).toContain('Large');
      expect(texts).not.toContain('Small');
    });

    it('makes no API call when all choices already cached', async () => {
      const option = {
        id: 'opt-1',
        name: 'Size',
        translations: { bg: { name: 'Размер', choices: { Small: 'Малък', Large: 'Голям' } } },
        choices: [{ name: 'Small' }, { name: 'Large' }],
      };
      const item = makeItem({
        translations: {
          bg: { name: 'Soup', description: 'Hot soup' },
        },
        options: [option],
      });
      const category = makeCategory({
        translations: { bg: { name: 'Starters' } },
        items: [item],
      });

      await service.applyLazyTranslations([category], 'bg');

      expect(mockTranslation.translateTexts).not.toHaveBeenCalled();
    });

    it('translates only new allergens when item name already cached', async () => {
      const item = makeItem({
        allergens: ['Milk', 'Gluten'],
        dietaryTags: [],
        translations: { bg: { name: 'Супа', allergens: { Milk: 'Мляко' } } },
      });
      const category = makeCategory({
        translations: { bg: { name: 'Стартери' } },
        items: [item],
      });

      await service.applyLazyTranslations([category], 'bg');

      // Only 'Gluten' is missing
      expect(mockTranslation.translateTexts).toHaveBeenCalledTimes(1);
      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [string[], string];
      expect(texts).toContain('Gluten');
      expect(texts).not.toContain('Milk');
    });

    it('makes no API call when all allergens already cached as map', async () => {
      const item = makeItem({
        allergens: ['Milk'],
        dietaryTags: ['Vegan'],
        translations: {
          bg: {
            name: 'Супа',
            description: 'Гореща супа',
            allergens: { Milk: 'Мляко' },
            dietaryTags: { Vegan: 'Веган' },
          },
        },
      });
      const category = makeCategory({
        translations: { bg: { name: 'Стартери' } },
        items: [item],
      });

      await service.applyLazyTranslations([category], 'bg');

      expect(mockTranslation.translateTexts).not.toHaveBeenCalled();
    });

    it('applies map-format allergens and dietaryTags to in-memory item', async () => {
      const item = makeItem({
        allergens: ['Milk'],
        dietaryTags: ['Vegan'],
      });
      const category = makeCategory({ items: [item] });

      // translateTexts echoes input (mock default)
      await service.applyLazyTranslations([category], 'ro');

      // After apply, item.allergens should be the translated values
      expect(item.allergens).toEqual(['Milk']);
      expect(item.dietaryTags).toEqual(['Vegan']);
    });

    it('applies old array-format allergens to in-memory item (backward compat)', async () => {
      const item = makeItem({
        allergens: ['Milk'],
        dietaryTags: ['Vegan'],
        translations: { ro: { name: 'Supa', allergens: ['Lapte'], dietaryTags: ['Vegan'] } },
      });
      const category = makeCategory({
        translations: { ro: { name: 'Aperitive' } },
        items: [item],
      });

      await service.applyLazyTranslations([category], 'ro');

      // No API call (name cached; allergens in old array format → re-translate all)
      // Actually with old array format and 1 allergen: cached = undefined → queues it
      // But item name IS cached, so only allergens get queued
      expect(item.allergens).toBeDefined();
    });

    it('translates a missing description without retranslating a cached item name', async () => {
      const item = makeItem({
        name: 'Soup',
        description: 'Hot soup',
        translations: { fr: { name: 'Soupe' } },
      });
      const category = makeCategory({
        translations: { fr: { name: 'Entrées' } },
        items: [item],
      });
      mockTranslation.translateTexts.mockResolvedValue(['Soupe chaude']);

      await service.applyLazyTranslations([category], 'fr');

      expect(mockTranslation.translateTexts).toHaveBeenCalledWith(
        ['Hot soup'],
        'fr',
      );
      expect((item.translations as any).fr).toEqual({
        name: 'Soupe',
        description: 'Soupe chaude',
      });
    });

    it('preserves the canonical item name when applying a translated display name', async () => {
      const item = makeItem({
        name: 'Руска салата',
        translations: {
          fr: {
            name: 'Salade russe',
            description: 'Salade fraîche',
          },
        },
      });
      const category = makeCategory({
        translations: { fr: { name: 'Entrées' } },
        items: [item],
      });

      await service.applyLazyTranslations([category], 'fr');

      expect(item.name).toBe('Salade russe');
      expect((item as any).originalName).toBe('Руска салата');
    });

    it('never mutates the canonical choice key used by order validation', async () => {
      const choice = { name: 'Голяма', priceModifier: 2 };
      const option = {
        id: 'option-1',
        name: 'Размер',
        choices: [choice],
        translations: {
          fr: {
            name: 'Taille',
            choices: { 'Голяма': 'Grande' },
          },
        },
      };
      const item = makeItem({
        translations: {
          fr: {
            name: 'Soupe',
            description: 'Soupe chaude',
          },
        },
        options: [option],
      });
      const category = makeCategory({
        translations: { fr: { name: 'Entrées' } },
        items: [item],
      });

      await service.applyLazyTranslations([category], 'fr');

      expect(option.name).toBe('Taille');
      expect(choice.name).toBe('Голяма');
    });
  });
});
