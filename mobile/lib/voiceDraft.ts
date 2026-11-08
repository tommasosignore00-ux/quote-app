/**
 * Turns the answer of the voice-process function into a draft the user confirms:
 * the items to add (with the spoken quantity and unit) and the customer and job
 * named in the audio, if any.
 */

import { normalizeName, normalizeSpokenTrade } from './listinoSearch';

export { normalizeName, normalizeSpokenTrade };

export type VoiceResult = {
  action: string;
  data?: Record<string, unknown>;
  text?: string;
  agent?: any;
};

export type VoiceItem = {
  description: string;
  /** null: no quantity was said, the user has to give one before confirming. */
  quantity: number | null;
  unit: string | null;
  /** Price said aloud, if any. */
  unitPrice: number | null;
};

export type NamedRecord = { id: string; name: string };
export type JobRecord = { id: string; title: string; cliente_id: string };

/** A voice session: dictations go to this job until it expires or is closed. */
export type VoiceSession = { clienteId: string; lavoroId: string; lastUsedAt: number };

export const VOICE_SESSION_TTL_MS = 30 * 60 * 1000;

export function isSessionActive(session: VoiceSession | null, now = Date.now()): session is VoiceSession {
  return Boolean(session && now - session.lastUsedAt < VOICE_SESSION_TTL_MS);
}

/**
 * Italian number: "1.000" is one thousand and "1,5" one and a half; a lone dot followed
 * by anything but three digits is a decimal ("1.5", as the AI writes it).
 */
export function parseItalianNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim().replace(/\s|€/g, '');
  if (!text) return null;
  let normalized = text;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) normalized = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) normalized = text.replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toQuantity(value: unknown): number | null {
  const parsed = parseItalianNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function toPrice(value: unknown): number | null {
  const parsed = parseItalianNumber(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9,
  dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16,
  diciassette: 17, diciotto: 18, diciannove: 19,
};
const TENS: Array<[string, number]> = [
  ['venti', 20], ['vent', 20], ['trenta', 30], ['trent', 30], ['quaranta', 40], ['quarant', 40],
  ['cinquanta', 50], ['cinquant', 50], ['sessanta', 60], ['sessant', 60], ['settanta', 70], ['settant', 70],
  ['ottanta', 80], ['ottant', 80], ['novanta', 90], ['novant', 90],
];

/** "centoventi" -> 120, "ventotto" -> 28, "duemila" -> 2000; null when it is not a number. */
export function wordToNumber(input: string): number | null {
  const word = input.toLowerCase().replace(/tré$/, 'tre');
  if (word in NUMBER_WORDS) return NUMBER_WORDS[word];
  const thousands = word.match(/^(.*?)(mille|mila)(.*)$/);
  if (thousands) {
    const head = thousands[1] ? wordToNumber(thousands[1]) : 1;
    const tail = thousands[3] ? wordToNumber(thousands[3]) : 0;
    return head === null || tail === null ? null : head * 1000 + tail;
  }
  const hundreds = word.match(/^(.*?)cento(.*)$/);
  if (hundreds) {
    const head = hundreds[1] ? wordToNumber(hundreds[1]) : 1;
    const tail = hundreds[2] ? wordToNumber(hundreds[2]) : 0;
    return head === null || tail === null ? null : head * 100 + tail;
  }
  for (const [stem, value] of TENS) {
    if (word === stem && stem.length > 4 && /[ia]$/.test(stem)) return value;
    if (word.startsWith(stem)) {
      const tail = wordToNumber(word.slice(stem.length));
      if (tail !== null && tail < 10) return value + tail;
    }
  }
  return null;
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

/** Every item the user asked to add, not only the first one. */
export function extractVoiceItems(result: VoiceResult): VoiceItem[] {
  const agentItems = Array.isArray(result.agent?.quote?.items) ? result.agent.quote.items : [];
  const items: VoiceItem[] = agentItems
    .map((item: any) => ({
      description: normalizeSpokenTrade(cleanText(item?.description)),
      quantity: toQuantity(item?.quantity),
      unit: normalizeSpokenUnit(cleanText(item?.unit) || null),
      unitPrice: toPrice(item?.unitPrice),
    }))
    .filter((item: VoiceItem) => item.description);

  if (!items.length && result.action === 'add_costo' && result.data?.description) {
    items.push({
      description: normalizeSpokenTrade(cleanText(result.data.description)),
      quantity: toQuantity(result.data.quantity),
      unit: normalizeSpokenUnit(cleanText(result.data.unit) || null),
      unitPrice: toPrice(result.data.unit_price),
    });
  }
  // The AI did not return the item: read "aggiungi 6 metri di ..." from the transcript.
  if (!items.length && result.text && !result.action.startsWith('create_')) {
    const fromText = itemFromTranscript(result.text);
    if (fromText) items.push(fromText);
  }
  return items;
}

const ADD_VERBS = /^(?:aggiungi|aggiungere|metti|mettere|inserisci|inserire|aggiungo|metto)\s+/i;
const QUANTITY_UNIT =
  'metri lineari|metro lineare|metri quadri|metri quadrati|metro quadro|metro quadrato|metri cubi|metro cubo|metri|metro|mt|mq|mc|ml|m|pezzi|pezzo|pz|kg|chili|chilo|litri|litro|nr|ore|ora';
const AFTER_QUANTITY = new RegExp(`^(?:\\s+e\\s+mezz[oa]\\b)?\\s*(${QUANTITY_UNIT})?(?:\\s+e\\s+mezz[oa]\\b)?(?=\\s|$)\\s*(?:di\\s+|da\\s+)?`, 'i');

/** Quantity at the start of a phrase, in digits or words ("6", "sei", "due metri e mezzo"). */
function readLeadingQuantity(text: string): { quantity: number; unit: string | null; length: number } | null {
  const digits = text.match(/^\d+(?:[.,]\d+)*/);
  const word = digits ? null : text.match(/^[a-zàèéìòù]+/i);
  let value = digits ? parseItalianNumber(digits[0]) : null;
  if (word) value = /^mezz[oa]$/i.test(word[0]) ? 0.5 : wordToNumber(word[0]);
  if (value === null) return null;
  const start = (digits || word)![0].length;
  const after = text.slice(start).match(AFTER_QUANTITY);
  if (!after) return null;
  if (/e\s+mezz[oa]/i.test(after[0])) value += 0.5;
  return { quantity: value, unit: normalizeSpokenUnit(after[1] || null), length: start + after[0].length };
}

/** "Aggiungi 6 metri di trave IPE 120." -> 6 m of "trave IPE 120". */
export function itemFromTranscript(text: string): VoiceItem | null {
  const sentence = normalizeSpokenTrade(cleanText(text)).replace(/[.!?]+$/, '');
  if (!ADD_VERBS.test(sentence)) return null;
  let rest = sentence.replace(ADD_VERBS, '');
  let quantity: number | null = null;
  let unit: string | null = null;
  const leading = readLeadingQuantity(rest);
  if (leading) {
    quantity = leading.quantity;
    unit = leading.unit;
    rest = rest.slice(leading.length);
  }
  rest = rest.trim();
  return rest ? { description: rest, quantity, unit, unitPrice: null } : null;
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
  [/^(m|mt|ml|metr[oi]( linear[ei])?)$/, 'm'],
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

/**
 * "10 metri di tubo" -> "tubo": the quantity said at the start is not part of the
 * article name, while a size after it ("tondo da 10") is.
 */
export function stripLeadingQuantity(description: string, quantity: number | null): string {
  if (quantity === null) return description;
  const text = String(description ?? '').trimStart();
  const leading = readLeadingQuantity(text);
  if (!leading || leading.quantity !== quantity) return description;
  const rest = text.slice(leading.length).trim();
  return rest || description;
}
