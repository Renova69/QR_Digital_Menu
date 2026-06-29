/**
 * Pick the language a public menu should open in.
 *
 * A QR code may deep-link a customer to a specific language via `?lang=<code>`.
 * The requested code is honoured only when it is one of the restaurant's enabled
 * target languages (matched case-insensitively, canonical casing returned).
 * Otherwise the first target language is used. Returns `undefined` when the
 * restaurant has no target languages configured.
 */
export function resolveInitialLanguage(
  targetLanguages: string[],
  requestedLang: string | null | undefined,
): string | undefined {
  if (targetLanguages.length === 0) return undefined;

  if (requestedLang) {
    const normalized = requestedLang.toLowerCase();
    const match = targetLanguages.find(
      (lang) => lang.toLowerCase() === normalized,
    );
    if (match) return match;
  }

  return targetLanguages[0];
}
