import OpenAI from 'openai';
import { supabaseAdmin } from './supabase-server';
import type { UniversalParsedItem } from './listinoUniversalImport';
import { loadStoredReferenceRules } from './listinoPricing';
import { saveListinoItems } from './listinoItemsStore';
import { scheduleEmbeddingsForListino } from './bulkGenerateEmbeddings';

const supabase = supabaseAdmin;
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/** Bump when the PDF parser changes how candidates are built: older sources get re-read. */
export const LISTINO_PARSER_VERSION = 2;

const GROUP_NAME_MAX_LENGTH = 100;
// A catalogue counts as "without prices" when the PDF has (almost) no amounts but many
// rows with a measurement that a per-shape price can turn into a price.
const MIN_GROUPED_ITEMS = 8;
const MAX_PRICED_ITEMS_FOR_PRICELESS = 7;

export type ListinoPricingGroup = {
  id?: string;
  name: string;
  reference_unit: string;
  unit_price: number | null;
  item_count: number;
  sort_order: number;
};

export function isPricelessCatalogue(items: UniversalParsedItem[]): boolean {
  const grouped = items.filter(
    (item) => item.pricing_group && (item.pricing_basis_quantity || 0) > 0
  );
  const priced = items.filter((item) => item.unit_price > 0).length;
  return grouped.length >= MIN_GROUPED_ITEMS && priced <= MAX_PRICED_ITEMS_FOR_PRICELESS;
}

function cleanGroupName(value: string): string {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return 'Altro';
  return (text.charAt(0).toUpperCase() + text.slice(1)).slice(0, GROUP_NAME_MAX_LENGTH);
}

const PROFILE_ACRONYMS = new Set([
  'HEA',
  'HEB',
  'HEM',
  'HE',
  'IPE',
  'IPN',
  'NP',
  'UPN',
  'UPE',
  'DN',
  'PN',
  'INP',
  'UNP',
]);

const LOWERCASE_WORDS = new Set([
  'a',
  'ad',
  'al',
  'ai',
  'alla',
  'con',
  'da',
  'del',
  'dei',
  'della',
  'di',
  'e',
  'ed',
  'in',
  'per',
  'su',
]);

/**
 * One spelling for every shape name, whatever the AI or the PDF wrote: first letter
 * uppercase, the rest lowercase, except profile/size acronyms (HEA, IPE, UPN, DN).
 */
export function normalizeGroupCasing(value: string): string {
  const words = cleanGroupName(value).split(' ');
  return words
    .map((word, index) => {
      const bare = word.replace(/[^\p{L}\p{N}]/gu, '');
      if (index > 0) {
        // Profile acronyms (HEA, IPE, UPN) and profile letters ("a T", "a U", "a L").
        if (PROFILE_ACRONYMS.has(bare.toUpperCase())) return word.toUpperCase();
        if (
          /^\p{L}$/u.test(bare) &&
          bare === bare.toUpperCase() &&
          !LOWERCASE_WORDS.has(bare.toLowerCase())
        ) {
          return word;
        }
        // Grades and sizes ("S275JR", "DN50") stay as written.
        if (/\d/.test(bare)) return word;
      }
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}

function groupKey(value: string): string {
  return cleanGroupName(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Gives every shape one clean name, always written the same way ("Tondi laminati",
 * "Travi HEA"). The AI merges spelling variants of the same shape and fixes headings
 * glued together by the PDF layout; without AI the headings are just tidied up.
 */
export async function canonicalizeGroupNames(
  rawNames: string[]
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(rawNames.map((name) => cleanGroupName(name))));
  const mapping = new Map<string, string>(
    unique.map((name) => [name, normalizeGroupCasing(name)])
  );
  if (!openai || unique.length === 0) return mapping;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_AGENT_MODEL || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Ricevi i titoli delle tabelle di un catalogo tecnico (siderurgia, tubi, lamiere...). ' +
            'Ogni titolo diventa una "forma" con un proprio prezzo al kg, quindi: ' +
            '1) Unisci SOLO titoli che indicano lo stesso identico prodotto scritto in modo diverso ' +
            '(maiuscole, plurale, parole in più senza significato): devono avere esattamente lo stesso nome. ' +
            '2) Mantieni SEMPRE le parole che cambiano il prezzo: materiale (acciaio, alluminio, inox), ' +
            'lavorazione (laminati, trafilati, saldati, senza saldatura, elettroforgiato), finitura ' +
            '(zincati, decapati, neri), tipo e uso (spigoli vivi, mobilio, per coperture, per solai), sigle (HEA, HEB, IPE, NP, UPN). ' +
            'Nel dubbio NON unire. ' +
            '3) Nome in italiano, 2-6 parole, prima lettera maiuscola, resto minuscolo tranne le sigle. ' +
            '4) Se il titolo contiene due titoli incollati per errore dal layout del PDF, usa il primo. ' +
            '5) Se un titolo inizia con una parola generica (es. "Zincato", "Serie media zincati"), completalo ' +
            'con il prodotto che si capisce dal contesto degli altri titoli solo se è evidente, altrimenti lascialo. ' +
            'Rispondi solo JSON: {"groups":[{"title":"<titolo ricevuto>","name":"<nome forma>"}]}',
        },
        { role: 'user', content: JSON.stringify({ titles: unique }) },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content || '{}') as {
      groups?: Array<{ title?: string; name?: string }>;
    };
    // Same shape -> same spelling, even if the AI writes the case differently.
    const spellingByKey = new Map<string, string>();
    for (const group of parsed.groups || []) {
      const title = cleanGroupName(String(group.title || ''));
      const name = normalizeGroupCasing(String(group.name || ''));
      if (!mapping.has(title) || !group.name) continue;
      const key = groupKey(name);
      if (!spellingByKey.has(key)) spellingByKey.set(key, name);
      mapping.set(title, spellingByKey.get(key)!);
    }
  } catch (error) {
    console.warn(
      'Pricing group naming via AI failed, keeping catalogue headings:',
      error
    );
  }

  return mapping;
}

/** Renames grouped items to their canonical shape: description prefix, category and group. */
export function applyCanonicalGroups(
  items: UniversalParsedItem[],
  mapping: Map<string, string>
): UniversalParsedItem[] {
  return items.map((item) => {
    if (!item.pricing_group) return item;
    const raw = cleanGroupName(item.pricing_group);
    const canonical = mapping.get(raw) || raw;
    const sourceDescription = item.source_description || item.description;
    const description = sourceDescription.startsWith(item.pricing_group)
      ? `${canonical}${sourceDescription.slice(item.pricing_group.length)}`
      : sourceDescription;
    return {
      ...item,
      description,
      source_description: sourceDescription,
      category: canonical,
      pricing_group: canonical,
    };
  });
}

export async function loadPricingGroups(params: {
  listinoId: string;
  profileId: string;
}): Promise<ListinoPricingGroup[]> {
  const { data, error } = await supabase
    .from('listino_pricing_groups')
    .select('id, name, reference_unit, unit_price, item_count, sort_order')
    .eq('listino_id', params.listinoId)
    .eq('profile_id', params.profileId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).map((group) => ({
    ...group,
    unit_price: group.unit_price === null ? null : Number(group.unit_price),
  })) as ListinoPricingGroup[];
}

/**
 * Creates/updates the "Prezzi per forma" rows for the shapes found in the catalogue.
 * Prices already set by the user are kept; a new shape starts from the user's general
 * rule for that material (e.g. Ferro / acciaio €/kg) when one exists, else empty.
 */
export async function syncPricingGroups(params: {
  listinoId: string;
  profileId: string;
  items: UniversalParsedItem[];
}): Promise<ListinoPricingGroup[]> {
  const existing = await loadPricingGroups(params);
  const existingByName = new Map(existing.map((group) => [group.name, group]));
  const storedRules = await loadStoredReferenceRules(params.profileId);

  const order: string[] = [];
  const stats = new Map<
    string,
    { count: number; unit: string; ruleKeys: Map<string, number> }
  >();
  for (const item of params.items) {
    if (!item.pricing_group) continue;
    const name = item.pricing_group;
    if (!stats.has(name)) {
      order.push(name);
      stats.set(name, {
        count: 0,
        unit: item.pricing_basis_unit || 'kg',
        ruleKeys: new Map(),
      });
    }
    const entry = stats.get(name)!;
    entry.count++;
    if (item.inferred_rule_key) {
      entry.ruleKeys.set(
        item.inferred_rule_key,
        (entry.ruleKeys.get(item.inferred_rule_key) || 0) + 1
      );
    }
  }

  const rows = order.map((name, index) => {
    const entry = stats.get(name)!;
    const previous = existingByName.get(name);
    const mainRuleKey = Array.from(entry.ruleKeys.entries()).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];
    const fromGeneralRule = mainRuleKey
      ? storedRules.get(`${mainRuleKey}::${entry.unit}`)
      : undefined;
    return {
      listino_id: params.listinoId,
      profile_id: params.profileId,
      name,
      reference_unit: entry.unit,
      unit_price: previous
        ? previous.unit_price
        : fromGeneralRule && fromGeneralRule > 0
          ? fromGeneralRule
          : null,
      item_count: entry.count,
      sort_order: index,
    };
  });

  if (rows.length) {
    const { error } = await supabase
      .from('listino_pricing_groups')
      .upsert(rows, { onConflict: 'listino_id,name' });
    if (error) throw new Error(error.message);
  }

  // Shapes no longer in the catalogue (e.g. renamed by a newer parser) are removed.
  const stale = existing
    .filter((group) => !stats.has(group.name))
    .map((group) => group.id!);
  if (stale.length) {
    await supabase.from('listino_pricing_groups').delete().in('id', stale);
  }

  return loadPricingGroups(params);
}

/** Prices grouped items as measurement x shape price; shapes without a price are left out. */
export function priceGroupedItems(
  items: UniversalParsedItem[],
  groups: ListinoPricingGroup[]
): UniversalParsedItem[] {
  const priceByGroup = new Map(
    groups
      .filter((group) => (group.unit_price || 0) > 0)
      .map((group) => [group.name, group.unit_price!])
  );
  const priced: UniversalParsedItem[] = [];
  for (const item of items) {
    const groupPrice = item.pricing_group
      ? priceByGroup.get(item.pricing_group)
      : undefined;
    if (!groupPrice || !(item.pricing_basis_quantity && item.pricing_basis_quantity > 0))
      {continue;}
    priced.push({
      ...item,
      unit_price: Math.round(groupPrice * item.pricing_basis_quantity * 10000) / 10000,
      pricing_source: 'reference_rule',
      pricing_status: 'resolved',
    });
  }
  return priced;
}

/** Writes the priced items of a catalogue without prices into the listino. */
export async function applyGroupPricesToListino(params: {
  listinoId: string;
  profileId: string;
  candidates: UniversalParsedItem[];
  groups: ListinoPricingGroup[];
}) {
  const priced = priceGroupedItems(params.candidates, params.groups);
  const saved = await saveListinoItems({
    listinoId: params.listinoId,
    profileId: params.profileId,
    items: priced,
  });
  if (saved.inserted || saved.updated) scheduleEmbeddingsForListino(params.listinoId);

  const pendingGroups = params.groups.filter((group) => !((group.unit_price || 0) > 0));
  return {
    ...saved,
    pricedItems: priced.length,
    pendingGroups: pendingGroups.length,
    pendingItems: pendingGroups.reduce((sum, group) => sum + group.item_count, 0),
  };
}
