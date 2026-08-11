import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { MenuCrudService } from './menu-crud.service';
import { MenuTranslationOverrideService } from './menu-translation-override.service';

interface MockPrisma {
  menuItem: { findUnique: jest.Mock };
  menuTranslationState: { findMany: jest.Mock };
  $executeRaw: jest.Mock;
  $transaction: jest.Mock;
}

interface MockCrud {
  verifyRestaurantOwnership: jest.Mock;
}

describe('MenuTranslationOverrideService', () => {
  let service: MenuTranslationOverrideService;
  let prisma: MockPrisma;
  let crud: MockCrud;

  beforeEach(() => {
    prisma = {
      menuItem: { findUnique: jest.fn() },
      menuTranslationState: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (operation: (transaction: MockPrisma) => unknown) => operation(prisma),
    );
    crud = {
      verifyRestaurantOwnership: jest.fn().mockResolvedValue({ id: 'rest-1' }),
    };
    service = new MenuTranslationOverrideService(
      prisma as unknown as PrismaService,
      crud as unknown as MenuCrudService,
    );
  });

  it('returns one entry per target language, with the stored value', async () => {
    prisma.menuItem.findUnique.mockResolvedValue({
      id: 'item-1',
      name: 'Джин Beefeater',
      translations: { en: { name: 'Beefeater Gin' }, de: {} },
      category: {
        restaurantId: 'rest-1',
        restaurant: { menuSourceLanguage: 'bg', targetLanguages: ['en', 'de'] },
      },
    });

    const result = await service.getForItem('item-1', 'user-1');

    expect(result.sourceLang).toBe('bg');
    expect(result.sourceText).toBe('Джин Beefeater');
    expect(result.locales).toEqual([
      {
        locale: 'en',
        value: 'Beefeater Gin',
        status: 'CURRENT',
        sourceChanged: false,
      },
      { locale: 'de', value: null, status: 'CURRENT', sourceChanged: false },
    ]);
  });

  it('excludes the source language from the editable list', async () => {
    prisma.menuItem.findUnique.mockResolvedValue({
      id: 'item-1',
      name: 'Боб',
      translations: {},
      category: {
        restaurantId: 'rest-1',
        restaurant: { menuSourceLanguage: 'bg', targetLanguages: ['bg', 'en'] },
      },
    });

    const result = await service.getForItem('item-1', 'user-1');

    expect(result.locales.map((locale) => locale.locale)).toEqual(['en']);
  });

  it('flags sourceChanged when a MANUAL row was written against older text', async () => {
    prisma.menuItem.findUnique.mockResolvedValue({
      id: 'item-1',
      name: 'Джин Beefeater Reserve',
      translations: { en: { name: 'Beefeater Gin' } },
      category: {
        restaurantId: 'rest-1',
        restaurant: { menuSourceLanguage: 'bg', targetLanguages: ['en'] },
      },
    });
    prisma.menuTranslationState.findMany.mockResolvedValue([
      { locale: 'en', status: 'MANUAL', sourceHash: 'hash-of-the-old-name' },
    ]);

    const result = await service.getForItem('item-1', 'user-1');

    expect(result.locales[0]).toMatchObject({
      status: 'MANUAL',
      sourceChanged: true,
    });
  });

  it('throws NotFoundException for a missing item', async () => {
    prisma.menuItem.findUnique.mockResolvedValue(null);

    await expect(service.getForItem('nope', 'user-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('setOverride', () => {
    const executedSql = () =>
      prisma.$executeRaw.mock.calls
        .map((call: unknown[]) => {
          const [query] = call;
          if (Array.isArray(query)) return query.join('');

          const strings = (query as { strings?: unknown } | null)?.strings;
          return Array.isArray(strings) ? strings.join('') : '';
        })
        .join('\n');
    const executedValues = () =>
      prisma.$executeRaw.mock.calls.flatMap((call: unknown[]) => call.slice(1));

    beforeEach(() => {
      prisma.menuItem.findUnique.mockResolvedValue({
        id: 'item-1',
        name: 'Джин Beefeater',
        translations: { en: { name: 'Джин Beefeater' } },
        category: {
          restaurantId: 'rest-1',
          restaurant: { menuSourceLanguage: 'bg', targetLanguages: ['en'] },
        },
      });
    });

    it('writes the value atomically and creates missing locale objects', async () => {
      await service.setOverride('item-1', 'en', 'Beefeater Gin', 'user-1');

      const sql = executedSql();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(sql).toContain('jsonb_set');
      expect(sql).toContain('jsonb_build_object');
      expect(sql).toContain('"menu_item"');
    });

    it('marks the queue row MANUAL so the worker leaves it alone', async () => {
      await service.setOverride('item-1', 'en', 'Beefeater Gin', 'user-1');

      const sql = executedSql();
      expect(sql).toContain('menu_translation_state');
      expect(executedValues()).toContain('MANUAL');
    });

    it('rejects a locale that is not a configured target', async () => {
      await expect(
        service.setOverride('item-1', 'fr', 'Gin', 'user-1'),
      ).rejects.toThrow(/not a configured target language/i);
    });

    it('rejects the source language', async () => {
      await expect(
        service.setOverride('item-1', 'bg', 'Джин', 'user-1'),
      ).rejects.toThrow(/not a configured target language/i);
    });

    it('clearing an override returns the row to STALE so it gets retranslated', async () => {
      await service.setOverride('item-1', 'en', null, 'user-1');

      expect(executedValues()).toContain('STALE');
      expect(executedValues()).not.toContain('MANUAL');
    });
  });
});
