import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  private get apiKey(): string | undefined {
    return process.env.DEEPL_API_KEY;
  }

  private get baseUrl(): string {
    return this.apiKey?.endsWith(':fx')
      ? 'https://api-free.deepl.com'
      : 'https://api.deepl.com';
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
      const response = await axios.post(
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

    for (const lang of targetLanguages) {
      translations[lang] = {};
      const translatedTexts = await this.translateTexts(texts, lang);

      for (let i = 0; i < keys.length; i++) {
        translations[lang][keys[i]] = translatedTexts[i] || texts[i];
      }
    }

    return translations;
  }
}
