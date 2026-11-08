import 'server-only';
import { supabaseAdmin } from './supabase-server';

export type ListinoAccess = {
  /** Profile that owns the listino: use it for its data and its stored source file. */
  ownerProfileId: string;
  canEdit: boolean;
};

/** Own profile plus the owners of the teams the user actively belongs to. */
export async function getListinoProfileIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('team_members')
    .select('team_owner_id')
    .eq('member_id', userId)
    .eq('active', true);
  if (error) throw new Error(error.message);
  return Array.from(new Set([userId, ...(data || []).map((row) => row.team_owner_id as string)]));
}

/** What the user can do on a listino; null when it is neither theirs nor their team owner's. */
export async function getListinoAccess(
  userId: string,
  listinoId: string
): Promise<ListinoAccess | null> {
  const { data: listino, error } = await supabaseAdmin
    .from('listini')
    .select('profile_id')
    .eq('id', listinoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!listino) return null;
  if (listino.profile_id === userId) return { ownerProfileId: userId, canEdit: true };

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('team_members')
    .select('permissions')
    .eq('team_owner_id', listino.profile_id)
    .eq('member_id', userId)
    .eq('active', true)
    .maybeSingle();
  if (membershipError) throw new Error(membershipError.message);
  if (!membership) return null;
  const permissions = membership.permissions as { can_manage_listini?: boolean } | null;
  return {
    ownerProfileId: listino.profile_id,
    canEdit: permissions?.can_manage_listini === true,
  };
}
