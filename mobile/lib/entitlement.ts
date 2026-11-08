import { supabase } from './supabase';

const PAID_STATUSES = ['trialing', 'active', 'past_due'];

/** Fast local answer from the user's own profile. */
export function hasPaidStatus(status?: string | null): boolean {
  return PAID_STATUSES.includes(status ?? '');
}

/** Includes access inherited from a team. The server checks again on every paid call. */
export async function loadEntitlement(status?: string | null): Promise<boolean> {
  const { data, error } = await supabase.rpc('my_entitlement');
  if (error) return hasPaidStatus(status);
  return data === true;
}
