import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnProfile,
} from '../../../../lib/apiAuth';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { getListinoProfileIds } from '../../../../lib/listinoAccess';
import {
  buildListinoFilters,
  parseListinoQuery,
  rankListinoMatches,
} from '../../../../lib/listinoSearch';

const COLUMNS =
  'id, description, unit_price, markup_percent, listino_id, category, listini(name)';

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const { query, profileId: claimedProfileId } = await req.json();
    if (!isOwnProfile(user, claimedProfileId)) return forbiddenResponse();
    const profileId = user.id;
    if (!query) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    const text = String(query);
    const filters = buildListinoFilters(parseListinoQuery(text));
    const profileIds = await getListinoProfileIds(profileId);

    const search = async (orFilters: string[]) => {
      let request = supabaseAdmin
        .from('listini_vettoriali')
        .select(COLUMNS)
        .in('profile_id', profileIds);
      for (const filter of orFilters) request = request.or(filter);
      const { data, error } = await request.order('description').limit(400);
      if (error) throw error;
      return rankListinoMatches(data || [], text).slice(0, 5);
    };

    // Articles with everything that was asked first, then anything sharing a word or size.
    let items = filters.all.length ? await search(filters.all) : [];
    if (items.length === 0 && filters.any) items = await search([filters.any]);

    if (!items || items.length === 0) {
      return NextResponse.json({ item: null, alternatives: [], fullMatch: false });
    }

    const normalizedItems = items.map((item) => {
      const relatedListino = item.listini as
        { name?: string } | { name?: string }[] | null;
      const listinoName = Array.isArray(relatedListino)
        ? (relatedListino[0]?.name ?? null)
        : (relatedListino?.name ?? null);

      return {
        id: item.id,
        description: item.description,
        unit_price: item.unit_price,
        markup_percent: item.markup_percent,
        listino_id: item.listino_id,
        category: item.category,
        listino_name: listinoName,
        fullMatch: item.fullMatch,
      };
    });

    return NextResponse.json({
      item: normalizedItems[0],
      alternatives: normalizedItems.slice(1),
      // Exactly one article has everything asked: only then it can be applied by itself.
      fullMatch: normalizedItems.filter((item) => item.fullMatch).length === 1,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
