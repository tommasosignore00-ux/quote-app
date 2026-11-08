import 'server-only';
import { supabaseAdmin } from './supabase-server';
import { LISTINO_SOURCE_BUCKET } from './listinoSourceStorage';
import { TEMPLATE_ASSETS_BUCKET } from './templateAssets';

/**
 * Every table holding data of an account. Export and deletion read this one list, so
 * a new table added here is covered by both.
 */
export type AccountTable = {
  /** Name of the section in the export. */
  key: string;
  table: string;
  /** Column(s) holding the user id; with two columns a row matches on either. */
  owner?: string[];
  /** For child tables: the column pointing at the ids of an earlier section. */
  parent?: { column: string; key: string };
  /** Secrets and data that is not the account holder's: never exported. */
  omit?: string[];
  /** Explicit columns, when `*` would read something huge (embeddings). */
  columns?: string;
  orderBy?: string[];
  /** Deliberately kept after deletion, so it is not checked for leftovers. */
  keptAfterDeletion?: boolean;
};

export const ACCOUNT_TABLES: AccountTable[] = [
  { key: 'profile', table: 'profiles', owner: ['id'] },
  { key: 'clients', table: 'clienti', owner: ['profile_id'] },
  { key: 'jobs', table: 'lavori', owner: ['profile_id'] },
  {
    key: 'quote_lines',
    table: 'preventivi_dettaglio',
    parent: { column: 'lavoro_id', key: 'jobs' },
  },
  {
    key: 'quote_versions',
    table: 'preventivi_versioni',
    parent: { column: 'lavoro_id', key: 'jobs' },
    // The link token is a credential; IP and browser belong to the signer.
    omit: ['public_token', 'client_ip', 'client_user_agent'],
  },
  { key: 'invoices', table: 'fatture', owner: ['profile_id'] },
  {
    key: 'invoice_lines',
    table: 'fatture_righe',
    parent: { column: 'fattura_id', key: 'invoices' },
  },
  { key: 'payments', table: 'pagamenti', owner: ['profile_id'] },
  {
    key: 'integrations',
    table: 'integrazioni',
    owner: ['profile_id'],
    omit: ['access_token', 'refresh_token'],
  },
  { key: 'price_lists', table: 'listini', owner: ['profile_id'] },
  {
    key: 'price_list_items',
    table: 'listini_vettoriali',
    owner: ['profile_id'],
    columns:
      'id, listino_id, description, unit_price, list_price, markup_percent, sku, category, created_at',
  },
  { key: 'price_list_groups', table: 'listino_pricing_groups', owner: ['profile_id'] },
  { key: 'price_history', table: 'listino_price_history', owner: ['profile_id'] },
  {
    key: 'price_list_markups',
    table: 'listino_category_markups',
    owner: ['profile_id'],
    orderBy: ['listino_id', 'category'],
  },
  {
    key: 'price_list_jobs',
    table: 'listino_jobs',
    owner: ['profile_id'],
    omit: ['result'],
  },
  { key: 'pricing_rules', table: 'pricing_reference_rules', owner: ['profile_id'] },
  { key: 'cross_sell_rules', table: 'cross_sell_rules', owner: ['profile_id'] },
  { key: 'command_mappings', table: 'user_command_mappings', owner: ['profile_id'] },
  { key: 'team_members', table: 'team_members', owner: ['team_owner_id', 'member_id'] },
  {
    key: 'webhook_endpoints',
    table: 'webhook_endpoints',
    owner: ['profile_id'],
    omit: ['secret'],
  },
  {
    key: 'webhook_deliveries',
    table: 'webhook_deliveries',
    parent: { column: 'webhook_id', key: 'webhook_endpoints' },
  },
  { key: 'time_savings', table: 'time_savings_log', owner: ['profile_id'] },
  {
    key: 'affiliate_referrals',
    table: 'affiliate_referrals',
    owner: ['referrer_id', 'referred_id'],
  },
  { key: 'quote_usage', table: 'quote_usage', owner: ['profile_id'] },
  {
    key: 'ai_usage',
    table: 'ai_usage_daily',
    owner: ['profile_id'],
    orderBy: ['day', 'feature'],
  },
  {
    key: 'legal_acceptances',
    table: 'legal_acceptances',
    owner: ['user_id'],
    keptAfterDeletion: true,
  },
  { key: 'audit_logs', table: 'audit_logs', owner: ['user_id'] },
];

const PAGE_SIZE = 1000;
const IN_CHUNK = 200;

function applyOwner(query: any, owner: string[], userId: string) {
  return owner.length === 1
    ? query.eq(owner[0], userId)
    : query.or(owner.map((column) => `${column}.eq.${userId}`).join(','));
}

async function* readPages(build: () => any, orderBy: string[]) {
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = build();
    for (const column of orderBy) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (data?.length) yield data as Record<string, unknown>[];
    if (!data || data.length < PAGE_SIZE) return;
  }
}

/** Reads a table page by page, so a long price list does not fill the memory. */
export async function* readAccountTable(
  table: AccountTable,
  userId: string,
  knownIds: Map<string, string[]>
) {
  const columns = table.columns || '*';
  const orderBy = table.orderBy || ['id'];
  const select = () => supabaseAdmin.from(table.table).select(columns);

  if (table.owner) {
    const owner = table.owner;
    yield* readPages(() => applyOwner(select(), owner, userId), orderBy);
    return;
  }

  const { column, key } = table.parent!;
  const ids = knownIds.get(key) || [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    yield* readPages(() => select().in(column, chunk), orderBy);
  }
}

export function withoutOmitted(table: AccountTable, row: Record<string, unknown>) {
  if (!table.omit?.length) return row;
  const copy = { ...row };
  for (const column of table.omit) delete copy[column];
  return copy;
}

/** Files of an account as `bucket/path`, without opening them. */
type AccountFile = { bucket: string; path: string; size: number | null };

async function listFolder(bucket: string, folder: string): Promise<AccountFile[]> {
  const found: AccountFile[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(folder, { limit: PAGE_SIZE, offset });
    if (error) {
      // A bucket created on first use may not exist yet: then there are no files.
      if (/not found/i.test(error.message)) return found;
      throw new Error(error.message);
    }
    for (const entry of data || []) {
      const path = `${folder}/${entry.name}`;
      if (entry.id === null) found.push(...(await listFolder(bucket, path)));
      else {
        const size = (entry.metadata as { size?: number } | null)?.size ?? null;
        found.push({ bucket, path, size });
      }
    }
    if (!data || data.length < PAGE_SIZE) return found;
  }
}

/** The storage folders that belong to the account. */
async function accountFolders(userId: string) {
  return [
    { bucket: TEMPLATE_ASSETS_BUCKET, folder: userId },
    { bucket: LISTINO_SOURCE_BUCKET, folder: userId },
  ];
}

export async function listAccountFiles(userId: string): Promise<AccountFile[]> {
  const files: AccountFile[] = [];
  for (const { bucket, folder } of await accountFolders(userId)) {
    files.push(...(await listFolder(bucket, folder)));
  }
  return files;
}

export async function removeAccountFiles(userId: string): Promise<number> {
  const files = await listAccountFiles(userId);
  const byBucket = new Map<string, string[]>();
  for (const file of files) {
    byBucket.set(file.bucket, [...(byBucket.get(file.bucket) || []), file.path]);
  }
  for (const [bucket, paths] of byBucket) {
    for (let i = 0; i < paths.length; i += PAGE_SIZE) {
      const { error } = await supabaseAdmin.storage
        .from(bucket)
        .remove(paths.slice(i, i + PAGE_SIZE));
      if (error) throw new Error(error.message);
    }
  }
  return files.length;
}

/** Tables that still hold rows of a deleted user: the database cascade missed them. */
export async function findLeftovers(userId: string): Promise<string[]> {
  const leftovers: string[] = [];
  for (const table of ACCOUNT_TABLES) {
    if (!table.owner || table.keptAfterDeletion) continue;
    const { count, error } = await applyOwner(
      supabaseAdmin.from(table.table).select('*', { count: 'exact', head: true }),
      table.owner,
      userId
    );
    if (error || count) leftovers.push(table.table);
  }
  return leftovers;
}
