import { Test, TestingModule } from '@nestjs/testing';
import { DeepLProvider } from './deepl.provider';
import { TranslationUsageService } from '../translation-usage.service';

jest.mock('axios', () => {
  const mockPost = jest.fn();
  const mockDelete = jest.fn();
  return {
    create: jest.fn(() => ({ post: mockPost, delete: mockDelete })),
    __mockPost: mockPost,
    __mockDelete: mockDelete,
  };
});

import axios from 'axios';

describe('DeepLProvider', () => {
  let provider: DeepLProvider;
  let mockPost: jest.Mock;
  const mockUsage = {
    record: jest.fn().mockResolvedValue(undefined),
    countCodePoints: jest.fn((texts: string[]) =>
      texts.reduce((s, t) => s + [...t].length, 0),
    ),
  };

  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    mockPost = (axios as unknown as { __mockPost: jest.Mock }).__mockPost;
    mockPost.mockReset();
    mockUsage.record.mockClear();
    mockUsage.countCodePoints.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeepLProvider,
        { provide: TranslationUsageService, useValue: mockUsage },
      ],
    }).compile();

    provider = module.get<DeepLProvider>(DeepLProvider);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isConfigured', () => {
    it('is false when DEEPL_API_KEY is not set', () => {
      delete process.env.DEEPL_API_KEY;
      expect(provider.isConfigured()).toBe(false);
    });

    it('is true when DEEPL_API_KEY is set', () => {
      process.env.DEEPL_API_KEY = 'test-key';
      expect(provider.isConfigured()).toBe(true);
    });
  });

  describe('translateBatch', () => {
    it('calls the DeepL API and returns translated texts', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockResolvedValue({
        data: { translations: [{ text: 'Здравей' }] },
      });

      const result = await provider.translateBatch(['Hello'], 'BG');
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

    it('passes source_lang when provided', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });

      await provider.translateBatch(['x'], 'bg', 'en');
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ source_lang: 'EN' }),
        expect.any(Object),
      );
    });

    it('omits source_lang when not provided', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });

      await provider.translateBatch(['x'], 'bg');
      const [, body] = mockPost.mock.calls[0];
      expect(body).not.toHaveProperty('source_lang');
    });

    it('uses free API endpoint when key ends with :fx', async () => {
      process.env.DEEPL_API_KEY = 'free-key:fx';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });

      await provider.translateBatch(['x'], 'BG');
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('api-free.deepl.com'),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('uses paid API endpoint when key does not end with :fx', async () => {
      process.env.DEEPL_API_KEY = 'paid-key';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });

      await provider.translateBatch(['x'], 'BG');
      expect(mockPost).toHaveBeenCalledWith(
        expect.stringContaining('api.deepl.com'),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('uppercases the target language code', async () => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });

      await provider.translateBatch(['x'], 'bg');
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ target_lang: 'BG' }),
        expect.any(Object),
      );
    });

    it('throws when DEEPL_API_KEY is not set', async () => {
      delete process.env.DEEPL_API_KEY;
      await expect(provider.translateBatch(['x'], 'BG')).rejects.toThrow(
        'DEEPL_API_KEY',
      );
    });
  });

  describe('context and glossary_id', () => {
    beforeEach(() => {
      process.env.DEEPL_API_KEY = 'test-key';
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });
    });

    it('sends context when provided (not billed, but forwarded)', async () => {
      await provider.translateBatch(['x'], 'bg', undefined, {
        context: 'Restaurant menu item name',
      });
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ context: 'Restaurant menu item name' }),
        expect.any(Object),
      );
    });

    it('omits context when not provided', async () => {
      await provider.translateBatch(['x'], 'bg');
      const [, body] = mockPost.mock.calls[0];
      expect(body).not.toHaveProperty('context');
    });

    it('sends glossary_id only when sourceLang is also present', async () => {
      await provider.translateBatch(['x'], 'bg', 'en', {
        glossaryId: 'glossary-123',
      });
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          glossary_id: 'glossary-123',
          source_lang: 'EN',
        }),
        expect.any(Object),
      );
    });

    it('omits glossary_id when sourceLang is absent, even if provided', async () => {
      await provider.translateBatch(['x'], 'bg', undefined, {
        glossaryId: 'glossary-123',
      });
      const [, body] = mockPost.mock.calls[0];
      expect(body).not.toHaveProperty('glossary_id');
    });

    it('omits glossary_id when not provided', async () => {
      await provider.translateBatch(['x'], 'bg', 'en');
      const [, body] = mockPost.mock.calls[0];
      expect(body).not.toHaveProperty('glossary_id');
    });
  });

  describe('usage recording', () => {
    beforeEach(() => {
      process.env.DEEPL_API_KEY = 'test-key';
    });

    it('records usage on success when restaurantId is provided', async () => {
      mockPost.mockResolvedValue({
        data: { translations: [{ text: 'Здравей' }] },
      });

      await provider.translateBatch(['Hello'], 'bg', 'en', {
        restaurantId: 'rest-1',
      });

      expect(mockUsage.record).toHaveBeenCalledWith({
        restaurantId: 'rest-1',
        provider: 'deepl',
        sourceLang: 'en',
        targetLang: 'bg',
        charCount: 5, // "Hello".length via code points
      });
    });

    it('does not record usage when restaurantId is not provided', async () => {
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });
      await provider.translateBatch(['x'], 'bg');
      expect(mockUsage.record).not.toHaveBeenCalled();
    });

    it('does not record usage on a failed (non-retryable) call', async () => {
      mockPost.mockRejectedValue({
        response: { status: 456, data: { message: 'Quota exceeded' } },
      });
      await expect(
        provider.translateBatch(['x'], 'bg', 'en', { restaurantId: 'rest-1' }),
      ).rejects.toBeDefined();
      expect(mockUsage.record).not.toHaveBeenCalled();
    });

    it('counts unicode code points via the usage service, not raw text length', async () => {
      mockPost.mockResolvedValue({ data: { translations: [{ text: 'ok' }] } });
      await provider.translateBatch(['🎉'], 'bg', 'en', {
        restaurantId: 'rest-1',
      });
      expect(mockUsage.countCodePoints).toHaveBeenCalledWith(['🎉']);
    });
  });

  describe('retry / backoff', () => {
    beforeEach(() => {
      process.env.DEEPL_API_KEY = 'test-key';
      provider['sleep'] = jest.fn().mockResolvedValue(undefined);
    });

    it('retries transient 429 then succeeds', async () => {
      mockPost
        .mockRejectedValueOnce({ response: { status: 429, headers: {} } })
        .mockRejectedValueOnce({ response: { status: 429, headers: {} } })
        .mockResolvedValueOnce({ data: { translations: [{ text: 'Soupe' }] } });

      const result = await provider.translateBatch(['Soup'], 'FR');

      expect(result).toEqual(['Soupe']);
      expect(mockPost).toHaveBeenCalledTimes(3);
    });

    it('does NOT retry on 456 quota error and rethrows', async () => {
      mockPost.mockRejectedValue({
        response: { status: 456, data: { message: 'Quota exceeded' } },
      });

      await expect(
        provider.translateBatch(['Soup'], 'FR'),
      ).rejects.toBeDefined();
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
  });
});
