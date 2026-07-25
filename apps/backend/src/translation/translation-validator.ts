/**
 * Known NLLB hallucination patterns that typically appear when translating
 * short menu items from Bulgarian to English.
 */
export const KNOWN_HALLUCINATION_PATTERNS = [
  /^\s*(I'm going to|I am going to|It's all right|It is all right|What's going on|What is going on|Other, including mixtures|I don't know|I do not know|Let me|Here we go|This is a)\s*$/i,
];

const CYRILLIC_LANGUAGES = ['ru', 'bg', 'uk', 'be', 'sr', 'mk'];
const LATIN_LANGUAGES = [
  'en',
  'de',
  'fr',
  'es',
  'it',
  'ro',
  'pl',
  'cs',
  'sk',
  'hu',
];

/**
 * Detects if the translation provided by a model (like NLLB) is likely hallucinated garbage.
 * NLLB tends to hallucinate long conversational English for short Cyrillic inputs it doesn't understand.
 *
 * @param source The original source text
 * @param translation The translated text
 * @param targetLang The target language code
 * @returns True if the translation is likely garbage
 */
export function isGarbageTranslation(
  source: string,
  translation: string,
  targetLang: string,
): boolean {
  if (!translation || translation.trim() === '') return true;

  const trimmedSource = source.trim();
  const trimmedTranslation = translation.trim();

  // 4. Identity check
  // If the translation is identical to the source, it's not a hallucination, just an un-translated string.
  // We return false here to let other parts of the system handle it (e.g. fallback).
  if (trimmedSource === trimmedTranslation) {
    return false;
  }

  // 1. Length ratio check
  // Loosened for DeepL (2026-07-25) — the old <30 chars / >4x rule false-
  // positived on entirely legitimate DeepL output for short menu terms,
  // e.g. bg "Боб" (3 chars) -> de "Bohneneintopf" (13 chars, 4.3x) or
  // bg "Кебапче" (7 chars) -> de "Kebapche (gegrillte Hackfleischrolle)"
  // (38 chars, 5.4x) — both correct translations that would have been
  // discarded. Genuine hallucination (the failure mode this rule targets)
  // produces a long, multi-word, unrelated sentence, not just a longer
  // single compound word/gloss — require both a higher ratio AND several
  // words before flagging.
  const translationWordCount = trimmedTranslation
    .split(/\s+/)
    .filter(Boolean).length;
  if (
    trimmedSource.length < 15 &&
    trimmedTranslation.length > trimmedSource.length * 8 &&
    translationWordCount >= 4
  ) {
    return true;
  }

  // 2. Known garbage patterns
  for (const pattern of KNOWN_HALLUCINATION_PATTERNS) {
    if (pattern.test(trimmedTranslation)) {
      return true;
    }
  }

  // 3. Script mismatch
  const cyrillicCount = (trimmedTranslation.match(/[\u0400-\u04FF]/g) || [])
    .length;
  const latinCount = (trimmedTranslation.match(/[a-zA-Z]/g) || []).length;
  const totalChars = trimmedTranslation.replace(/\s/g, '').length;

  if (totalChars > 0) {
    const isPredominantlyCyrillic = cyrillicCount / totalChars > 0.5;
    const isPredominantlyLatin = latinCount / totalChars > 0.5;

    // Require the expected script to be entirely absent, not just a minority,
    // before flagging (2026-07-25 live-data finding). The glossary now keeps
    // brand/dish proper nouns untranslated inline (DO_NOT_TRANSLATE /
    // PROTECTED_DISH), so a correct bg translation like
    // 'Стриди „Fine de Claire“' for 'Fine de Claire Oysters' can legitimately
    // be >50% Latin by character count while still containing real Cyrillic
    // translated content ("Стриди"). Genuine hallucination/failure-to-translate
    // produces zero characters in the target script, not merely a minority.
    if (
      CYRILLIC_LANGUAGES.includes(targetLang) &&
      isPredominantlyLatin &&
      cyrillicCount === 0
    ) {
      return true;
    }

    if (
      LATIN_LANGUAGES.includes(targetLang) &&
      isPredominantlyCyrillic &&
      latinCount === 0
    ) {
      return true;
    }
  }

  return false;
}
