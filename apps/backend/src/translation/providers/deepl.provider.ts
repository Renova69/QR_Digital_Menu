import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import {
  ITranslationProvider,
  TranslateOptions,
} from '../translation-provider.interface';
import { TranslationUsageService } from '../translation-usage.service';

@Injectable()
export class DeepLProvider implements ITranslationProvider {
  private readonly logger = new Logger(DeepLProvider.name);

  constructor(private readonly usage: TranslationUsageService) {}

  readonly maxBatchSize = 50; // DeepL accepts up to 50 text strings per request

  // Shared instance with keep-alive agent — prevents TLS socket listener accumulation
  private readonly http: AxiosInstance = axios.create({
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 4 }),
    timeout: 8_000,
  });

  // Retry tuning for transient DeepL errors (429 Too Many Requests / 5xx).
  // DeepL Free aggressively rate-limits concurrent bursts, so without backoff a
  // large "Translate All" loses ~half its requests. Quota errors (456) and other
  // 4xx are NOT retried — retrying a quota wall just wastes time.
  private static readonly MAX_RETRIES = 5;
  private static readonly RETRY_BASE_MS = 500;

  private get apiKey(): string | undefined {
    return process.env.DEEPL_API_KEY;
  }

  private get baseUrl(): string {
    return this.apiKey?.endsWith(':fx')
      ? 'https://api-free.deepl.com'
      : 'https://api.deepl.com';
  }

  isConfigured(): boolean {
    return !!this.apiKey;
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

  /** Single DeepL POST with exponential backoff + jitter on transient errors. */
  async translateBatch(
    texts: string[],
    targetLang: string,
    sourceLang?: string,
    opts?: TranslateOptions,
  ): Promise<string[]> {
    const key = this.apiKey;
    if (!key) {
      throw new Error('DeepL: DEEPL_API_KEY not set');
    }

    let lastError: unknown;

    for (let attempt = 0; attempt <= DeepLProvider.MAX_RETRIES; attempt++) {
      try {
        const response = await this.http.post(
          `${this.baseUrl}/v2/translate`,
          {
            text: texts,
            target_lang: targetLang.toUpperCase(),
            ...(sourceLang ? { source_lang: sourceLang.toUpperCase() } : {}),
            // glossary_id requires an explicit source_lang — DeepL silently
            // ignores it otherwise. Callers (the worker) must always pass
            // sourceLang alongside glossaryId or the glossary never engages.
            ...(opts?.glossaryId && sourceLang
              ? { glossary_id: opts.glossaryId }
              : {}),
            // context characters are NOT billed (see TranslationUsageService)
            // — safe to always include when the caller has one.
            ...(opts?.context ? { context: opts.context } : {}),
          },
          {
            headers: {
              Authorization: `DeepL-Auth-Key ${key}`,
              'Content-Type': 'application/json',
            },
          },
        );

        const translated: string[] =
          response.data?.translations?.map((t: any) => t.text) || texts;

        // Usage hook: the ONE place every call path funnels through, since
        // this is the only code that actually issues the HTTP request.
        // Billed on success only — a retried-then-failed request costs 0.
        if (opts?.restaurantId) {
          void this.usage.record({
            restaurantId: opts.restaurantId,
            provider: 'deepl',
            sourceLang: sourceLang ?? 'unknown',
            targetLang,
            charCount: this.usage.countCodePoints(texts),
          });
        }

        return translated;
      } catch (error: unknown) {
        lastError = error;
        const axiosErr = error as any;
        const status = axiosErr?.response?.status;

        if (
          !this.isRetryable(status) ||
          attempt === DeepLProvider.MAX_RETRIES
        ) {
          const deepLMsg = axiosErr?.response?.data?.message;
          const detail = deepLMsg
            ? `DeepL ${status}: ${deepLMsg}`
            : error instanceof Error
              ? error.message
              : String(error);
          this.logger.error(
            `Failed to translate texts to ${targetLang}: ${detail}`,
          );
          // Re-throw so callers can choose not to write untranslated content to DB.
          throw error;
        }

        // Honor Retry-After when present, otherwise exponential backoff + jitter.
        const retryAfter = Number(axiosErr?.response?.headers?.['retry-after']);
        const backoff =
          DeepLProvider.RETRY_BASE_MS * 2 ** attempt +
          Math.floor(Math.random() * 250);
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : backoff;
        this.logger.warn(
          `DeepL ${status} for ${targetLang} — retry ${attempt + 1}/${DeepLProvider.MAX_RETRIES} in ${waitMs}ms`,
        );
        await this.sleep(waitMs);
      }
    }

    throw lastError;
  }
}
