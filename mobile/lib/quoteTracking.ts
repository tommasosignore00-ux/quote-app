import { supabase } from './supabase';

export type QuoteVersionRow = {
  id: string;
  lavoro_id: string;
  revision: number;
  created_at: string;
  sent_at: string | null;
  recipient_email: string | null;
  client_decision: 'accepted' | 'rejected' | null;
  client_decision_at: string | null;
  client_signer_name: string | null;
  client_note: string | null;
  lavori: { title: string; clienti: { name: string; phone?: string | null } | null } | null;
};

export type QuoteStage = 'accepted' | 'rejected' | 'sent' | 'validated';

export const STAGE_LABELS: Record<QuoteStage, string> = {
  accepted: 'Accettato',
  rejected: 'Rifiutato',
  sent: 'Inviato, in attesa',
  validated: 'Convalidato, da inviare',
};

const COLUMNS =
  'id, lavoro_id, revision, created_at, sent_at, recipient_email, client_decision, client_decision_at, client_signer_name, client_note, lavori(title, clienti(name, phone))';

export function quoteStage(row: QuoteVersionRow): QuoteStage {
  if (row.client_decision) return row.client_decision;
  return row.sent_at ? 'sent' : 'validated';
}

/** The latest version of each job, newest first: one row per quote. */
export function latestPerJob(rows: QuoteVersionRow[]): QuoteVersionRow[] {
  const seen = new Set<string>();
  return [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((row) => {
      if (seen.has(row.lavoro_id)) return false;
      seen.add(row.lavoro_id);
      return true;
    });
}

export async function fetchQuoteVersions(): Promise<QuoteVersionRow[]> {
  const { data, error } = await supabase
    .from('preventivi_versioni')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data || []) as unknown as QuoteVersionRow[];
}

/** Accepted quotes the owner has not been told about yet. */
export async function fetchUnseenAcceptances(): Promise<QuoteVersionRow[]> {
  const { data, error } = await supabase
    .from('preventivi_versioni')
    .select(COLUMNS)
    .in('client_decision', ['accepted', 'rejected'])
    .is('owner_notified_at', null)
    .order('client_decision_at', { ascending: true });
  if (error) return [];
  return (data || []) as unknown as QuoteVersionRow[];
}

export async function markAcceptanceSeen(id: string): Promise<void> {
  await supabase
    .from('preventivi_versioni')
    .update({ owner_notified_at: new Date().toISOString() })
    .eq('id', id);
}
