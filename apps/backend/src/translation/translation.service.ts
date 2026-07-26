import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ITranslationProvider,
  TRANSLATION_PROVIDER,
  TranslateOptions,
} from './translation-provider.interface';
import { GlossaryService } from './glossary.service';
import { isGarbageTranslation } from './translation-validator';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(
    @Inject(TRANSLATION_PROVIDER)
    private readonly provider: ITranslationProvider,
    private readonly glossary: GlossaryService,
  ) {}

  // Conservative: DeepL free = 5 req/s, paid = higher but stay safe. Kept
  // for self-hosted providers too — a shared delay between per-language
  // calls is a harmless default even when the provider has no rate limit.
  private static readonly LANG_DELAY_MS = 250;

  // Circuit breaker: during a sustained provider outage, retrying every
  // request blocks every public-menu render. After this many consecutive
  // failures the breaker opens and translateTexts fast-fails for a cooldown
  // window — callers fall back to original text without blocking, and
  // nothing untranslated gets cached.
  private static readonly CIRCUIT_THRESHOLD = 5;
  private static readonly CIRCUIT_COOLDOWN_MS = 60_000;
  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;

  private isCircuitOpen(): boolean {
    return Date.now() < this.circuitOpenUntil;
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  }

  private recordFailure(): void {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= TranslationService.CIRCUIT_THRESHOLD) {
      this.circuitOpenUntil =
        Date.now() + TranslationService.CIRCUIT_COOLDOWN_MS;
    }
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Whether the active provider is configured to actually run (vs a no-op fallback). */
  isEnabled(): boolean {
    return this.provider.isConfigured();
  }

  /** Active provider's batch cap — callers chunk large text lists to this size. */
  get maxBatchSize(): number {
    return this.provider.maxBatchSize;
  }

  private normalizeForGlossary(text: string): string {
    return text.trim().toLowerCase();
  }

  async translateTexts(
    texts: string[],
    targetLanguage: string,
    sourceLanguage?: string,
    opts?: TranslateOptions,
  ): Promise<string[]> {
    if (!texts || texts.length === 0) return texts;

    // Dedupe identical source strings so the provider is only asked to
    // translate each distinct string once per request (saves characters +
    // requests). Results are mapped back onto the original positions.
    const unique = [...new Set(texts)];

    // Glossary check runs first and unconditionally (given a known source
    // language) — known terms resolve for free regardless of whether a
    // provider is configured or healthy. This is what fixes short/rare-word
    // menu vocabulary (e.g. "Мезета") that NMT/LLM providers translate
    // unreliably: known terms never reach the model at all.
    let glossaryHits = new Map<string, string>();
    if (sourceLanguage) {
      try {
        glossaryHits = await this.glossary.lookupBatch(
          sourceLanguage,
          unique,
          targetLanguage,
        );
      } catch (err) {
        this.logger.warn(
          `Glossary lookup failed, falling back to provider for all texts: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const bySource = new Map<string, string>();
    for (const t of unique) {
      const hit = glossaryHits.get(this.normalizeForGlossary(t));
      if (hit !== undefined) bySource.set(t, hit);
    }
    const toTranslate = unique.filter((t) => !bySource.has(t));

    if (glossaryHits.size > 0) {
      this.logger.log(
        `Glossary matched ${bySource.size}/${unique.length} texts for ${targetLanguage} — ${toTranslate.length} left for the provider`,
      );
    }

    if (toTranslate.length === 0) {
      // Fully served by the glossary — provider never touched.
      return texts.map((t) => bySource.get(t) ?? t);
    }

    // NOTE: this used to have a "glossary-only mode" branch here that
    // returned source text for anything not in the glossary whenever
    // sourceLanguage was known — which was every real call, since every
    // caller passes restaurant.dashboardLanguage. That made the provider
    // below permanently unreachable and is the root cause the 2026-07-25
    // translation rework fixed (see "Dynamic Menu Translation
    // Architecture.md"). Do not reintroduce it — if a provider's model
    // proves unreliable on short input again, fix that in
    // isGarbageTranslation (translation-validator.ts) or the glossary, not
    // by skipping the provider entirely.

    if (!this.provider.isConfigured()) {
      this.logger.warn(
        'Translation provider not configured — returning original texts for non-glossary entries',
      );
      for (const t of toTranslate) bySource.set(t, t);
      return texts.map((t) => bySource.get(t) ?? t);
    }

    // Fast-fail while the breaker is open instead of blocking on 5× backoff per
    // request during a sustained outage. Callers treat this like any other
    // failure (skip DB writes, render original text).
    if (this.isCircuitOpen()) {
      this.logger.warn(
        'Translation circuit open — skipping translation until cooldown elapses',
      );
      throw new Error('Translation circuit open (degraded mode)');
    }

    const startedAt = Date.now();
    this.logger.log(
      `Calling translation provider: ${toTranslate.length} texts -> ${targetLanguage}${sourceLanguage ? ` (source=${sourceLanguage})` : ''}`,
    );
    let translatedToTranslate: string[];
    try {
      translatedToTranslate = await this.provider.translateBatch(
        toTranslate,
        targetLanguage,
        sourceLanguage,
        opts,
      );
      this.recordSuccess();
      this.logger.log(
        `Provider call done: ${toTranslate.length} texts -> ${targetLanguage} in ${Date.now() - startedAt}ms`,
      );
    } catch (err) {
      this.recordFailure();
      throw err;
    }
    // Garbage detection used to fall back to `translated = source` — which
    // is exactly the same poisoning shape as the removed glossary-only
    // gate: an unrecognized/failed translation silently stored as if it
    // were a real one, which then makes needsTranslation()-style presence
    // checks skip the entity forever. A chunk with any detected garbage
    // throws instead, so Phase 2's catch in
    // MenuTranslationService.applyLazyTranslations skips the DB write for
    // this chunk entirely — the affected units stay STALE and are retried
    // (with backoff) rather than getting a wrong-but-"successful" value
    // cached. This does discard the other, legitimate translations in the
    // same chunk; that's an acceptable trade for never writing garbage,
    // and chunks are capped at the provider's maxBatchSize (50 for DeepL).
    const garbageDetections: string[] = [];
    for (let i = 0; i < toTranslate.length; i++) {
      const source = toTranslate[i];
      const translated = translatedToTranslate[i];

      if (
        translated &&
        isGarbageTranslation(source, translated, targetLanguage)
      ) {
        garbageDetections.push(`"${source}" -> "${translated}"`);
        continue;
      }

      bySource.set(source, translated ?? source);
    }

    if (garbageDetections.length > 0) {
      const message = `Garbage translation detected for ${targetLanguage}: ${garbageDetections.slice(0, 5).join('; ')}${garbageDetections.length > 5 ? `; +${garbageDetections.length - 5} more` : ''}`;
      this.logger.warn(message);
      throw new Error(message);
    }
    return texts.map((t) => bySource.get(t) ?? t);
  }

  async translateText(
    text: string,
    targetLanguage: string,
    sourceLanguage?: string,
    opts?: TranslateOptions,
  ): Promise<string> {
    try {
      const results = await this.translateTexts(
        [text],
        targetLanguage,
        sourceLanguage,
        opts,
      );
      return results[0] || text;
    } catch (error) {
      this.logger.warn(
        `translateText fallback to source text (${targetLanguage}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return text;
    }
  }

  async translateObject(
    obj: Record<string, string | null | undefined>,
    targetLanguages: string[],
    sourceLanguage?: string,
    opts?: TranslateOptions,
  ): Promise<Record<string, Record<string, string>>> {
    const translations: Record<string, Record<string, string>> = {};

    if (!targetLanguages || targetLanguages.length === 0) {
      return translations;
    }

    if (!this.provider.isConfigured()) {
      this.logger.warn(
        'Translation provider not configured — skipping translateObject',
      );
      return translations;
    }

    const entriesToTranslate = Object.entries(obj).filter(
      ([_, value]) => value && value.trim() !== '',
    );
    if (entriesToTranslate.length === 0) return translations;

    const keys = entriesToTranslate.map(([key]) => key);
    const texts = entriesToTranslate.map(([_, value]) => value as string);

    let failedLangs = 0;
    let lastError: unknown;

    for (let i = 0; i < targetLanguages.length; i++) {
      const lang = targetLanguages[i];

      try {
        const translatedTexts = await this.translateTexts(
          texts,
          lang,
          sourceLanguage,
          opts,
        );
        translations[lang] = {};
        for (let j = 0; j < keys.length; j++) {
          translations[lang][keys[j]] = translatedTexts[j] || texts[j];
        }
      } catch (error: unknown) {
        // Per-language resilience: a failure on one language must NOT discard the
        // languages that already succeeded. Skip this one — the caller persists
        // whatever came back, and the missing language is retried on the next run.
        failedLangs++;
        lastError = error;
      }

      // Delay between language calls to respect provider rate limits.
      if (i < targetLanguages.length - 1) {
        await this.sleep(TranslationService.LANG_DELAY_MS);
      }
    }

    // Only signal failure when EVERY requested language failed — there is nothing
    // to persist, so the entity should be re-tried as a whole next time.
    if (failedLangs === targetLanguages.length && lastError) {
      throw lastError;
    }

    return translations;
  }
}
