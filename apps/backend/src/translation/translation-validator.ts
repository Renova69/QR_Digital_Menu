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
// Supported target locales written in neither Latin nor Cyrillic script.
// They take part in the identity check below (Cyrillic copied through
// unchanged is untranslated for a Greek/Japanese/Chinese/Arabic menu just as
// it is for an English one) but deliberately NOT in the predominance analysis
// further down, which only knows how to count Latin and Cyrillic characters.
// Enumerated rather than expressed as "any target that is not Cyrillic" so an
// unrecognised language code makes no claim about script and is never flagged
// on identity alone.
const OTHER_SCRIPT_LANGUAGES = ['el', 'ja', 'zh', 'ar'];

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

  const normalizedTargetLang = targetLang.trim().toLowerCase().split('-')[0];

  const trimmedSource = source.trim();
  const trimmedTranslation = translation.trim();

  // Identity is valid for script-compatible proper nouns (Pizza -> Pizza),
  // but Cyrillic surviving unchanged into a target that does not use Cyrillic
  // is an obviously untranslated value. Treat it as stale so Translate All can
  // repair cached source copies instead of preserving them as CURRENT forever.
  //
  // ANY Cyrillic is enough \u2014 the value does not have to be purely Cyrillic.
  // This rule previously also required the source to contain no Latin, which
  // exempted every mixed brand name: live Pro Dining data (2026-08-10) kept
  // "\u0414\u0436\u0438\u043D Beefeater", "\u0420\u043E\u0437\u0435 Pinot Noir" and "\u0421\u0442\u0443\u0434\u0435\u043D \u0427\u0430\u0439 Lipton" as their own
  // English translations, because the Latin brand made them "mixed script".
  // An English menu should not read "\u0414\u0436\u0438\u043D".
  //
  // Pure-Latin names are unaffected: they contain no Cyrillic to match. If a
  // value genuinely cannot be translated, the retry is bounded \u2014 the worker
  // parks it in NEEDS_REVIEW, which claimBatch never picks up, so it costs one
  // extra attempt rather than looping.
  if (trimmedSource === trimmedTranslation) {
    const sourceHasCyrillic = /[\u0400-\u04FF]/.test(trimmedSource);
    const targetRejectsCyrillicIdentity =
      LATIN_LANGUAGES.includes(normalizedTargetLang) ||
      OTHER_SCRIPT_LANGUAGES.includes(normalizedTargetLang);
    return targetRejectsCyrillicIdentity && sourceHasCyrillic;
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
      CYRILLIC_LANGUAGES.includes(normalizedTargetLang) &&
      isPredominantlyLatin &&
      cyrillicCount === 0
    ) {
      return true;
    }

    if (
      LATIN_LANGUAGES.includes(normalizedTargetLang) &&
      isPredominantlyCyrillic &&
      latinCount === 0
    ) {
      return true;
    }
  }

  return false;
}
