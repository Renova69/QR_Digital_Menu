/**
 * Bulgarian Cyrillic -> Latin, following the official State Gazette
 * transliteration table. Adopted as a deterministic product convention because
 * it matches the spelling owners already see on their own documents; it is not
 * a legal requirement on how a trade name must be rendered.
 *
 * Two entries deliberately diverge from generic ISO-9 and must not be
 * "corrected": ъ -> a (ISO-9 gives ŭ/ǎ) and щ -> sht.
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sht',
  ъ: 'a',
  ь: 'y',
  ю: 'yu',
  я: 'ya',
};

export function transliterateBg(input: string): string {
  const lower = input.toLowerCase();
  // Art. 4 of the standard: word-final "-ия" renders as "-ia"
  // (Пицария -> pitsaria, not pitsariya).
  const withIaRule = lower.replace(/ия(?![а-я])/g, 'ia');
  return Array.from(withIaRule)
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join('');
}
