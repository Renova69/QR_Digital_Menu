import { Test, TestingModule } from '@nestjs/testing';
import { DeepLGlossaryService } from './deepl-glossary.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('axios', () => {
  const mockGet = jest.fn();
  const mockPost = jest.fn();
  const mockDelete = jest.fn();
  return {
    create: jest.fn(() => ({
      get: mockGet,
      post: mockPost,
      delete: mockDelete,
    })),
    __mockGet: mockGet,
    __mockPost: mockPost,
    __mockDelete: mockDelete,
  };
});

import axios from 'axios';

const mockPrisma = {
  glossaryTerm: { findMany: jest.fn() },
  deepLGlossary: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
};

describe('DeepLGlossaryService', () => {
  let service: DeepLGlossaryService;
  let mockGet: jest.Mock;
  let mockPost: jest.Mock;
  let mockDelete: jest.Mock;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv, DEEPL_API_KEY: 'test-key' };
    jest.clearAllMocks();
    mockGet = (axios as unknown as { __mockGet: jest.Mock }).__mockGet;
    mockPost = (axios as unknown as { __mockPost: jest.Mock }).__mockPost;
    mockDelete = (axios as unknown as { __mockDelete: jest.Mock }).__mockDelete;
    mockDelete.mockResolvedValue({});
    mockPrisma.deepLGlossary.upsert.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeepLGlossaryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<DeepLGlossaryService>(DeepLGlossaryService);

    mockGet.mockResolvedValue({
      data: {
        supported_languages: [{ source_lang: 'BG', target_lang: 'DE' }],
      },
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('ensureGlossary', () => {
    it('returns undefined when DEEPL_API_KEY is not set', async () => {
      delete process.env.DEEPL_API_KEY;
      expect(await service.ensureGlossary('bg', 'de')).toBeUndefined();
    });

    it('returns undefined for an unsupported language pair without calling create', async () => {
      mockGet.mockResolvedValue({
        data: {
          supported_languages: [{ source_lang: 'BG', target_lang: 'DE' }],
        },
      });
      const result = await service.ensureGlossary('bg', 'ar');
      expect(result).toBeUndefined();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('returns undefined when there are zero verified terms for the pair', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([]);
      const result = await service.ensureGlossary('bg', 'de');
      expect(result).toBeUndefined();
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('creates a new glossary and caches its id when none exists yet', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([
        { sourceText: 'мезе', translatedText: 'Vorspeise', kind: 'TERM' },
      ]);
      mockPrisma.deepLGlossary.findUnique.mockResolvedValue(null);
      mockPost.mockResolvedValue({ data: { glossary_id: 'g-123' } });

      const result = await service.ensureGlossary('bg', 'de');

      expect(result).toBe('g-123');
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/v2/glossaries'),
        expect.objectContaining({
          source_lang: 'BG',
          target_lang: 'DE',
          entries_format: 'tsv',
          entries: 'мезе\tVorspeise',
        }),
        expect.any(Object),
      );
      expect(mockPrisma.deepLGlossary.upsert).toHaveBeenCalled();
    });

    it('emits an identity entry (source -> source) for DO_NOT_TRANSLATE terms', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([
        {
          sourceText: 'туборг',
          translatedText: 'Tuborg',
          kind: 'DO_NOT_TRANSLATE',
        },
      ]);
      mockPrisma.deepLGlossary.findUnique.mockResolvedValue(null);
      mockPost.mockResolvedValue({ data: { glossary_id: 'g-123' } });

      await service.ensureGlossary('bg', 'de');

      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ entries: 'туборг\tтуборг' }),
        expect.any(Object),
      );
    });

    it('reuses the cached glossary id when contentHash is unchanged', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([
        { sourceText: 'мезе', translatedText: 'Vorspeise', kind: 'TERM' },
      ]);
      const crypto = require('crypto');
      const hash = crypto
        .createHash('md5')
        .update('мезе\tVorspeise')
        .digest('hex');
      mockPrisma.deepLGlossary.findUnique.mockResolvedValue({
        deeplGlossaryId: 'g-existing',
        contentHash: hash,
      });

      const result = await service.ensureGlossary('bg', 'de');

      expect(result).toBe('g-existing');
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('rebuilds when contentHash has drifted from the cached value', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([
        { sourceText: 'мезе', translatedText: 'Vorspeise NEW', kind: 'TERM' },
      ]);
      mockPrisma.deepLGlossary.findUnique.mockResolvedValue({
        deeplGlossaryId: 'g-old',
        contentHash: 'stale-hash',
      });
      mockPost.mockResolvedValue({ data: { glossary_id: 'g-new' } });

      const result = await service.ensureGlossary('bg', 'de');

      expect(result).toBe('g-new');
      expect(mockPost).toHaveBeenCalled();
    });

    it('deletes the superseded glossary only AFTER the new one is created', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([
        { sourceText: 'мезе', translatedText: 'Vorspeise NEW', kind: 'TERM' },
      ]);
      mockPrisma.deepLGlossary.findUnique.mockResolvedValue({
        deeplGlossaryId: 'g-old',
        contentHash: 'stale-hash',
      });
      mockPost.mockResolvedValue({ data: { glossary_id: 'g-new' } });
      mockDelete.mockResolvedValue({});

      await service.ensureGlossary('bg', 'de');
      await new Promise((r) => setTimeout(r, 0)); // let the fire-and-forget delete settle

      expect(mockPost).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalledWith(
        expect.stringContaining('g-old'),
        expect.any(Object),
      );
    });

    it('returns undefined and does not throw when the DeepL create call fails', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([
        { sourceText: 'мезе', translatedText: 'Vorspeise', kind: 'TERM' },
      ]);
      mockPrisma.deepLGlossary.findUnique.mockResolvedValue(null);
      mockPost.mockRejectedValue(new Error('DeepL 500'));

      const result = await service.ensureGlossary('bg', 'de');

      expect(result).toBeUndefined();
    });

    it('skips an entry containing a literal tab or newline (illegal in TSV)', async () => {
      mockPrisma.glossaryTerm.findMany.mockResolvedValue([
        { sourceText: 'мезе', translatedText: 'Vorspeise', kind: 'TERM' },
        { sourceText: 'bad\tterm', translatedText: 'x', kind: 'TERM' },
      ]);
      mockPrisma.deepLGlossary.findUnique.mockResolvedValue(null);
      mockPost.mockResolvedValue({ data: { glossary_id: 'g-123' } });

      await service.ensureGlossary('bg', 'de');

      const [, body] = mockPost.mock.calls[0];
      expect(body.entries).toBe('мезе\tVorspeise');
    });

    it('degrades to undefined (never throws) when glossary-language-pairs lookup fails', async () => {
      mockGet.mockRejectedValue(new Error('network error'));
      const result = await service.ensureGlossary('bg', 'de');
      expect(result).toBeUndefined();
    });
  });
});
