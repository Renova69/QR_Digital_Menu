import { MenuTranslationReadService } from './menu-translation-read.service';

// No TestingModule / Prisma / TranslationService mocks anywhere in this file
// on purpose — MenuTranslationReadService takes no constructor dependencies
// at all. That absence IS the thing under test: the public menu read path
// (menu-crud.service.ts) can only reach this service, so it is structurally
// impossible for a public GET to trigger a provider call or a DB write.

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

describe('MenuTranslationReadService', () => {
  let service: MenuTranslationReadService;

  beforeEach(() => {
    service = new MenuTranslationReadService();
  });

  describe('applyStoredTranslations', () => {
    it('is a no-op for an empty categories array', () => {
      expect(() => service.applyStoredTranslations([], 'bg')).not.toThrow();
    });

    it('leaves a category name untouched when no cached translation exists for the locale', () => {
      const category = makeCategory({ items: [] });

      service.applyStoredTranslations([category], 'fr');

      expect(category.name).toBe('Starters');
      expect(
        (category as { originalName?: string }).originalName,
      ).toBeUndefined();
    });

    it('swaps category name from the cached translation and records originalName', () => {
      const category = makeCategory({
        translations: { bg: { name: 'Предястия' } },
        items: [],
      });

      service.applyStoredTranslations([category], 'bg');

      expect(category.name).toBe('Предястия');
      expect((category as { originalName?: string }).originalName).toBe(
        'Starters',
      );
    });

    it('swaps item name and description from the cached translation', () => {
      const item = makeItem({
        translations: {
          fr: { name: 'Soupe', description: 'Soupe chaude' },
        },
      });
      const category = makeCategory({ items: [item] });

      service.applyStoredTranslations([category], 'fr');

      expect(item.name).toBe('Soupe');
      expect(item.description).toBe('Soupe chaude');
      expect((item as { originalName?: string }).originalName).toBe('Soup');
      expect(
        (item as { originalDescription?: string }).originalDescription,
      ).toBe('Hot soup');
    });

    it('applies description independently when only description is cached', () => {
      const item = makeItem({
        translations: { fr: { description: 'Soupe chaude' } },
      });
      const category = makeCategory({ items: [item] });

      service.applyStoredTranslations([category], 'fr');

      expect(item.name).toBe('Soup');
      expect(item.description).toBe('Soupe chaude');
    });

    it('swaps option name from the cached translation', () => {
      const option = { id: 'opt-1', name: 'Size', translations: null as any };
      const item = makeItem({
        options: [{ ...option, translations: { fr: { name: 'Taille' } } }],
      });
      const category = makeCategory({ items: [item] });

      service.applyStoredTranslations([category], 'fr');

      const [swappedOption] = item.options as unknown as Array<{
        name: string;
        originalName?: string;
      }>;
      expect(swappedOption.name).toBe('Taille');
      expect(swappedOption.originalName).toBe('Size');
    });

    // Invariant guard — moved verbatim from menu-translation.service.spec.ts
    // (Phase 4 of the old combined applyLazyTranslations). Do not change
    // this behavior: item.name is a display field but item.allergens /
    // item.dietaryTags are read by the menu-tags preset icon lookup on the
    // RAW stored value, so they must never be swapped to translated text.
    it('never swaps item.allergens or item.dietaryTags to translated text', () => {
      const item = makeItem({
        allergens: ['Milk'],
        dietaryTags: ['Vegan'],
        translations: {
          fr: {
            name: 'Soupe',
            allergens: { Milk: 'Lait' },
            dietaryTags: { Vegan: 'Végane' },
          },
        },
      });
      const category = makeCategory({ items: [item] });

      service.applyStoredTranslations([category], 'fr');

      expect(item.allergens).toEqual(['Milk']);
      expect(item.dietaryTags).toEqual(['Vegan']);
    });

    // Invariant guard — moved verbatim (see menu-translation.service.ts's
    // comment on choice.name). orders.service.ts validates a selected
    // choice by exact match against choice.name; overwriting it with a
    // translated label would break order placement in every non-source
    // locale.
    it('preserves the canonical item name and never mutates the canonical choice key used by order validation', () => {
      const choice = { name: 'Голяма', priceModifier: 2 };
      const option = {
        id: 'option-1',
        name: 'Размер',
        choices: [choice],
        translations: {
          fr: { name: 'Taille', choices: { Голяма: 'Grande' } },
        },
      };
      const item = makeItem({
        name: 'Руска салата',
        translations: {
          fr: { name: 'Salade russe', description: 'Salade fraîche' },
        },
        options: [option],
      });
      const category = makeCategory({
        translations: { fr: { name: 'Entrées' } },
        items: [item],
      });

      service.applyStoredTranslations([category], 'fr');

      expect(item.name).toBe('Salade russe');
      expect((item as { originalName?: string }).originalName).toBe(
        'Руска салата',
      );
      expect(option.name).toBe('Taille');
      expect(choice.name).toBe('Голяма');
    });

    it('does not clobber an already-set originalName on a second call (idempotent ??=)', () => {
      const item = makeItem({
        translations: { fr: { name: 'Soupe' } },
      });
      const category = makeCategory({ items: [item] });

      service.applyStoredTranslations([category], 'fr');
      service.applyStoredTranslations([category], 'fr');

      expect((item as { originalName?: string }).originalName).toBe('Soup');
    });

    it('handles a category with no items and an item with no options without throwing', () => {
      const category = makeCategory({
        translations: { bg: { name: 'Предястия' } },
        items: [makeItem({ options: undefined as any })],
      });

      expect(() =>
        service.applyStoredTranslations([category], 'bg'),
      ).not.toThrow();
    });
  });
});
