import { isGarbageTranslation } from './translation-validator';

describe('isGarbageTranslation', () => {
  describe('empty/blank translation', () => {
    it('flags an empty string as garbage', () => {
      expect(isGarbageTranslation('Мезе', '', 'en')).toBe(true);
    });

    it('flags a whitespace-only string as garbage', () => {
      expect(isGarbageTranslation('Мезе', '   ', 'en')).toBe(true);
    });
  });

  describe('identity (untranslated) — not garbage', () => {
    it('does not flag an identical source/translation pair', () => {
      expect(isGarbageTranslation('Pizza', 'Pizza', 'en')).toBe(false);
    });

    it('does not flag identity after trimming', () => {
      expect(isGarbageTranslation(' Pizza ', 'Pizza', 'en')).toBe(false);
    });

    it('flags untranslated Cyrillic identity text for a Latin target', () => {
      expect(
        isGarbageTranslation('Шкембе на фурна', 'Шкембе на фурна', 'en'),
      ).toBe(true);
    });

    it.each(['EN', 'en-US', ' en-us '])(
      'normalizes locale variant %s before the identity check',
      (locale) => {
        expect(isGarbageTranslation('Луканка', 'Луканка', locale)).toBe(true);
      },
    );
  });

  describe('length ratio — real legitimate DeepL output must NOT be flagged (2026-07-25 rework)', () => {
    it('does not flag bg "Боб" -> de "Bohneneintopf" (4.3x, 1 word)', () => {
      expect(isGarbageTranslation('Боб', 'Bohneneintopf', 'de')).toBe(false);
    });

    it('does not flag bg "Кебапче" -> de "Kebapche (gegrillte Hackfleischrolle)" (5.4x, 3 words)', () => {
      expect(
        isGarbageTranslation(
          'Кебапче',
          'Kebapche (gegrillte Hackfleischrolle)',
          'de',
        ),
      ).toBe(false);
    });

    it('does not flag bg "Таратор" -> en "Cold cucumber yoghurt soup" (3.7x, borderline)', () => {
      expect(
        isGarbageTranslation('Таратор', 'Cold cucumber yoghurt soup', 'en'),
      ).toBe(false);
    });

    it('does not flag a long-but-legitimate multi-word gloss under the 15-char source floor', () => {
      // 16-char source is outside the <15 scope entirely, regardless of ratio.
      expect(
        isGarbageTranslation(
          'Пилешка супа с ф',
          'Chicken soup with extra vegetables and herbs',
          'en',
        ),
      ).toBe(false);
    });
  });

  describe('length ratio — genuine hallucination is still caught', () => {
    it('flags a short source exploding into a long, multi-word, unrelated sentence', () => {
      expect(
        isGarbageTranslation(
          'Боб',
          'I am going to tell you about this in a moment',
          'en',
        ),
      ).toBe(true);
    });

    it('does not flag when the ratio is high but the translation is a single word', () => {
      expect(isGarbageTranslation('Боб', 'Beaaaaaaaaaans', 'en')).toBe(false);
    });

    it('does not flag when word count is high but the ratio is under 8x', () => {
      const source = 'Боб'; // 3 chars, 8x floor = 24 chars
      const translation = 'Bean stew ok'; // 12 chars, 4 words — ratio 4x
      expect(isGarbageTranslation(source, translation, 'en')).toBe(false);
    });
  });

  describe('known hallucination patterns', () => {
    it.each([
      "I'm going to",
      'I am going to',
      "It's all right",
      'What is going on',
      "I don't know",
      'Let me',
      'Here we go',
    ])('flags known garbage phrase "%s"', (phrase) => {
      expect(isGarbageTranslation('Мезета', phrase, 'en')).toBe(true);
    });

    it('does not flag unrelated text that happens to contain a substring', () => {
      expect(
        isGarbageTranslation('Мезета', 'Appetizers, let me know', 'en'),
      ).toBe(false);
    });
  });

  describe('script mismatch', () => {
    it('flags predominantly-Cyrillic output for a Latin-script target language', () => {
      expect(isGarbageTranslation('Кебапче', 'Кебапче стил', 'en')).toBe(true);
    });

    it('does not flag Cyrillic output for a Cyrillic-script target language (bg -> ru)', () => {
      expect(isGarbageTranslation('Кебапче', 'Кебапче', 'ru')).toBe(false);
    });

    it('flags predominantly-Latin output for a Cyrillic-script target language', () => {
      expect(isGarbageTranslation('Кебапче', 'Kebapche grilled', 'ru')).toBe(
        true,
      );
    });

    it('does not flag a DO_NOT_TRANSLATE-style identity brand name regardless of script', () => {
      // "Pepsi" -> "Pepsi" is an identity match, caught by the identity
      // check before script analysis ever runs.
      expect(isGarbageTranslation('Pepsi', 'Pepsi', 'ru')).toBe(false);
    });

    it('does not flag mixed-script output where Cyrillic content stays under the 50% predominance threshold for a Latin target', () => {
      // "Kebapcheсябълка" (spaces stripped for the script check): 8 Latin
      // letters / 15 total = 53% Latin, 47% Cyrillic — under the >50%
      // Cyrillic-predominance bar that would flag a Latin target language.
      expect(
        isGarbageTranslation('Кебапче с ябълка', 'Kebapche с ябълка', 'en'),
      ).toBe(false);
    });

    it('does not flag a real Cyrillic translation that embeds a longer untranslated glossary proper noun', () => {
      // Live-data regression (2026-07-25): DeepL correctly translated
      // "Oysters" -> "Стриди" and left the DO_NOT_TRANSLATE brand
      // "Fine de Claire" untranslated inline, per glossary. The Latin
      // proper noun outweighs the Cyrillic word by character count, but
      // real Cyrillic translated content is present, so this must not flag.
      expect(
        isGarbageTranslation(
          'Fine de Claire Oysters',
          'Стриди „Fine de Claire“',
          'bg',
        ),
      ).toBe(false);
    });

    it('still flags a Cyrillic-target translation with zero Cyrillic characters', () => {
      expect(
        isGarbageTranslation(
          'Fine de Claire Oysters',
          'Fine de Claire raw oysters',
          'bg',
        ),
      ).toBe(true);
    });
  });
});
