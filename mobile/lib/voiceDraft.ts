/**
 * Turns the answer of the voice-process function into a draft the user confirms:
 * the items to add (with the spoken quantity and unit) and the customer and job
 * named in the audio, if any.
 */

export type VoiceResult = {
  action: string;
  data?: Record<string, unknown>;
  text?: string;
  agent?: any;
};

export type VoiceItem = {
  description: string;
  quantity: number;
  unit: string | null;
};

export type NamedRecord = { id: string; name: string };
export type JobRecord = { id: string; title: string; cliente_id: string };

/** A voice session: dictations go to this job until it expires or is closed. */
export type VoiceSession = { clienteId: string; lavoroId: string; lastUsedAt: number };

export const VOICE_SESSION_TTL_MS = 30 * 60 * 1000;

export function isSessionActive(session: VoiceSession | null, now = Date.now()): session is VoiceSession {
  return Boolean(session && now - session.lastUsedAt < VOICE_SESSION_TTL_MS);
}

function toQuantity(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/** Every item the user asked to add, not only the first one. */
export function extractVoiceItems(result: VoiceResult): VoiceItem[] {
  const agentItems = Array.isArray(result.agent?.quote?.items) ? result.agent.quote.items : [];
  const items: VoiceItem[] = agentItems
    .map((item: any) => ({
      description: cleanText(item?.description),
      quantity: toQuantity(item?.quantity),
      unit: normalizeSpokenUnit(cleanText(item?.unit) || null),
    }))
    .filter((item: VoiceItem) => item.description);

  if (!items.length && result.action === 'add_costo' && result.data?.description) {
    items.push({
      description: cleanText(result.data.description),
      quantity: toQuantity(result.data.quantity),
      unit: normalizeSpokenUnit(cleanText(result.data.unit) || null),
    });
  }
  return items;
}

export function normalizeName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Records whose name matches what was said: exact name first, then names that
 * contain it (or are contained in it), then names sharing every spoken word.
 */
export function matchByName<T>(records: T[], spoken: unknown, nameOf: (record: T) => string): T[] {
  const target = normalizeName(spoken);
  if (!target) return [];
  const exact = records.filter((record) => normalizeName(nameOf(record)) === target);
  if (exact.length) return exact;
  const partial = records.filter((record) => {
    const name = normalizeName(nameOf(record));
    return name && (name.includes(target) || target.includes(name));
  });
  if (partial.length) return partial;
  const words = target.split(' ').filter((word) => word.length >= 3);
  if (!words.length) return [];
  return records.filter((record) => {
    const name = normalizeName(nameOf(record));
    return words.every((word) => name.includes(word));
  });
}

/** Customer and job named in the audio, as ids when they match exactly one record. */
export function resolveSpokenTarget(
  result: VoiceResult,
  clienti: NamedRecord[],
  lavori: JobRecord[]
): { clienteId: string | null; lavoroId: string | null; jobTitle: string | null } {
  const agent = result.agent || {};
  const ids = new Set(clienti.map((cliente) => cliente.id));
  const spokenCustomerId = [agent.customer?.id, agent.job?.customerId, agent.quote?.customerId].find(
    (id) => typeof id === 'string' && ids.has(id)
  ) as string | undefined;
  const customerName = agent.customer?.name || agent.job?.customerName || result.data?.cliente_name || null;

  let clienteId: string | null = spokenCustomerId || null;
  if (!clienteId && customerName) {
    const matches = matchByName(clienti, customerName, (cliente) => cliente.name);
    if (matches.length === 1) clienteId = matches[0].id;
  }

  const jobIds = new Set(lavori.map((lavoro) => lavoro.id));
  const spokenJobId = [agent.job?.id, agent.quote?.jobId].find(
    (id) => typeof id === 'string' && jobIds.has(id)
  ) as string | undefined;
  const jobTitle = cleanText(agent.job?.title) || null;

  let lavoroId: string | null = null;
  if (spokenJobId) {
    lavoroId = spokenJobId;
  } else if (jobTitle) {
    const pool = clienteId ? lavori.filter((lavoro) => lavoro.cliente_id === clienteId) : lavori;
    const matches = matchByName(pool, jobTitle, (lavoro) => lavoro.title);
    if (matches.length === 1) lavoroId = matches[0].id;
  }

  // A job tells which customer it belongs to.
  if (lavoroId) {
    const lavoro = lavori.find((job) => job.id === lavoroId);
    if (lavoro) {
      if (clienteId && lavoro.cliente_id !== clienteId) lavoroId = null;
      else clienteId = lavoro.cliente_id;
    }
  }

  return { clienteId, lavoroId, jobTitle };
}

/** "10 m", "2 pz", "1,5 kg": quantity in Italian format with its unit. */
export function formatQuantity(quantity: number, unit: string | null): string {
  const text = quantity.toLocaleString('it-IT', { maximumFractionDigits: 3 });
  return unit ? `${text} ${unit}` : text;
}

const SPOKEN_UNITS: Array<[RegExp, string]> = [
  [/^(m|mt|ml|metr[oi]( lineari?)?)$/, 'm'],
  [/^(m2|mq|m²|metr[oi] quadr[oi]|metr[oi] quadrat[oi])$/, 'm²'],
  [/^(m3|mc|m³|metr[oi] cub[oi])$/, 'm³'],
  [/^(pz|pezz[oi]|n|nr|numero|unita|unità)$/, 'pz'],
  [/^(kg|chil[oi]|chilogramm[oi])$/, 'kg'],
  [/^(l|lt|litr[oi])$/, 'l'],
  [/^(h|ore|ora)$/, 'h'],
];

/** "metri" -> "m", "pezzi" -> "pz": the unit as it is written on quotes. */
export function normalizeSpokenUnit(unit: string | null): string | null {
  const text = String(unit ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!text) return null;
  for (const [pattern, normalized] of SPOKEN_UNITS) {
    if (pattern.test(text)) return normalized;
  }
  return text.slice(0, 20);
}

// Words that say nothing about which article it is.
const SEARCH_STOPWORDS = new Set([
  'aggiungi', 'aggiungere', 'metti', 'mettere', 'inserisci', 'anche', 'poi',
  'di', 'da', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'con', 'per', 'tra', 'fra',
  'al', 'allo', 'alla', 'ai', 'agli', 'alle', 'il', 'lo', 'la', 'le', 'gli', 'un', 'una', 'uno',
  'ed', 'mm', 'cm', 'mt', 'ml', 'metri', 'metro', 'pezzi', 'pezzo', 'pz', 'kg', 'chili', 'litri', 'nr', 'numero',
]);

/**
 * Words to look for in the price list: no numbers, units or filler words, and the
 * final vowel dropped so "tubo" also finds "tubi" and "raccordo" finds "raccordi".
 */
export function listinoSearchWords(query: string): string[] {
  const words = normalizeName(query)
    .split(' ')
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !SEARCH_STOPWORDS.has(word))
    .map((word) => (word.length >= 4 && /[aeiou]$/.test(word) ? word.slice(0, -1) : word));
  return Array.from(new Set(words));
}

/** How many of the search words an article description contains. */
export function countWordHits(description: string, words: string[]): number {
  const text = normalizeName(description);
  return words.filter((word) => text.includes(word)).length;
}
