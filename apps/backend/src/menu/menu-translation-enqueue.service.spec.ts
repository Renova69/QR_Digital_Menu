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
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
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
  });

  describe('enqueueItem', () => {
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
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
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
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(3);
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
      // 2 fields x 3 locales = 6
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(6);
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
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });
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
