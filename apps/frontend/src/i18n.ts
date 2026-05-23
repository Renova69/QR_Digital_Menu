import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslation from './locales/en/translation.json';
import bgTranslation from './locales/bg/translation.json';
import roTranslation from './locales/ro/translation.json';

const resources = {
  en: {
    translation: enTranslation,
  },
  bg: {
    translation: bgTranslation,
  },
  ro: {
    translation: roTranslation,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'bg',
    namespaceSeparator: false,
    interpolation: {
      escapeValue: false, // React already safeguards from xss
    },
  });

export default i18n;
