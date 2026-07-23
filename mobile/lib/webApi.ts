const rawWebApiUrl =
  process.env.EXPO_PUBLIC_WEB_URL ||
  process.env.EXPO_PUBLIC_API_URL ||
  '';

export function getWebApiBaseUrl(): string | null {
  const trimmed = rawWebApiUrl.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, '');
}

export function isWebApiConfigured(): boolean {
  return Boolean(getWebApiBaseUrl());
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
