import { supabaseAdmin } from './supabase-server';

const supabase = supabaseAdmin;

const PAGE_SIZE = 1000;
const WRITE_BATCH_SIZE = 500;
// listini_vettoriali.category is VARCHAR(100): longer values make the whole insert fail.
const CATEGORY_MAX_LENGTH = 100;
const PRICE_DECIMALS = 4;

export type ListinoItemInput = {
  description: string;
  unit_price: number;
  markup_percent?: number | null;
  category?: string | null;
  pricing_group?: string | null;
  /** Previous wording of the same item: the existing row is updated (and renamed). */
  source_description?: string | null;
  /** Unit of measure shown on quotes; copied to quote lines that use the item. */
  unit?: string | null;
};

export type ExistingListinoRow = {
  id: string;
  description: string;
  category: string | null;
  pricing_group?: string | null;
  unit_price?: number | string | null;
};

export type PriceChange = { description: string; oldPrice: number; newPrice: number };

/** What a new version of the price list changed compared to the saved one. */
export type ListinoChanges = {
  increased: number;
  decreased: number;
  unchanged: number;
  /** Saved items that are not in the new file (kept, not deleted). */
  missing: number;
  /** Largest variations first, for the summary shown to the user. */
  examples: PriceChange[];
};

export type SaveListinoItemsResult = {
  inserted: number;
  updated: number;
  duplicatesSkipped: number;
  changes: ListinoChanges;
};

const MAX_CHANGE_EXAMPLES = 5;

export function normalizeListinoDescriptionKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function cleanCategory(value: unknown): string | null {
  const text = String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
  return text ? text.slice(0, CATEGORY_MAX_LENGTH) : null;
}

function roundPrice(value: number): number {
  const factor = 10 ** PRICE_DECIMALS;
  return Math.round((Number(value) || 0) * factor) / factor;
}

/** Reads every row of a listino, paging past PostgREST's default 1000-row cap. */
export async function fetchAllListinoRows(params: {
  listinoId: string;
  profileId: string;
}): Promise<ExistingListinoRow[]> {
  const rows: ExistingListinoRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('listini_vettoriali')
      .select('id, description, category, pricing_group, unit_price')
      .eq('listino_id', params.listinoId)
      .eq('profile_id', params.profileId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    rows.push(...((data || []) as ExistingListinoRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

type ListinoPricingSettings = {
  supplierDiscountPercent: number;
  categoryMarkups: Map<string, number>;
} | null;

/**
 * Supplier discount and category markups of a listino. Null when the columns do not
 * exist yet (migration 00029 not applied): items are then saved as before.
 */
async function loadPricingSettings(listinoId: string): Promise<ListinoPricingSettings> {
  try {
    const [
      { data: listino, error: listinoError },
      { data: markups, error: markupsError },
    ] = await Promise.all([
      supabase
        .from('listini')
        .select('supplier_discount_percent')
        .eq('id', listinoId)
        .maybeSingle(),
      supabase
        .from('listino_category_markups')
        .select('category, markup_percent')
        .eq('listino_id', listinoId),
    ]);
    if (listinoError || markupsError) return null;
    return {
      supplierDiscountPercent: Number(listino?.supplier_discount_percent) || 0,
      categoryMarkups: new Map(
        (markups || []).map((row) => [
          String(row.category),
          Number(row.markup_percent) || 0,
        ])
      ),
    };
  } catch {
    return null;
  }
}

/**
 * Saves imported items into a listino. Re-uploading an updated price list updates
 * the price of items already present (same description) instead of duplicating them;
 * the existing embedding and AI category are kept.
 */
export async function saveListinoItems(params: {
  listinoId: string;
  profileId: string;
  items: ListinoItemInput[];
  existingRows?: ExistingListinoRow[];
  /** Prices already net for the user (e.g. "Prezzi per forma"): no supplier discount. */
  skipSupplierDiscount?: boolean;
}): Promise<SaveListinoItemsResult> {
  const settings = await loadPricingSettings(params.listinoId);
  const existingRows = params.existingRows ?? (await fetchAllListinoRows(params));
  const existingByKey = new Map<string, ExistingListinoRow>();
  for (const row of existingRows) {
    const key = normalizeListinoDescriptionKey(row.description);
    if (key && !existingByKey.has(key)) existingByKey.set(key, row);
  }

  const seen = new Set<string>();
  const matchedIds = new Set<string>();
  const priceChanges: Array<PriceChange & { itemId: string }> = [];
  let unchanged = 0;
  const toInsert: Array<Record<string, unknown>> = [];
  const toUpdate: Array<Record<string, unknown>> = [];
  let duplicatesSkipped = 0;
  const now = new Date().toISOString();

  for (const item of params.items) {
    const description = String(item.description || '')
      .replace(/<\/?[a-z!][^>]*>/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const key = normalizeListinoDescriptionKey(description);
    if (!key) continue;
    if (seen.has(key)) {
      duplicatesSkipped++;
      continue;
    }
    seen.add(key);

    // File price = list price; the saved unit_price is the net cost after the
    // supplier discount, and the category markup (if set) wins over the file's.
    const listPrice = roundPrice(item.unit_price);
    const discount =
      settings && !params.skipSupplierDiscount ? settings.supplierDiscountPercent : 0;
    const categoryMarkup = settings?.categoryMarkups.get(
      cleanCategory(item.category) || ''
    );
    const base = {
      listino_id: params.listinoId,
      profile_id: params.profileId,
      description,
      unit_price: roundPrice(listPrice * (1 - discount / 100)),
      markup_percent: Number(
        (categoryMarkup ?? (Number(item.markup_percent) || 0)).toFixed(2)
      ),
      ...(settings && !params.skipSupplierDiscount ? { list_price: listPrice } : {}),
      ...(item.unit ? { unit: String(item.unit).slice(0, 20) } : {}),
    };

    const previousKey = normalizeListinoDescriptionKey(item.source_description);
    const existing =
      existingByKey.get(key) ||
      (previousKey ? existingByKey.get(previousKey) : undefined);
    const group = item.pricing_group
      ? { pricing_group: cleanCategory(item.pricing_group) }
      : {};
    if (existing) {
      matchedIds.add(existing.id);
      const oldPrice =
        existing.unit_price === null || existing.unit_price === undefined
          ? null
          : roundPrice(Number(existing.unit_price));
      if (oldPrice !== null && Number.isFinite(oldPrice)) {
        if (oldPrice === base.unit_price) unchanged++;
        else {
          priceChanges.push({
            itemId: existing.id,
            description,
            oldPrice,
            newPrice: base.unit_price,
          });
        }
      }
      const renamed = normalizeListinoDescriptionKey(existing.description) !== key;
      toUpdate.push({
        ...base,
        ...group,
        id: existing.id,
        category: cleanCategory(item.category) ?? existing.category ?? null,
        // A renamed row needs a new embedding for search.
        ...(renamed ? { embedding: null } : {}),
      });
    } else {
      toInsert.push({
        ...base,
        ...group,
        category: cleanCategory(item.category),
        embedding: null,
        created_at: now,
      });
    }
  }

  for (let i = 0; i < toInsert.length; i += WRITE_BATCH_SIZE) {
    const { error } = await supabase
      .from('listini_vettoriali')
      .insert(toInsert.slice(i, i + WRITE_BATCH_SIZE));
    if (error) throw new Error(error.message);
  }

  // Upsert on the primary key only touches the columns sent, so embedding and
  // created_at of existing rows are preserved.
  // supabase-js sends the union of the keys of a batch and fills the missing ones with
  // NULL: rows that don't touch embedding/pricing_group go in batches of their own.
  const updatesByShape = new Map<string, Array<Record<string, unknown>>>();
  for (const row of toUpdate) {
    const shape = Object.keys(row).sort().join(',');
    const rows = updatesByShape.get(shape) || [];
    rows.push(row);
    updatesByShape.set(shape, rows);
  }
  for (const rows of updatesByShape.values()) {
    for (let i = 0; i < rows.length; i += WRITE_BATCH_SIZE) {
      const { error } = await supabase
        .from('listini_vettoriali')
        .upsert(rows.slice(i, i + WRITE_BATCH_SIZE), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
  }

  if (priceChanges.length) {
    // Price history is informative: never fail the import because of it.
    const historyRows = priceChanges.map((change) => ({
      item_id: change.itemId,
      listino_id: params.listinoId,
      profile_id: params.profileId,
      old_price: change.oldPrice,
      new_price: change.newPrice,
    }));
    for (let i = 0; i < historyRows.length; i += WRITE_BATCH_SIZE) {
      const { error } = await supabase
        .from('listino_price_history')
        .insert(historyRows.slice(i, i + WRITE_BATCH_SIZE));
      if (error) {
        console.warn('Price history not saved:', error.message);
        break;
      }
    }
  }

  const changes: ListinoChanges = {
    increased: priceChanges.filter((change) => change.newPrice > change.oldPrice).length,
    decreased: priceChanges.filter((change) => change.newPrice < change.oldPrice).length,
    unchanged,
    missing: existingRows.filter((row) => !matchedIds.has(row.id)).length,
    examples: [...priceChanges]
      .sort(
        (a, b) =>
          Math.abs(b.newPrice - b.oldPrice) / (b.oldPrice || 1) -
          Math.abs(a.newPrice - a.oldPrice) / (a.oldPrice || 1)
      )
      .slice(0, MAX_CHANGE_EXAMPLES)
      .map(({ description, oldPrice, newPrice }) => ({
        description,
        oldPrice,
        newPrice,
      })),
  };

  return {
    inserted: toInsert.length,
    updated: toUpdate.length,
    duplicatesSkipped,
    changes,
  };
}

/** Applies category changes with one query per category instead of one per row. */
export async function applyListinoCategories(params: {
  listinoId: string;
  profileId: string;
  updates: Array<{ id: string; category: string }>;
}): Promise<number> {
  const idsByCategory = new Map<string, string[]>();
  for (const update of params.updates) {
    const category = cleanCategory(update.category);
    if (!update.id || !category) continue;
    const ids = idsByCategory.get(category) || [];
    ids.push(update.id);
    idsByCategory.set(category, ids);
  }

  let updated = 0;
  for (const [category, ids] of idsByCategory) {
    for (let i = 0; i < ids.length; i += WRITE_BATCH_SIZE) {
      const chunk = ids.slice(i, i + WRITE_BATCH_SIZE);
      const { error } = await supabase
        .from('listini_vettoriali')
        .update({ category })
        .in('id', chunk)
        .eq('listino_id', params.listinoId)
        .eq('profile_id', params.profileId);
      if (!error) updated += chunk.length;
    }
  }
  return updated;
}
