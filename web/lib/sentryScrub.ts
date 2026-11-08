const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const QUOTE_LINK = new RegExp(`/q/${UUID}`, 'gi');
const QUOTE_API = new RegExp(`/api/public/quote/${UUID}`, 'gi');

export function scrubText(value: string): string {
  return value
    .replace(QUOTE_LINK, '/q/[token]')
    .replace(QUOTE_API, '/api/public/quote/[token]');
}

function scrub(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      value[index] = scrub(item, seen);
    });
    return value;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const clean = scrubText(key);
    const item = scrub(record[key], seen);
    if (clean !== key) delete record[key];
    record[clean] = item;
  }
  return record;
}

/**
 * The token in a quote link is the client's only credential: it must never reach
 * Sentry, whether in the URL, a breadcrumb or a transaction name.
 */
export function scrubQuoteTokens<T>(event: T): T {
  return scrub(event, new WeakSet()) as T;
}
