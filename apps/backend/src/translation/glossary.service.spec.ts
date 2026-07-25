import { Test, TestingModule } from '@nestjs/testing';
import { GlossaryService } from './glossary.service';
import { PrismaService } from '../prisma/prisma.service';

describe('GlossaryService', () => {
  let service: GlossaryService;
  const mockPrisma = {
    glossaryTerm: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GlossaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GlossaryService>(GlossaryService);
  });

  describe('lookupBatch', () => {
    it('returns an empty map for an empty texts array', async () => {
      const result = await service.lookupBatch('bg', [], 'de');
      expect(result.size).toBe(0);
      expect(mockPrisma.glossaryTerm.findMany).not.toHaveBeenCalled();
    });

    it('normalizes text (trim + lowercase) before querying', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([]);

      await service.lookupBatch('bg', ['  Мезета  ', 'СКАРА'], 'de');

      expect(mockPrisma.glossaryTerm.findMany).toHaveBeenCalledWith({
        where: {
          sourceLang: 'bg',
          targetLang: 'de',
          sourceText: { in: ['мезета', 'скара'] },
        },
        select: { sourceText: true, translatedText: true },
      });
    });

    it('dedupes texts that normalize to the same value', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([]);

      await service.lookupBatch('bg', ['Мезета', 'мезета', ' МЕЗЕТА '], 'de');

      expect(mockPrisma.glossaryTerm.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceText: { in: ['мезета'] },
          }),
        }),
      );
    });

    it('returns a map keyed by normalized source text', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([
        { sourceText: 'мезета', translatedText: 'Vorspeisen' },
        { sourceText: 'скара', translatedText: 'Grill' },
      ]);

      const result = await service.lookupBatch('bg', ['Мезета', 'Скара'], 'de');

      expect(result.get('мезета')).toBe('Vorspeisen');
      expect(result.get('скара')).toBe('Grill');
      expect(result.size).toBe(2);
    });

    it('omits texts with no glossary match (miss returns absent, not undefined entry)', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([
        { sourceText: 'мезета', translatedText: 'Vorspeisen' },
      ]);

      const result = await service.lookupBatch(
        'bg',
        ['Мезета', 'Уникално ястие'],
        'de',
      );

      expect(result.has('мезета')).toBe(true);
      expect(result.has('уникално ястие')).toBe(false);
      expect(result.size).toBe(1);
    });
  });
});
