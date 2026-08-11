import { NotFoundException } from '@nestjs/common';
import { MenuTranslationOverrideService } from './menu-translation-override.service';

describe('MenuTranslationOverrideService', () => {
  let service: MenuTranslationOverrideService;
  let prisma: any;
  let crud: any;

  beforeEach(() => {
    prisma = {
      menuItem: { findUnique: jest.fn() },
      menuTranslationState: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    crud = {
      verifyRestaurantOwnership: jest
        .fn()
        .mockResolvedValue({ id: 'rest-1' }),
    };
    service = new MenuTranslationOverrideService(prisma, crud);
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
});
