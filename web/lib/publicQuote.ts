import 'server-only';
import { supabaseAdmin } from './supabase-server';

export const LINK_EXPIRED_MESSAGE =
  'Questo link è scaduto: chiedi un nuovo link a chi ti ha inviato il preventivo.';
export const NOT_LATEST_MESSAGE =
  'Esiste una versione più recente di questo preventivo: chiedi il nuovo link a chi te lo ha inviato.';

export function isPublicLinkExpired(expiresAt: string | null | undefined): boolean {
  return !!expiresAt && new Date(expiresAt).getTime() <= Date.now();
}

/** The client can answer only the last version sent for a job. */
export async function isLatestQuoteVersion(
  lavoroId: string,
  revision: number
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('preventivi_versioni')
    .select('id')
    .eq('lavoro_id', lavoroId)
    .gt('revision', revision)
    .limit(1);
  if (error) throw new Error(error.message);
  return !data?.length;
}
