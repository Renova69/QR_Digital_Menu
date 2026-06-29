import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import resourcesToBackend from "i18next-resources-to-backend";

const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

function syncDocumentLanguage(language: string) {
  if (typeof document === "undefined") return;
  const normalized = language.toLowerCase().split("-")[0];
  document.documentElement.lang = normalized;
  document.documentElement.dir = RTL_LANGUAGES.has(normalized) ? "rtl" : "ltr";
}

i18n.on("languageChanged", syncDocumentLanguage);

// Lazy-load each language's translation bundle on demand instead of statically
// importing all three into the entry chunk. Previously en/bg/ro (~135 KB gzip
// combined) shipped to every visitor including the public menu, even though a
// session uses one language. Vite code-splits each JSON into its own chunk and
// only the active language is fetched; fallback ('bg') loads on demand when a
// key is missing. react-i18next Suspense (handled by the root <Suspense> in
// index.tsx) covers the brief async load before first paint.
i18n
  .use(LanguageDetector)
  .use(
    resourcesToBackend(
      (language: string) => import(`./locales/${language}/translation.json`),
    ),
  )
  .use(initReactI18next)
  .init({
    // JA/RU/AR carry only the customer-facing subset; their dashboard/admin keys
    // are not yet translated. Fall those back to English (a complete bundle and a
    // far better default for international owners) rather than Bulgarian. Every
    // other language keeps the BG-market default.
    fallbackLng: {
      ja: ["en"],
      ru: ["en"],
      ar: ["en"],
      default: ["bg"],
    },
    detection: {
      order: ["querystring", "localStorage", "cookie"],
      caches: ["localStorage"],
    },
    // Public-menu target languages. bg/en/ro ship full app bundles; the rest carry
    // a public-menu-only subset (src/locales/<lang>/translation.json) so customer
    // chrome localizes too. Missing keys fall back to Bulgarian for the BG market.
    supportedLngs: [
      "en",
      "bg",
      "ro",
      "de",
      "es",
      "fr",
      "it",
      "zh",
      "el",
      "ja",
      "ru",
      "ar",
    ],
    // Strip region subtags (e.g. 'en-US' → 'en') so the detector never asks the
    // backend for a language chunk that does not exist.
    load: "languageOnly",
    nsSeparator: false,
    interpolation: {
      escapeValue: false, // React already safeguards from xss
    },
    react: {
      useSuspense: true,
    },
  });

export default i18n;
