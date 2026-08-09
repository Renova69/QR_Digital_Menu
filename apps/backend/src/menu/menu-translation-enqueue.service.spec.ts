import { Test, TestingModule } from '@nestjs/testing';
import { MenuTranslationEnqueueService } from './menu-translation-enqueue.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  $executeRaw: jest.fn().mockResolvedValue(1),
};

describe('MenuTranslationEnqueueService', () => {
  let service: MenuTranslationEnqueueService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.$executeRaw.mockResolvedValue(1);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MenuTranslationEnqueueService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<MenuTranslationEnqueueService>(
      MenuTranslationEnqueueService,
    );
  });

  describe('enqueueCategory', () => {
    it('upserts one state row per locale for NAME', async () => {
      await service.enqueueCategory(
        'rest-1',
        { id: 'cat-1', name: 'Мезета' },
        ['en', 'de'],
        'bg',
      );
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('attaches Translate All queue units to their explicit run', async () => {
      await service.enqueueCategory(
        'rest-1',
        { id: 'cat-1', name: 'Нова категория' },
        ['en'],
        'bg',
        'run-1',
      );

      const query = mockPrisma.$executeRaw.mock.calls[0][0] as {
        strings: readonly string[];
        values: unknown[];
      };
      expect(query.strings.join(' ')).toContain('"runId"');
      expect(query.values).toContain('run-1');
    });

    it('does not throw when the DB write fails', async () => {
      mockPrisma.$executeRaw.mockRejectedValue(new Error('DB down'));
      await expect(
        service.enqueueCategory(
          'rest-1',
          { id: 'cat-1', name: 'X' },
          ['en'],
          'bg',
        ),
      ).resolves.toBeUndefined();
    });

    it('inserts a missing state row as CURRENT when a valid cached translation already exists', async () => {
      await service.enqueueCategory(
        'rest-1',
        {
          id: 'cat-1',
          name: 'Супи',
          translations: { en: { name: 'Soups' } },
        },
        ['en'],
        'bg',
      );

      const query = mockPrisma.$executeRaw.mock.calls[0][0] as {
        values: unknown[];
      };
      expect(query.values).toContain('CURRENT');
      expect(query.values).not.toContain('STALE');
    });

    it('converges an existing failed or review state to CURRENT when its cached translation is now valid', async () => {
      await service.enqueueCategory(
        'rest-1',
        {
          id: 'cat-1',
          name: 'Супи',
          translations: { en: { name: 'Soups' } },
        },
        ['en'],
        'bg',
      );

      const query = mockPrisma.$executeRaw.mock.calls[0][0] as {
        strings: readonly string[];
      };
      const sql = query.strings.join(' ');
      expect(sql).toContain(
        'WHEN "menu_translation_state"."sourceLang" <> EXCLUDED."sourceLang" THEN \'STALE\'',
      );
      expect(sql).toContain("ELSE 'CURRENT'");
    });
  });

  describe('enqueueItem', () => {
    it('runs good-cache and forced-refresh upserts sequentially to avoid connection-pool bursts', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      mockPrisma.$executeRaw.mockImplementation(async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
        return 1;
      });

      await service.enqueueItem(
        'rest-1',
        {
          id: 'item-1',
          name: 'Soup',
          description: 'Fresh daily',
          translations: { en: { name: 'Soup' } },
        },
        ['en'],
        'bg',
      );

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
      expect(maxInFlight).toBe(1);
    });

    it('enqueues NAME only when description/allergens/tags are absent', async () => {
      await service.enqueueItem(
        'rest-1',
        { id: 'item-1', name: 'Кебапче' },
        ['en'],
        'bg',
      );
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('enqueues NAME + DESCRIPTION when description is present', async () => {
      await service.enqueueItem(
        'rest-1',
        { id: 'item-1', name: 'Кебапче', description: 'С месо' },
        ['en'],
        'bg',
      );
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('skips preset allergen/dietary keys entirely', async () => {
      await service.enqueueItem(
        'rest-1',
        {
          id: 'item-1',
          name: 'X',
          allergens: ['gluten', 'milk'],
          dietaryTags: ['vegan'],
        },
        ['en'],
        'bg',
      );
      // Only NAME — all allergens/tags are preset keys, so ALLERGENS/DIETARY_TAGS
      // are never enqueued.
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('enqueues ALLERGENS/DIETARY_TAGS only for genuinely custom values', async () => {
      await service.enqueueItem(
        'rest-1',
        {
          id: 'item-1',
          name: 'X',
          allergens: ['gluten', 'Truffle'],
          dietaryTags: ['Homemade'],
        },
        ['en'],
        'bg',
      );
      // NAME + ALLERGENS (custom "Truffle" present) + DIETARY_TAGS = 3
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('does not enqueue DESCRIPTION for a blank/whitespace-only description', async () => {
      await service.enqueueItem(
        'rest-1',
        { id: 'item-1', name: 'X', description: '   ' },
        ['en'],
        'bg',
      );
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('multiplies fields by every requested locale', async () => {
      await service.enqueueItem(
        'rest-1',
        { id: 'item-1', name: 'X', description: 'Y' },
        ['en', 'de', 'fr'],
        'bg',
      );
      // All six state rows are written in one database round-trip.
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('enqueueOption', () => {
    it('enqueues NAME only when there are no choices', async () => {
      await service.enqueueOption(
        'rest-1',
        { id: 'opt-1', name: 'Size' },
        ['en'],
        'bg',
      );
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('enqueues NAME + CHOICES when choices are present', async () => {
      await service.enqueueOption(
        'rest-1',
        {
          id: 'opt-1',
          name: 'Size',
          choices: [{ name: 'Small' }, { name: 'Large' }],
        },
        ['en'],
        'bg',
      );
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  it('deduplicates locales and never queues the source language', async () => {
    await service.enqueueCategory(
      'rest-1',
      { id: 'cat-1', name: 'Мезета' },
      ['bg', 'en', 'en'],
      'bg',
    );

    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    const values = (
      mockPrisma.$executeRaw.mock.calls[0][0] as { values: unknown[] }
    ).values;
    expect(values.filter((value) => value === 'en')).toHaveLength(1);
  });

  it('marks a row stale when its source language changes', async () => {
    await service.enqueueCategory(
      'rest-1',
      {
        id: 'cat-1',
        name: 'Starters',
        translations: { bg: { name: 'Предястия' } },
      },
      ['bg'],
      'en',
    );

    const query = mockPrisma.$executeRaw.mock.calls[0][0] as {
      strings: readonly string[];
    };
    expect(query.strings.join(' ')).toContain(
      '"menu_translation_state"."sourceLang" <> EXCLUDED."sourceLang"',
    );
  });

  it('preserves NEEDS_REVIEW for the same source instead of forcing an endless retry loop', async () => {
    await service.enqueueCategory(
      'rest-1',
      {
        id: 'cat-1',
        name: 'Луканка',
        translations: { en: { name: 'Луканка' } },
      },
      ['en'],
      'bg',
    );

    const query = mockPrisma.$executeRaw.mock.calls[0][0] as {
      strings: readonly string[];
    };
    expect(query.strings.join(' ')).toContain(
      `"menu_translation_state"."status" = 'NEEDS_REVIEW'`,
    );
    expect(query.strings.join(' ')).toContain(
      'THEN "menu_translation_state"."updatedAt" ELSE now() END',
    );
  });

  describe('enqueueBatch', () => {
    it('runs all thunks to completion', async () => {
      const calls: number[] = [];
      const thunks = Array.from({ length: 25 }, (_, i) => async () => {
        calls.push(i);
      });

      await service.enqueueBatch(thunks, 5);

      expect(calls.sort((a, b) => a - b)).toEqual(
        Array.from({ length: 25 }, (_, i) => i),
      );
    });

    it('never runs more than `concurrency` thunks at once', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const thunks = Array.from({ length: 30 }, () => async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await Promise.resolve();
        inFlight--;
      });

      await service.enqueueBatch(thunks, 5);

      expect(maxInFlight).toBeLessThanOrEqual(5);
    });
  });
});
