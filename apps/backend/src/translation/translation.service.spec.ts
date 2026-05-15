import { Test, TestingModule } from '@nestjs/testing';
import { TranslationService } from './translation.service';

jest.mock('axios', () => {
  const mockPost = jest.fn();
  return {
    create: jest.fn(() => ({ post: mockPost })),
    __mockPost: mockPost,
  };
});

import axios from 'axios';

describe('TranslationService', () => {
  let service: TranslationService;
  let mockPost: jest.Mock;

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    mockPost = (axios as any).__mockPost;
    mockPost.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [TranslationService],
    }).compile();

    service = module.get<TranslationService>(TranslationService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('translateTexts', () => {
    it('returns original texts immediately for empty array', async () => {
      const result = await service.translateTexts([], 'BG');
      expect(result).toEqual([]);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('returns original texts when DEEPL_API_KEY not set', async () => {
      delete process.env.DEEPL_API_KEY;
      const result = await service.translateTexts(['hello'], 'BG');
      expect(result).toEqual(['hello']);
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('calls DeepL API and returns translated texts', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockResolvedValue({
        data: { translations: [{ text: 'Здравей' }] },
      });

      const result = await service.translateTexts(['Hello'], 'BG');
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('/v2/translate'),
        expect.objectContaining({ text: ['Hello'], target_lang: 'BG' }),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'DeepL-Auth-Key test-key' }) }),
      );
      expect(result).toEqual(['Здравей']);
    });

    it('uses free API endpoint when key ends with :fx', async () => {
      process.env.DEEPL_API_KEY = 'free-key:fx';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });

      await service.translateTexts(['x'], 'BG');
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('api-free.deepl.com'),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('uses paid API endpoint when key does not end with :fx', async () => {
      process.env.DEEPL_API_KEY = 'paid-key';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });

      await service.translateTexts(['x'], 'BG');
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('api.deepl.com'),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('returns original texts on API error (graceful fallback)', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockRejectedValue(new Error('network error'));

      const result = await service.translateTexts(['hello'], 'BG');
      expect(result).toEqual(['hello']);
    });

    it('uppercases the target language code', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });

      await service.translateTexts(['x'], 'bg');
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ target_lang: 'BG' }),
        expect.any(Object),
      );
    });
  });

  describe('translateText', () => {
    it('delegates to translateTexts and returns first result', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'Здравей' }] } });

      const result = await service.translateText('Hello', 'BG');
      expect(result).toBe('Здравей');
    });

    it('returns original text as fallback when translateTexts returns empty', async () => {
      delete process.env.DEEPL_API_KEY;
      const result = await service.translateText('hello', 'BG');
      expect(result).toBe('hello');
    });
  });

  describe('translateObject', () => {
    it('returns empty object when targetLanguages is empty', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      const result = await service.translateObject({ name: 'Burger' }, []);
      expect(result).toEqual({});
      expect(mockPost).not.toHaveBeenCalled();
    });

    it('returns empty object when API key not set', async () => {
      delete process.env.DEEPL_API_KEY;
      const result = await service.translateObject({ name: 'Burger' }, ['BG']);
      expect(result).toEqual({});
    });

    it('skips null and empty values', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'Бургер' }] } });

      const result = await service.translateObject(
        { name: 'Burger', desc: null, empty: '' },
        ['BG'],
      );
      expect(result.BG).toHaveProperty('name', 'Бургер');
      expect(result.BG).not.toHaveProperty('desc');
      expect(result.BG).not.toHaveProperty('empty');
    });

    it('translates to multiple languages', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost
        .mockResolvedValueOnce({ data: { translations: [{ text: 'Бургер' }] } })
        .mockResolvedValueOnce({ data: { translations: [{ text: 'Burger RO' }] } });

      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => { fn(); return 0 as any; });

      const result = await service.translateObject({ name: 'Burger' }, ['BG', 'RO']);
      expect(result).toHaveProperty('BG');
      expect(result).toHaveProperty('RO');
      expect(result.BG.name).toBe('Бургер');
      expect(result.RO.name).toBe('Burger RO');
    });

    it('returns empty object when all values are blank', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      const result = await service.translateObject({ name: '', desc: null }, ['BG']);
      expect(result).toEqual({});
      expect(mockPost).not.toHaveBeenCalled();
    });
  });
});
