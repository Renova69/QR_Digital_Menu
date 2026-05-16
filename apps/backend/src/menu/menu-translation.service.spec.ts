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
          makeItem({ translations: { en: { name: 'Soup' } } }),
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
          data: expect.objectContaining({ translations: expect.objectContaining({ bg: { name: 'Starters BG' } }) }),
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
      mockTranslation.translateTexts.mockResolvedValue(['Начала', 'Супа', 'Горещ']);
      const item = makeItem({ description: 'Hot' });
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'bg');

      // category name + item name + description = 3 texts, one call
      expect(mockTranslation.translateTexts).toHaveBeenCalledTimes(1);
      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [string[], string];
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
      const item = makeItem({ translations: { bg: { name: 'Soup' } }, options: [option] });
      const category = makeCategory({
        translations: { bg: { name: 'Starters' } },
        items: [item],
      });

      await service.applyLazyTranslations([category], 'bg');

      // option name + 2 choices = 3 texts
      expect(mockTranslation.translateTexts).toHaveBeenCalledTimes(1);
      expect(mockPrisma.menuOption.update).toHaveBeenCalled();
    });

    it('does not throw when DB write fails — logs warning only', async () => {
      mockPrisma.menuCategory.update.mockRejectedValue(new Error('DB error'));
      const category = makeCategory({ items: [] });

      await expect(service.applyLazyTranslations([category], 'bg')).resolves.toBeUndefined();
    });

    it('chunks translations at DEEPL_BATCH_LIMIT (50) texts per call', async () => {
      // 51 categories each needing translation = 51 texts > 50 → 2 calls
      const categories = Array.from({ length: 51 }, (_, i) =>
        makeCategory({ id: `cat-${i}`, name: `Category ${i}`, items: [] }),
      );

      await service.applyLazyTranslations(categories, 'ro');

      expect(mockTranslation.translateTexts).toHaveBeenCalledTimes(2);
      const [firstChunk] = mockTranslation.translateTexts.mock.calls[0] as [string[], string];
      expect(firstChunk).toHaveLength(50);
    });

    it('handles items with allergens and dietary tags', async () => {
      const item = makeItem({
        allergens: ['Milk'],
        dietaryTags: ['Vegan'],
      });
      const category = makeCategory({ items: [item] });

      await service.applyLazyTranslations([category], 'ro');

      const [texts] = mockTranslation.translateTexts.mock.calls[0] as [string[], string];
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
  });
});
