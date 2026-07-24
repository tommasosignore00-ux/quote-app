const rawWebApiUrl =
  process.env.EXPO_PUBLIC_WEB_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  '';

export function getWebApiBaseUrl(): string | null {
  const trimmed = rawWebApiUrl.trim();
  if (!trimmed) return null;

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const normalized = new URL(withProtocol);
    return normalized.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(
      "EXPO_PUBLIC_WEB_URL non e valido. Usa un URL completo come 'https://tuo-sito.vercel.app'."
    );
  }
}

export function isWebApiConfigured(): boolean {
  try {
    return Boolean(getWebApiBaseUrl());
  } catch {
    return false;
  }
}

export function buildWebApiUrl(path: string): string {
  const baseUrl = getWebApiBaseUrl();
  if (!baseUrl) {
    throw new Error(
      'Manca EXPO_PUBLIC_WEB_URL. Impostalo con l\'URL del sito web per usare import avanzato, PDF e organizzazione AI anche sul mobile.'
    );
  }

  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
