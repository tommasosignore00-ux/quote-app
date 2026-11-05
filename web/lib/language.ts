import i18n from './i18n';
import { normalizeLanguage } from './constants';

export const setLanguage = async (lang: string) => {
  const safeLang = normalizeLanguage(lang);
  await i18n.changeLanguage(safeLang);
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('i18nextLng', safeLang);
    } catch {
      // storage non disponibile: ignora
    }
  }
};

export const getStoredLanguage = (): string | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('i18nextLng');
    return stored ? normalizeLanguage(stored) : null;
  } catch {
    return null;
  }
};
