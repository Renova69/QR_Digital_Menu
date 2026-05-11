import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  // Shared instance with keep-alive agent — prevents TLS socket listener accumulation
  private readonly http: AxiosInstance = axios.create({
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 4 }),
  });

  // Conservative: DeepL free = 5 req/s, paid = higher but stay safe
  private static readonly LANG_DELAY_MS = 250;

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
    } catch (error: any) {
      this.logger.error(
        `Failed to translate texts to ${targetLanguage}: ${error.message}`,
      );
      return texts;
    }
  }

  async translateText(text: string, targetLanguage: string): Promise<string> {
    const results = await this.translateTexts([text], targetLanguage);
    return results[0] || text;
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

    for (let i = 0; i < targetLanguages.length; i++) {
      const lang = targetLanguages[i];
      translations[lang] = {};
      const translatedTexts = await this.translateTexts(texts, lang);

      for (let j = 0; j < keys.length; j++) {
        translations[lang][keys[j]] = translatedTexts[j] || texts[j];
      }

      // Delay between language calls to respect DeepL rate limit
      if (i < targetLanguages.length - 1) {
        await this.sleep(TranslationService.LANG_DELAY_MS);
      }
    }

    return translations;
  }
}
