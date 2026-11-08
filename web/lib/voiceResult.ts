/** Reads the answer of the voice-process function into what the user has to confirm. */

export type VoiceResult = {
  action: string;
  data?: Record<string, unknown>;
  text?: string;
  agent?: any;
};

export type SpokenItem = {
  description: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
};

/** "1.000" is one thousand and "1,5" one and a half; "1.5" stays a decimal. */
export function parseItalianNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim().replace(/\s|€/g, '');
  if (!text) return null;
  let normalized = text;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text) || text.includes(',')) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function positive(value: unknown): number | null {
  const parsed = parseItalianNumber(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function clean(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Every item the user asked to add, not only the first one. */
export function extractSpokenItems(result: VoiceResult): SpokenItem[] {
  const agentItems: any[] = Array.isArray(result.agent?.quote?.items)
    ? result.agent.quote.items
    : [];
  const items = agentItems
    .map((item) => ({
      description: clean(item?.description),
      quantity: positive(item?.quantity),
      unit: clean(item?.unit) || null,
      unitPrice: parseItalianNumber(item?.unitPrice),
    }))
    .filter((item) => item.description);
  if (!items.length && result.action === 'add_costo' && result.data?.description) {
    items.push({
      description: clean(result.data.description),
      quantity: positive(result.data.quantity),
      unit: clean(result.data.unit) || null,
      unitPrice: parseItalianNumber(result.data.unit_price),
    });
  }
  return items;
}
