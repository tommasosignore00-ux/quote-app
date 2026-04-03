import i18n from './i18n';

export const setLanguage = async (lang: string) => {
  await i18n.changeLanguage(lang);
  if (typeof window !== 'undefined') {
    localStorage.setItem('i18nextLng', lang);
  }
};

export const getStoredLanguage = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('i18nextLng');
};
