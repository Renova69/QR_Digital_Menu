import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  async translateTexts(
    texts: string[],
    targetLanguage: string,
    apiKey: string,
  ): Promise<string[]> {
    if (!texts || texts.length === 0) return texts;

    try {
      const isFreeApi = apiKey.endsWith(':fx');
      const baseUrl = isFreeApi
        ? 'https://api-free.deepl.com'
        : 'https://api.deepl.com';
      const targetLang = targetLanguage.toUpperCase();

      const response = await axios.post(
        `${baseUrl}/v2/translate`,
        {
          text: texts,
          target_lang: targetLang,
        },
        {
          headers: {
            Authorization: `DeepL-Auth-Key ${apiKey}`,
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

  async translateText(
    text: string,
    targetLanguage: string,
    apiKey: string,
  ): Promise<string> {
    const results = await this.translateTexts([text], targetLanguage, apiKey);
    return results[0] || text;
  }

  async translateObject(
    obj: Record<string, string | null | undefined>,
    targetLanguages: string[],
    apiKey: string,
  ): Promise<Record<string, Record<string, string>>> {
    const translations: Record<string, Record<string, string>> = {};

    if (!targetLanguages || targetLanguages.length === 0 || !apiKey) {
      return translations;
    }

    const entriesToTranslate = Object.entries(obj).filter(
      ([_, value]) => value && value.trim() !== '',
    );
    if (entriesToTranslate.length === 0) return translations;

    const keys = entriesToTranslate.map(([key]) => key);
    const texts = entriesToTranslate.map(([_, value]) => value);

    for (const lang of targetLanguages) {
      translations[lang] = {};
      const translatedTexts = await this.translateTexts(texts, lang, apiKey);

      for (let i = 0; i < keys.length; i++) {
        translations[lang][keys[i]] = translatedTexts[i] || texts[i];
      }
    }

    return translations;
  }
}
