function normalizeLanguageCode(language: string | null | undefined): string {
  return String(language || "bg")
    .toLowerCase()
    .split("-")[0];
}

const DASHBOARD_LANGUAGES = new Set(["bg", "ro", "en"]);

// Priority order for the public menu language selector (after the active language).
// EN and BG are primary dashboard languages and appear before RO, then all others
// follow in their configured order.
const LANG_PRIORITY: Record<string, number> = { en: 0, bg: 1, ro: 2 };

/**
 * Build the language list shown on a public menu.
 *
 * The owner's dashboard language is the default and therefore comes first.
 * Remaining languages are sorted by priority (EN → BG → RO) so common
 * languages surface near the top, with any additional target languages
 * appended in their configured order.
 */
export function buildPublicMenuLanguages(
  dashboardLanguage: string | null | undefined,
  targetLanguages: readonly string[] | null | undefined,
): string[] {
  const requestedDefault = normalizeLanguageCode(dashboardLanguage);
  const dashboardDefault = DASHBOARD_LANGUAGES.has(requestedDefault)
    ? requestedDefault
    : "bg";

  const normalized = (targetLanguages ?? []).map(normalizeLanguageCode);
  const [first, ...rest] = [...new Set([dashboardDefault, ...normalized])];

  const prioritized = rest.filter((l) => l in LANG_PRIORITY);
  const others = rest.filter((l) => !(l in LANG_PRIORITY));

  prioritized.sort(
    (a, b) => (LANG_PRIORITY[a] ?? 99) - (LANG_PRIORITY[b] ?? 99),
  );

  return [first, ...prioritized, ...others];
}

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
    const normalized = requestedLang.toLowerCase().split("-")[0];
    const match = targetLanguages.find(
      (lang) => lang.toLowerCase().split("-")[0] === normalized,
    );
    if (match) return match;
  }

  return targetLanguages[0];
}
