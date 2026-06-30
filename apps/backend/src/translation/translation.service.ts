import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  // Shared instance with keep-alive agent — prevents TLS socket listener accumulation
  private readonly http: AxiosInstance = axios.create({
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 4 }),
    timeout: 8_000,
  });

  // Conservative: DeepL free = 5 req/s, paid = higher but stay safe
  private static readonly LANG_DELAY_MS = 250;

  // Retry tuning for transient DeepL errors (429 Too Many Requests / 5xx).
  // DeepL Free aggressively rate-limits concurrent bursts, so without backoff a
  // large "Translate All" loses ~half its requests. Quota errors (456) and other
  // 4xx are NOT retried — retrying a quota wall just wastes time.
  private static readonly MAX_RETRIES = 5;
  private static readonly RETRY_BASE_MS = 500;

  // Circuit breaker: during a sustained DeepL outage, retrying every request
  // (5 × exponential backoff each) blocks every public-menu render. After this
  // many consecutive failures the breaker opens and translateTexts fast-fails
  // for a cooldown window — callers fall back to original text without blocking,
  // and nothing untranslated gets cached.
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

  private get apiKey(): string | undefined {
    return process.env.DEEPL_API_KEY;
  }

  private get baseUrl(): string {
    return this.apiKey?.endsWith(':fx')
      ? 'https://api-free.deepl.com'
      : 'https://api.deepl.com';
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /** Transient errors worth retrying: rate limit (429), DeepL overload (529), 5xx. */
  private isRetryable(status?: number): boolean {
    return (
      status === 429 ||
      status === 529 ||
      (typeof status === 'number' && status >= 500)
    );
  }

  async translateTexts(
    texts: string[],
    targetLanguage: string,
  ): Promise<string[]> {
    if (!texts || texts.length === 0) return texts;

    const key = this.apiKey;
    if (!key) {
      this.logger.warn('DEEPL_API_KEY not set — returning original texts');
      return texts;
    }

    // Fast-fail while the breaker is open instead of blocking on 5× backoff per
    // request during a sustained outage. Callers treat this like any other
    // failure (skip DB writes, render original text).
    if (this.isCircuitOpen()) {
      this.logger.warn(
        'DeepL circuit open — skipping translation until cooldown elapses',
      );
      throw new Error('DeepL circuit open (degraded mode)');
    }

    // Dedupe identical source strings so DeepL is only asked to translate each
    // distinct string once per request (saves characters + requests). Results
    // are mapped back onto the original positions.
    const unique = [...new Set(texts)];
    let translatedUnique: string[];
    try {
      translatedUnique = await this.postTranslate(unique, targetLanguage);
      this.recordSuccess();
    } catch (err) {
      this.recordFailure();
      throw err;
    }
    const bySource = new Map<string, string>();
    for (let i = 0; i < unique.length; i++) {
      bySource.set(unique[i], translatedUnique[i] ?? unique[i]);
    }
    return texts.map((t) => bySource.get(t) ?? t);
  }

  /** Single DeepL POST with exponential backoff + jitter on transient errors. */
  private async postTranslate(
    texts: string[],
    targetLanguage: string,
  ): Promise<string[]> {
    const key = this.apiKey as string;
    let lastError: unknown;

    for (
      let attempt = 0;
      attempt <= TranslationService.MAX_RETRIES;
      attempt++
    ) {
      try {
        const response = await this.http.post(
          `${this.baseUrl}/v2/translate`,
          {
            text: texts,
            target_lang: targetLanguage.toUpperCase(),
          },
          {
            headers: {
              Authorization: `DeepL-Auth-Key ${key}`,
              'Content-Type': 'application/json',
            },
          },
        );

        return response.data?.translations?.map((t: any) => t.text) || texts;
      } catch (error: unknown) {
        lastError = error;
        const axiosErr = error as any;
        const status = axiosErr?.response?.status;

        if (
          !this.isRetryable(status) ||
          attempt === TranslationService.MAX_RETRIES
        ) {
          const deepLMsg = axiosErr?.response?.data?.message;
          const detail = deepLMsg
            ? `DeepL ${status}: ${deepLMsg}`
            : error instanceof Error
              ? error.message
              : String(error);
          this.logger.error(
            `Failed to translate texts to ${targetLanguage}: ${detail}`,
          );
          // Re-throw so callers can choose not to write untranslated content to DB.
          throw error;
        }

        // Honor Retry-After when present, otherwise exponential backoff + jitter.
        const retryAfter = Number(axiosErr?.response?.headers?.['retry-after']);
        const backoff =
          TranslationService.RETRY_BASE_MS * 2 ** attempt +
          Math.floor(Math.random() * 250);
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : backoff;
        this.logger.warn(
          `DeepL ${status} for ${targetLanguage} — retry ${attempt + 1}/${TranslationService.MAX_RETRIES} in ${waitMs}ms`,
        );
        await this.sleep(waitMs);
      }
    }

    throw lastError;
  }

  async translateText(text: string, targetLanguage: string): Promise<string> {
    try {
      const results = await this.translateTexts([text], targetLanguage);
      return results[0] || text;
    } catch {
      return text;
    }
  }

  async translateObject(
    obj: Record<string, string | null | undefined>,
    targetLanguages: string[],
  ): Promise<Record<string, Record<string, string>>> {
    const translations: Record<string, Record<string, string>> = {};

    if (!targetLanguages || targetLanguages.length === 0) {
      return translations;
    }

    if (!this.apiKey) {
      this.logger.warn('DEEPL_API_KEY not set — skipping translateObject');
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
        const translatedTexts = await this.translateTexts(texts, lang);
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

      // Delay between language calls to respect DeepL rate limit
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
