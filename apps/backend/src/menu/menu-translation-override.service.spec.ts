import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { MenuTranslationOverrideService } from './menu-translation-override.service';

interface MockPrisma {
  menuItem: { findFirst: jest.Mock };
  menuTranslationState: { findMany: jest.Mock };
  $executeRaw: jest.Mock;
  $transaction: jest.Mock;
}

describe('MenuTranslationOverrideService', () => {
  let service: MenuTranslationOverrideService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = {
      menuItem: { findFirst: jest.fn() },
      menuTranslationState: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (operation: (transaction: MockPrisma) => unknown) => operation(prisma),
    );
    service = new MenuTranslationOverrideService(
      prisma as unknown as PrismaService,
    );
  });

  it('returns independent name and description state for each target language', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({
      id: 'item-1',
      name: 'Джин Beefeater',
      description: 'Лондонски сух джин',
      translations: {
        en: { name: 'Beefeater Gin', description: 'London dry gin' },
        de: {},
      },
      category: {
        restaurantId: 'rest-1',
        restaurant: { menuSourceLanguage: 'bg', targetLanguages: ['en', 'de'] },
      },
    });
    prisma.menuTranslationState.findMany.mockResolvedValue([
      {
        field: 'DESCRIPTION',
        locale: 'en',
        status: 'MANUAL',
        sourceHash: 'hash-of-the-description',
      },
    ]);

    const result = await service.getForItem('item-1', 'user-1');

    expect(prisma.menuItem.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'item-1',
          category: {
            restaurant: {
              OR: [
                { ownerId: 'user-1' },
                {
                  staffMembers: {
                    some: { id: 'user-1', role: 'MANAGER' },
                  },
                },
              ],
              isActive: true,
              deletedAt: null,
            },
          },
        },
      }),
    );
    expect(result.sourceLang).toBe('bg');
    expect(result.source).toEqual({
      name: 'Джин Beefeater',
      description: 'Лондонски сух джин',
    });
    expect(result.locales).toEqual([
      {
        locale: 'en',
        name: {
          value: 'Beefeater Gin',
          status: 'CURRENT',
          sourceChanged: false,
        },
        description: {
          value: 'London dry gin',
          status: 'MANUAL',
          sourceChanged: true,
        },
      },
      {
        locale: 'de',
        name: { value: null, status: 'CURRENT', sourceChanged: false },
        description: {
          value: null,
          status: 'CURRENT',
          sourceChanged: false,
        },
      },
    ]);
  });

  it('excludes the source language from the editable list', async () => {
    prisma.menuItem.findFirst.mockResolvedValue({
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
    prisma.menuItem.findFirst.mockResolvedValue({
      id: 'item-1',
      name: 'Джин Beefeater Reserve',
      translations: { en: { name: 'Beefeater Gin' } },
      category: {
        restaurantId: 'rest-1',
        restaurant: { menuSourceLanguage: 'bg', targetLanguages: ['en'] },
      },
    });
    prisma.menuTranslationState.findMany.mockResolvedValue([
      {
        field: 'NAME',
        locale: 'en',
        status: 'MANUAL',
        sourceHash: 'hash-of-the-old-name',
      },
    ]);

    const result = await service.getForItem('item-1', 'user-1');

    expect(result.locales[0].name).toMatchObject({
      status: 'MANUAL',
      sourceChanged: true,
    });
  });

  it('throws NotFoundException for a missing item', async () => {
    prisma.menuItem.findFirst.mockResolvedValue(null);

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
      prisma.menuItem.findFirst.mockResolvedValue({
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
      await service.setOverride(
        'item-1',
        'NAME',
        'en',
        'Beefeater Gin',
        'user-1',
      );

      const sql = executedSql();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(sql).toContain('jsonb_set');
      expect(sql).toContain('jsonb_build_object');
      expect(sql).toContain('"menu_item"');
      expect(sql).toContain('category."restaurantId"');
      expect(executedValues()).toContain('rest-1');
    });

    it('rolls back when the item leaves the authorized restaurant before the write', async () => {
      prisma.$executeRaw.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

      await expect(
        service.setOverride('item-1', 'NAME', 'en', 'Beefeater Gin', 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks the queue row MANUAL so the worker leaves it alone', async () => {
      await service.setOverride(
        'item-1',
        'NAME',
        'en',
        'Beefeater Gin',
        'user-1',
      );

      const sql = executedSql();
      expect(sql).toContain('menu_translation_state');
      expect(executedValues()).toContain('MANUAL');
    });

    it('locks the state row before writing item JSON so an in-flight worker cannot overtake the owner', async () => {
      await service.setOverride(
        'item-1',
        'NAME',
        'en',
        'Beefeater Gin',
        'user-1',
      );

      const statements = prisma.$executeRaw.mock.calls.map(
        (call: unknown[]) => {
          const [query] = call;
          if (Array.isArray(query)) return query.join('');
          const strings = (query as { strings?: unknown } | null)?.strings;
          return Array.isArray(strings) ? strings.join('') : '';
        },
      );

      expect(statements[0]).toContain('menu_translation_state');
      expect(statements[1]).toContain('menu_item');
    });

    it('writes a description override to its own JSON key and queue field', async () => {
      await service.setOverride(
        'item-1',
        'DESCRIPTION',
        'en',
        'Classic London dry gin',
        'user-1',
      );

      expect(executedValues()).toEqual(
        expect.arrayContaining([
          'description',
          'DESCRIPTION',
          'Classic London dry gin',
          'MANUAL',
        ]),
      );
    });

    it('rejects a locale that is not a configured target', async () => {
      await expect(
        service.setOverride('item-1', 'NAME', 'fr', 'Gin', 'user-1'),
      ).rejects.toThrow(/not a configured target language/i);
    });

    it('rejects the source language', async () => {
      await expect(
        service.setOverride('item-1', 'NAME', 'bg', 'Джин', 'user-1'),
      ).rejects.toThrow(/not a configured target language/i);
    });

    it('clearing an override returns the row to STALE so it gets retranslated', async () => {
      await service.setOverride('item-1', 'NAME', 'en', null, 'user-1');

      expect(executedValues()).toContain('STALE');
      expect(executedValues()).not.toContain('MANUAL');
    });
  });
});
