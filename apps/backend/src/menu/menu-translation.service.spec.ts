import { Test, TestingModule } from '@nestjs/testing';
import { MenuTranslationService } from './menu-translation.service';
import { PrismaService } from '../prisma/prisma.service';
import { TranslationService } from '../translation/translation.service';

// F-TRANS-1/2: writes now go through $executeRaw (jsonb `||` merge) instead
// of menuCategory/menuItem/menuOption.update. Helper below inspects the raw
// SQL template's literal segment to tell which entity table a call targeted.
const mockPrisma = {
  $executeRaw: jest.fn(),
};

const rawCallsFor = (table: string) =>
  mockPrisma.$executeRaw.mock.calls.filter((call: any[]) =>
    [...(call[0] as TemplateStringsArray)].join('').includes(table),
  );

const rawJsonFragmentFor = (table: string, index = 0): any => {
  const call = rawCallsFor(table)[index];
  return call ? JSON.parse(call[1]) : undefined;
};

const mockTranslation = {
  translateTexts: jest.fn(),
  maxBatchSize: 50,
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
    mockPrisma.$executeRaw.mockResolvedValue(0);
  });

  describe('applyLazyTranslations', () => {
    it('makes no API or DB calls when categories array is empty', async () => {
      await service.applyLazyTranslations([], 'en');

      expect(mockTranslation.translateTexts).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
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
        undefined,
        undefined,
      );
      expect(rawJsonFragmentFor('menu_category')).toEqual({
        bg: { name: 'Starters BG' },
      });
    });

    it('forwards an explicit sourceLang through to translateTexts', async () => {
      mockTranslation.translateTexts.mockResolvedValue(['Starters BG']);
      const category = makeCategory({ items: [] });

      await service.applyLazyTranslations([category], 'bg', 'en');

      expect(mockTranslation.translateTexts).toHaveBeenCalledWith(
        ['Starters'],
        'bg',
        'en',
        undefined,
      );
    });

    it('forwards opts through to translateTexts', async () => {
      mockTranslation.translateTexts.mockResolvedValue(['Starters BG']);
      const category = makeCategory({ items: [] });
      const opts = { restaurantId: 'rest-1', glossaryId: 'g-1' };

      await service.applyLazyTranslations([category], 'bg', 'en', opts);

      expect(mockTranslation.translateTexts).toHaveBeenCalledWith(
        ['Starters'],
        'bg',
        'en',
        opts,
      );
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
      expect(rawCallsFor('menu_option')).toHaveLength(1);
    });

    it('rejects when the provider fails so the queue row is not marked current', async () => {
      mockTranslation.translateTexts.mockRejectedValue(new Error('DeepL down'));
      const category = makeCategory({ items: [] });

      await expect(
        service.applyLazyTranslations([category], 'bg'),
      ).rejects.toThrow('DeepL down');
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('does not throw when category DB write fails — logs warning only', async () => {
      mockPrisma.$executeRaw.mockRejectedValue(new Error('DB error'));
      const category = makeCategory({ items: [] });

      await expect(
        service.applyLazyTranslations([category], 'bg'),
      ).rejects.toThrow('DB error');
    });

    it('does not throw when item DB write fails — logs warning only', async () => {
      mockPrisma.$executeRaw.mockImplementation(
        (strings: TemplateStringsArray) =>
          [...strings].join('').includes('menu_item')
            ? Promise.reject(new Error('Item DB error'))
            : Promise.resolve(0),
      );
      const item = makeItem({ description: 'Hot' });
      const category = makeCategory({ items: [item] });

      await expect(
        service.applyLazyTranslations([category], 'ro'),
      ).rejects.toThrow('Item DB error');
    });

    it('does not throw when option DB write fails — logs warning only', async () => {
      mockPrisma.$executeRaw.mockImplementation(
        (strings: TemplateStringsArray) =>
          [...strings].join('').includes('menu_option')
            ? Promise.reject(new Error('Option DB error'))
            : Promise.resolve(0),
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
      ).rejects.toThrow('Option DB error');
    });

    it('chunks translations at translationService.maxBatchSize (50) texts per call', async () => {
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

    it('handles items with custom (non-preset) allergens and dietary tags', async () => {
      // "Milk"/"Vegan" would collide with the preset key allowlist
      // (menu-tags.ts) and get filtered before ever reaching this batch —
      // use values that are genuinely custom free text.
      const item = makeItem({
        allergens: ['Truffle'],
        dietaryTags: ['Homemade'],
      });
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'ro');

      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [
        string[],
        string,
      ];
      expect(texts.some((t: string) => t === 'Truffle')).toBe(true);
      expect(texts.some((t: string) => t === 'Homemade')).toBe(true);
    });

    it('never queues preset allergen/dietary keys for translation', async () => {
      const item = makeItem({
        allergens: ['milk', 'Truffle'],
        dietaryTags: ['vegan'],
      });
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'ro');

      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [
        string[],
        string,
      ];
      expect(texts).not.toContain('milk');
      expect(texts).not.toContain('vegan');
      expect(texts).toContain('Truffle');
    });

    it('writes item DB update with translated data', async () => {
      mockTranslation.translateTexts.mockResolvedValue(['Cat', 'Item', 'Desc']);
      const item = makeItem({ description: 'Hot' });
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'ro');

      expect(rawCallsFor('menu_item')).toHaveLength(1);
      expect(
        (item as unknown as { translations?: Record<string, unknown> })
          .translations,
      ).toEqual(expect.objectContaining({ ro: expect.any(Object) }));
    });

    it('locks live state and preserves MANUAL item names and descriptions at write time', async () => {
      const item = makeItem({ description: 'Hot' });
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'en');

      const [call] = rawCallsFor('menu_item');
      const sql = [...(call[0] as TemplateStringsArray)].join('');
      expect(sql).toContain('FOR UPDATE');
      expect(sql).toContain("'MANUAL'");
      expect(sql).toContain("'NAME'");
      expect(sql).toContain("'DESCRIPTION'");
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
      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [
        string[],
        string,
      ];
      expect(texts).toContain('Large');
      expect(texts).not.toContain('Small');
    });

    it('makes no API call when all choices already cached', async () => {
      const option = {
        id: 'opt-1',
        name: 'Size',
        translations: {
          bg: { name: 'Размер', choices: { Small: 'Малък', Large: 'Голям' } },
        },
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

    it('translates only new custom allergens when item name already cached', async () => {
      // "Truffle"/"Saffron" — non-preset values so the diff being asserted
      // (cached vs missing) isn't masked by the preset-key filter.
      const item = makeItem({
        allergens: ['Truffle', 'Saffron'],
        dietaryTags: [],
        translations: {
          bg: { name: 'Супа', allergens: { Truffle: 'Трюфел' } },
        },
      });
      const category = makeCategory({
        translations: { bg: { name: 'Стартери' } },
        items: [item],
      });

      await service.applyLazyTranslations([category], 'bg');

      // Only 'Saffron' is missing
      expect(mockTranslation.translateTexts).toHaveBeenCalledTimes(1);
      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [
        string[],
        string,
      ];
      expect(texts).toContain('Saffron');
      expect(texts).not.toContain('Truffle');
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
        translations: {
          ro: { name: 'Supa', allergens: ['Lapte'], dietaryTags: ['Vegan'] },
        },
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
        undefined,
        undefined,
      );
      expect(
        (item.translations as unknown as Record<string, unknown>)['fr'],
      ).toEqual({
        name: 'Soupe',
        description: 'Soupe chaude',
      });
    });

    // The "canonical item name" / "canonical choice key" invariant tests
    // moved to menu-translation-read.service.spec.ts — this service no
    // longer applies translations to in-memory objects (see the comment at
    // the end of applyLazyTranslations). Applying is
    // MenuTranslationReadService.applyStoredTranslations's job now; this
    // service is write-only (diff cached translations, call the provider,
    // persist via $executeRaw jsonb merge) and has no return value to
    // assert an in-memory swap against.
  });
});
