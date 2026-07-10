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
    mockPost = (axios as unknown as { __mockPost: jest.Mock }).__mockPost;
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
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'DeepL-Auth-Key test-key',
          }),
        }),
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

    it('throws on API error so callers can skip DB writes (Issue 17)', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockRejectedValue(new Error('network error'));

      await expect(service.translateTexts(['hello'], 'BG')).rejects.toThrow(
        'network error',
      );
    });

    it('translateText returns original text when DeepL throws (Issue 17)', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockRejectedValue(new Error('network error'));

      const result = await service.translateText('hello', 'BG');
      expect(result).toBe('hello');
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
      mockPost.mockResolvedValue({
        data: { translations: [{ text: 'Здравей' }] },
      });

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
      mockPost.mockResolvedValue({
        data: { translations: [{ text: 'Бургер' }] },
      });

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
        .mockResolvedValueOnce({
          data: { translations: [{ text: 'Burger RO' }] },
        });

      // Skip the inter-language delay without mutating the global timer (a
      // global setTimeout mock can bleed into unrelated async code).
      service['sleep'] = jest.fn().mockResolvedValue(undefined);

      const result = await service.translateObject({ name: 'Burger' }, [
        'BG',
        'RO',
      ]);
      expect(result).toHaveProperty('BG');
      expect(result).toHaveProperty('RO');
      expect(result.BG.name).toBe('Бургер');
      expect(result.RO.name).toBe('Burger RO');
    });

    it('returns empty object when all values are blank', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      const result = await service.translateObject({ name: '', desc: null }, [
        'BG',
      ]);
      expect(result).toEqual({});
      expect(mockPost).not.toHaveBeenCalled();
    });
  });

  describe('retry, dedupe, and per-language resilience', () => {
    beforeEach(() => {
      process.env.DEEPL_API_KEY = 'test-key';
      // Skip real backoff / inter-language delays.
      service['sleep'] = jest.fn().mockResolvedValue(undefined);
    });

    it('retries transient 429 then succeeds', async () => {
      mockPost
        .mockRejectedValueOnce({ response: { status: 429, headers: {} } })
        .mockRejectedValueOnce({ response: { status: 429, headers: {} } })
        .mockResolvedValueOnce({ data: { translations: [{ text: 'Soupe' }] } });

      const result = await service.translateTexts(['Soup'], 'FR');

      expect(result).toEqual(['Soupe']);
      expect(mockPost).toHaveBeenCalledTimes(3);
    });

    it('does NOT retry on 456 quota error and rethrows', async () => {
      mockPost.mockRejectedValue({
        response: { status: 456, data: { message: 'Quota exceeded' } },
      });

      await expect(
        service.translateTexts(['Soup'], 'FR'),
      ).rejects.toBeDefined();
      expect(mockPost).toHaveBeenCalledTimes(1);
    });

    it('dedupes identical source strings into one DeepL request', async () => {
      mockPost.mockImplementation((_url: string, body: any) =>
        Promise.resolve({
          data: {
            translations: body.text.map((t: string) => ({ text: `${t}!` })),
          },
        }),
      );

      const result = await service.translateTexts(['a', 'a', 'b'], 'FR');

      expect(mockPost).toHaveBeenCalledTimes(1);
      expect(mockPost.mock.calls[0][1].text).toEqual(['a', 'b']);
      expect(result).toEqual(['a!', 'a!', 'b!']);
    });

    it('translateObject persists languages that succeed when one language fails', async () => {
      jest
        .spyOn(service, 'translateTexts')
        .mockImplementation((texts: string[], lang: string) =>
          lang === 'de'
            ? Promise.reject(new Error('boom'))
            : Promise.resolve(texts.map((t) => `${t}_${lang}`)),
        );

      const result = await service.translateObject({ name: 'Soup' }, [
        'fr',
        'de',
        'ja',
      ]);

      expect(result.fr).toEqual({ name: 'Soup_fr' });
      expect(result.ja).toEqual({ name: 'Soup_ja' });
      expect(result.de).toBeUndefined();
    });

    it('translateObject throws only when every language fails', async () => {
      jest
        .spyOn(service, 'translateTexts')
        .mockRejectedValue(new Error('all dead'));

      await expect(
        service.translateObject({ name: 'Soup' }, ['fr', 'de']),
      ).rejects.toThrow('all dead');
    });
  });

  describe('circuit breaker', () => {
    beforeEach(() => {
      process.env.DEEPL_API_KEY = 'test-key';
      service['sleep'] = jest.fn().mockResolvedValue(undefined);
    });

    it('opens after repeated failures and fast-fails without calling DeepL', async () => {
      mockPost.mockRejectedValue(new Error('deepl down'));

      // Five consecutive failures trip the breaker.
      for (let i = 0; i < 5; i++) {
        await expect(service.translateTexts(['x'], 'BG')).rejects.toThrow();
      }
      const callsWhileClosed = mockPost.mock.calls.length;

      // Sixth call short-circuits — no further HTTP request is made.
      await expect(service.translateTexts(['x'], 'BG')).rejects.toThrow(
        /circuit open/i,
      );
      expect(mockPost.mock.calls.length).toBe(callsWhileClosed);
    });

    it('resets the failure count after a success', async () => {
      mockPost.mockRejectedValue(new Error('down'));
      for (let i = 0; i < 4; i++) {
        await expect(service.translateTexts(['x'], 'BG')).rejects.toThrow();
      }

      // A success resets the consecutive-failure counter.
      mockPost.mockReset();
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });
      await service.translateTexts(['x'], 'BG');

      // A single later failure must NOT re-open the breaker (counter was reset),
      // so DeepL is still attempted.
      mockPost.mockReset();
      mockPost.mockRejectedValue(new Error('down again'));
      await expect(service.translateTexts(['x'], 'BG')).rejects.toThrow(
        'down again',
      );
      expect(mockPost).toHaveBeenCalled();
    });
  });
});
