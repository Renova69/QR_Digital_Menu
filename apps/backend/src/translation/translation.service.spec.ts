import { Test, TestingModule } from '@nestjs/testing';
import { TranslationService } from './translation.service';
import {
  ITranslationProvider,
  TRANSLATION_PROVIDER,
} from './translation-provider.interface';
import { GlossaryService } from './glossary.service';

describe('TranslationService', () => {
  let service: TranslationService;
  let mockProvider: jest.Mocked<ITranslationProvider>;
  let mockGlossary: jest.Mocked<Pick<GlossaryService, 'lookupBatch'>>;

  beforeEach(async () => {
    mockProvider = {
      isConfigured: jest.fn().mockReturnValue(true),
      maxBatchSize: 50,
      translateBatch: jest.fn(),
    };
    mockGlossary = {
      lookupBatch: jest.fn().mockResolvedValue(new Map()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TranslationService,
        { provide: TRANSLATION_PROVIDER, useValue: mockProvider },
        { provide: GlossaryService, useValue: mockGlossary },
      ],
    }).compile();

    service = module.get<TranslationService>(TranslationService);
  });

  describe('isEnabled / maxBatchSize', () => {
    it('delegates isEnabled to provider.isConfigured', () => {
      mockProvider.isConfigured.mockReturnValue(false);
      expect(service.isEnabled()).toBe(false);
      mockProvider.isConfigured.mockReturnValue(true);
      expect(service.isEnabled()).toBe(true);
    });

    it('delegates maxBatchSize to the provider', () => {
      (mockProvider as any).maxBatchSize = 32;
      expect(service.maxBatchSize).toBe(32);
    });
  });

  describe('translateTexts', () => {
    it('returns original texts immediately for empty array', async () => {
      const result = await service.translateTexts([], 'BG');
      expect(result).toEqual([]);
      expect(mockProvider.translateBatch).not.toHaveBeenCalled();
    });

    it('returns original texts when provider is not configured', async () => {
      mockProvider.isConfigured.mockReturnValue(false);
      const result = await service.translateTexts(['hello'], 'BG');
      expect(result).toEqual(['hello']);
      expect(mockProvider.translateBatch).not.toHaveBeenCalled();
    });

    it('calls provider.translateBatch and returns translated texts', async () => {
      mockProvider.translateBatch.mockResolvedValue(['Здравей']);

      const result = await service.translateTexts(['Hello'], 'BG');
      expect(mockProvider.translateBatch).toHaveBeenCalledWith(
        ['Hello'],
        'BG',
        undefined,
        undefined,
      );
      expect(result).toEqual(['Здравей']);
    });

    it('forwards opts (context/glossaryId/restaurantId) through to the provider', async () => {
      mockProvider.translateBatch.mockResolvedValue(['Здравей']);
      const opts = {
        context: 'Restaurant menu item name',
        glossaryId: 'glossary-1',
        restaurantId: 'rest-1',
      };

      // sourceLanguage omitted — with it set, the (pre-Phase-8) glossary-only
      // gate below intercepts before the provider is ever reached. See the
      // "glossary-only mode" describe block for that behavior.
      await service.translateTexts(['Hello'], 'BG', undefined, opts);

      expect(mockProvider.translateBatch).toHaveBeenCalledWith(
        ['Hello'],
        'BG',
        undefined,
        opts,
      );
    });

    it('calls the provider for non-glossary terms when sourceLanguage is set (the removed glossary-only gate no longer intercepts)', async () => {
      mockProvider.translateBatch.mockResolvedValue(['Hallo']);
      const result = await service.translateTexts(['Hello'], 'DE', 'en');
      expect(result).toEqual(['Hallo']);
      expect(mockProvider.translateBatch).toHaveBeenCalledWith(
        ['Hello'],
        'DE',
        'en',
        undefined,
      );
    });

    it('throws on provider error so callers can skip DB writes (Issue 17)', async () => {
      mockProvider.translateBatch.mockRejectedValue(new Error('network error'));

      await expect(service.translateTexts(['hello'], 'BG')).rejects.toThrow(
        'network error',
      );
    });

    it('translateText returns original text when provider throws (Issue 17)', async () => {
      mockProvider.translateBatch.mockRejectedValue(new Error('network error'));

      const result = await service.translateText('hello', 'BG');
      expect(result).toBe('hello');
    });

    it('dedupes identical source strings into one provider call', async () => {
      mockProvider.translateBatch.mockImplementation((texts: string[]) =>
        Promise.resolve(texts.map((t) => `${t}!`)),
      );

      const result = await service.translateTexts(['a', 'a', 'b'], 'FR');

      expect(mockProvider.translateBatch).toHaveBeenCalledTimes(1);
      expect(mockProvider.translateBatch.mock.calls[0][0]).toEqual(['a', 'b']);
      expect(result).toEqual(['a!', 'a!', 'b!']);
    });

    it('throws instead of falling back to source text when the provider returns a garbage translation (2026-07-25 — never silently cache a poisoned value)', async () => {
      mockProvider.translateBatch.mockResolvedValue([
        'I am going to tell you about this in a moment',
      ]);

      await expect(
        service.translateTexts(['Боб'], 'en', undefined),
      ).rejects.toThrow(/Garbage translation detected/);
      expect(mockProvider.translateBatch).toHaveBeenCalled();
    });

    it('a legitimate short DeepL translation is never mistaken for garbage and IS returned', async () => {
      mockProvider.translateBatch.mockResolvedValue(['Bohneneintopf']);

      const result = await service.translateTexts(['Боб'], 'de', undefined);

      expect(result).toEqual(['Bohneneintopf']);
    });
  });

  describe('glossary integration', () => {
    it('does not touch the glossary when sourceLanguage is omitted (regression guard)', async () => {
      mockProvider.translateBatch.mockResolvedValue(['Soupe']);

      await service.translateTexts(['Soup'], 'FR');

      expect(mockGlossary.lookupBatch).not.toHaveBeenCalled();
      expect(mockProvider.translateBatch).toHaveBeenCalledWith(
        ['Soup'],
        'FR',
        undefined,
        undefined,
      );
    });

    it('fully-glossary-served batch never calls the provider', async () => {
      mockGlossary.lookupBatch.mockResolvedValue(
        new Map([['мезета', 'Vorspeisen']]),
      );

      const result = await service.translateTexts(['Мезета'], 'de', 'bg');

      expect(result).toEqual(['Vorspeisen']);
      expect(mockProvider.translateBatch).not.toHaveBeenCalled();
    });

    it('merges a glossary hit with a provider result for the remaining non-glossary term', async () => {
      mockGlossary.lookupBatch.mockResolvedValue(
        new Map([['мезета', 'Vorspeisen']]),
      );
      mockProvider.translateBatch.mockResolvedValue(['Hühnersuppe']);

      const result = await service.translateTexts(
        ['Мезета', 'Пилешка супа'],
        'de',
        'bg',
      );

      // Glossary hit → translated for free. Non-glossary term → sent to
      // the provider (the removed glossary-only gate no longer intercepts
      // it, and it never reaches the provider unnecessarily — only the
      // one term the glossary didn't cover is sent).
      expect(result).toEqual(['Vorspeisen', 'Hühnersuppe']);
      expect(mockProvider.translateBatch).toHaveBeenCalledWith(
        ['Пилешка супа'],
        'de',
        'bg',
        undefined,
      );
    });

    it('matches glossary entries case-insensitively and trims whitespace', async () => {
      mockGlossary.lookupBatch.mockResolvedValue(new Map([['скара', 'Grill']]));

      const result = await service.translateTexts(['  СКАРА  '], 'de', 'bg');

      expect(result).toEqual(['Grill']);
      expect(mockProvider.translateBatch).not.toHaveBeenCalled();
    });

    it('serves glossary hits even when the provider is not configured', async () => {
      mockProvider.isConfigured.mockReturnValue(false);
      mockGlossary.lookupBatch.mockResolvedValue(
        new Map([['мезета', 'Vorspeisen']]),
      );

      const result = await service.translateTexts(['Мезета'], 'de', 'bg');

      expect(result).toEqual(['Vorspeisen']);
      expect(mockProvider.translateBatch).not.toHaveBeenCalled();
    });

    it('a glossary-only-served call never touches the circuit breaker', async () => {
      mockGlossary.lookupBatch.mockResolvedValue(
        new Map([['мезета', 'Vorspeisen']]),
      );
      mockProvider.translateBatch.mockRejectedValue(
        new Error('should not be called'),
      );

      // Five glossary-only calls would trip the breaker if they touched it —
      // confirm the provider (and therefore the breaker) is never involved.
      for (let i = 0; i < 5; i++) {
        await service.translateTexts(['Мезета'], 'de', 'bg');
      }
      expect(mockProvider.translateBatch).not.toHaveBeenCalled();

      // A real provider call without sourceLanguage must still work normally
      // (breaker was never touched by glossary-only calls).
      mockGlossary.lookupBatch.mockResolvedValue(new Map());
      mockProvider.translateBatch.mockResolvedValue(['ok']);
      const result = await service.translateTexts(['other'], 'de');
      expect(result).toEqual(['ok']);
    });

    it('degrades gracefully when glossary lookup itself throws — falls through to the provider for all texts', async () => {
      mockGlossary.lookupBatch.mockRejectedValue(new Error('DB down'));
      mockProvider.translateBatch.mockResolvedValue(['Chicken soup']);

      const result = await service.translateTexts(['Пилешка супа'], 'de', 'bg');

      expect(result).toEqual(['Chicken soup']);
      expect(mockProvider.translateBatch).toHaveBeenCalledWith(
        ['Пилешка супа'],
        'de',
        'bg',
        undefined,
      );
    });
  });

  describe('translateText', () => {
    it('delegates to translateTexts and returns first result', async () => {
      mockProvider.translateBatch.mockResolvedValue(['Здравей']);

      const result = await service.translateText('Hello', 'BG');
      expect(result).toBe('Здравей');
    });

    it('returns original text as fallback when provider is not configured', async () => {
      mockProvider.isConfigured.mockReturnValue(false);
      const result = await service.translateText('hello', 'BG');
      expect(result).toBe('hello');
    });
  });

  describe('translateObject', () => {
    it('returns empty object when targetLanguages is empty', async () => {
      const result = await service.translateObject({ name: 'Burger' }, []);
      expect(result).toEqual({});
      expect(mockProvider.translateBatch).not.toHaveBeenCalled();
    });

    it('returns empty object when provider is not configured', async () => {
      mockProvider.isConfigured.mockReturnValue(false);
      const result = await service.translateObject({ name: 'Burger' }, ['BG']);
      expect(result).toEqual({});
    });

    it('skips null and empty values', async () => {
      mockProvider.translateBatch.mockResolvedValue(['Бургер']);

      const result = await service.translateObject(
        { name: 'Burger', desc: null, empty: '' },
        ['BG'],
      );
      expect(result.BG).toHaveProperty('name', 'Бургер');
      expect(result.BG).not.toHaveProperty('desc');
      expect(result.BG).not.toHaveProperty('empty');
    });

    it('translates to multiple languages', async () => {
      mockProvider.translateBatch
        .mockResolvedValueOnce(['Бургер'])
        .mockResolvedValueOnce(['Burger RO']);

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
      const result = await service.translateObject({ name: '', desc: null }, [
        'BG',
      ]);
      expect(result).toEqual({});
      expect(mockProvider.translateBatch).not.toHaveBeenCalled();
    });

    it('calls the provider through translateObject when sourceLanguage is set (the removed glossary-only gate no longer intercepts)', async () => {
      service['sleep'] = jest.fn().mockResolvedValue(undefined);
      mockProvider.translateBatch.mockResolvedValue(['Бургер']);

      const result = await service.translateObject(
        { name: 'Burger' },
        ['BG'],
        'en',
      );

      expect(result.BG.name).toBe('Бургер');
      expect(mockProvider.translateBatch).toHaveBeenCalledWith(
        ['Burger'],
        'BG',
        'en',
        undefined,
      );
    });
  });

  describe('translateObject per-language resilience', () => {
    beforeEach(() => {
      service['sleep'] = jest.fn().mockResolvedValue(undefined);
    });

    it('persists languages that succeed when one language fails', async () => {
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

    it('throws only when every language fails', async () => {
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
      service['sleep'] = jest.fn().mockResolvedValue(undefined);
    });

    it('opens after repeated failures and fast-fails without calling the provider', async () => {
      mockProvider.translateBatch.mockRejectedValue(new Error('provider down'));

      // Five consecutive failures trip the breaker.
      for (let i = 0; i < 5; i++) {
        await expect(service.translateTexts(['x'], 'BG')).rejects.toThrow();
      }
      const callsWhileClosed = mockProvider.translateBatch.mock.calls.length;

      // Sixth call short-circuits — no further provider call is made.
      await expect(service.translateTexts(['x'], 'BG')).rejects.toThrow(
        /circuit open/i,
      );
      expect(mockProvider.translateBatch.mock.calls.length).toBe(
        callsWhileClosed,
      );
    });

    it('resets the failure count after a success', async () => {
      mockProvider.translateBatch.mockRejectedValue(new Error('down'));
      for (let i = 0; i < 4; i++) {
        await expect(service.translateTexts(['x'], 'BG')).rejects.toThrow();
      }

      // A success resets the consecutive-failure counter.
      mockProvider.translateBatch.mockReset();
      mockProvider.translateBatch.mockResolvedValue(['ok']);
      await service.translateTexts(['x'], 'BG');

      // A single later failure must NOT re-open the breaker (counter was reset),
      // so the provider is still attempted.
      mockProvider.translateBatch.mockReset();
      mockProvider.translateBatch.mockRejectedValue(new Error('down again'));
      await expect(service.translateTexts(['x'], 'BG')).rejects.toThrow(
        'down again',
      );
      expect(mockProvider.translateBatch).toHaveBeenCalled();
    });
  });
});
