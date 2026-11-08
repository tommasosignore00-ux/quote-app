import { supabase } from './supabase';

export type Listino = {
  id: string;
  name: string;
  profile_id: string;
  canEdit: boolean;
  /** Shown only to team members; null for owners and solo accounts. */
  ownershipLabel: 'Del titolare' | 'Personale' | null;
};

/** The user's price lists plus, for team members, those of their team owner. */
export async function fetchAccessibleListini(userId: string): Promise<Listino[]> {
  // No profile filter on listini: RLS returns exactly the rows this user can read.
  const [listiniResult, membershipsResult] = await Promise.all([
    supabase.from('listini').select('id, name, profile_id').order('name', { ascending: true }),
    supabase
      .from('team_members')
      .select('team_owner_id, permissions')
      .eq('member_id', userId)
      .eq('active', true)
      .not('accepted_at', 'is', null),
  ]);
  if (listiniResult.error) throw listiniResult.error;
  if (membershipsResult.error) throw membershipsResult.error;

  const memberships = (membershipsResult.data || []) as Array<{
    team_owner_id: string;
    permissions: { can_manage_listini?: boolean } | null;
  }>;
  const isTeamMember = memberships.some((row) => row.team_owner_id !== userId);
  const canManageByOwner = new Map(
    memberships.map((row) => [row.team_owner_id, row.permissions?.can_manage_listini === true])
  );

  return ((listiniResult.data || []) as Array<{ id: string; name: string; profile_id: string }>).map(
    (row) => {
      const own = row.profile_id === userId;
      return {
        ...row,
        canEdit: own || canManageByOwner.get(row.profile_id) === true,
        ownershipLabel: !isTeamMember ? null : own ? 'Personale' : 'Del titolare',
      };
    }
  );
}
