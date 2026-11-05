import 'intl-pluralrules';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ACTIVE_LANGUAGE_CODES, DEFAULT_LANGUAGE } from './market';

const resources = {
  it: { translation: require('../locales/it.json') },
  en: { translation: require('../locales/en.json') },
  de: { translation: require('../locales/de.json') },
  fr: { translation: require('../locales/fr.json') },
  es: { translation: require('../locales/es.json') },
  pt: { translation: require('../locales/pt.json') },
  pl: { translation: require('../locales/pl.json') },
  nl: { translation: require('../locales/nl.json') },
  zh: { translation: require('../locales/zh.json') },
  ru: { translation: require('../locales/ru.json') },
  cs: { translation: require('../locales/cs.json') },
  hu: { translation: require('../locales/hu.json') },
  ro: { translation: require('../locales/ro.json') },
  uk: { translation: require('../locales/uk.json') },
  hr: { translation: require('../locales/hr.json') },
  sk: { translation: require('../locales/sk.json') },
  bg: { translation: require('../locales/bg.json') },
  sl: { translation: require('../locales/sl.json') },
  el: { translation: require('../locales/el.json') },
  ja: { translation: require('../locales/ja.json') },
  ko: { translation: require('../locales/ko.json') },
};

i18n.use(initReactI18next).init({
  resources,
  // App disponibile solo in Italia: interfaccia fissa in italiano,
  // indipendentemente dalla lingua del dispositivo.
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...ACTIVE_LANGUAGE_CODES],
  compatibilityJSON: 'v3',
  interpolation: { escapeValue: false },
});

export default i18n;
