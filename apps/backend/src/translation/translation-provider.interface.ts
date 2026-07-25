export interface TranslateOptions {
  /** Free-form hint appended via DeepL's `context` parameter — improves
   * short/ambiguous menu text (a dish name, a one-word option) without
   * being translated itself. Not billed. */
  context?: string;
  /** Cached DeepL native glossary id (see DeepLGlossaryService) — enforces
   * curated terminology in-sentence, not just on an exact whole-string
   * match like the local GlossaryService. */
  glossaryId?: string;
  /** Attribution for TranslationUsageService — which tenant this batch's
   * character spend belongs to. Recording is skipped (not billed to
   * anyone) when omitted; callers that care about quota must pass it. */
  restaurantId?: string;
}

/**
 * Provider abstraction over the raw translation wire call. All
 * orchestration — dedup, circuit breaker, retry-across-languages,
 * translateObject's per-field mapping — lives in TranslationService and is
 * provider-agnostic. A provider only knows how to send one batch of texts
 * to one backend and get strings back.
 */
export interface ITranslationProvider {
  /** Whether this provider has what it needs to run (API key, service URL, etc). */
  isConfigured(): boolean;

  /** Provider's own request cap; callers chunk large batches to this size. */
  readonly maxBatchSize: number;

  translateBatch(
    texts: string[],
    targetLang: string,
    sourceLang?: string,
    opts?: TranslateOptions,
  ): Promise<string[]>;
}

export const TRANSLATION_PROVIDER = Symbol('TRANSLATION_PROVIDER');
