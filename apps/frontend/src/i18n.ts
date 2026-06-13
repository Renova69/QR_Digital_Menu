import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';

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
    fallbackLng: 'bg',
    supportedLngs: ['en', 'bg', 'ro'],
    // Strip region subtags (e.g. 'en-US' → 'en') so the detector never asks the
    // backend for a language chunk that does not exist.
    load: 'languageOnly',
    nsSeparator: false,
    interpolation: {
      escapeValue: false, // React already safeguards from xss
    },
    react: {
      useSuspense: true,
    },
  });

export default i18n;
