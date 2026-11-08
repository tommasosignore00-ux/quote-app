import { enforceAiQuota } from '../../../../lib/aiQuota';
import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnProfile,
  requireActiveSubscription,
} from '../../../../lib/apiAuth';
import { rateLimitVoice } from '../../../../lib/rate-limit';
import { openai } from '../../../../lib/openaiServer';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { getListinoProfileIds } from '../../../../lib/listinoAccess';

const supabase = supabaseAdmin;
const MAX_QUERY_LENGTH = 500;

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const notEntitled = await requireActiveSubscription(user.id);
    if (notEntitled) return notEntitled;
    const limited = await rateLimitVoice(user.id);
    if (!limited.success) {
      return NextResponse.json(
        { error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429, headers: limited.headers }
      );
    }
    const quotaExceeded = await enforceAiQuota(user.id, 'semantic');
    if (quotaExceeded) return quotaExceeded;
    const { query, profileId: claimedProfileId } = await req.json();
    if (!isOwnProfile(user, claimedProfileId)) return forbiddenResponse();
    const profileId = user.id;
    if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: 'Ricerca non valida' }, { status: 400 });
    }

    const embeddingRes = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });
    const embedding = embeddingRes.data[0].embedding;

    const { data: items } = await supabase.rpc('match_listini_profiles', {
      query_embedding: embedding,
      match_threshold: 0.5,
      match_count: 5,
      p_profile_ids: await getListinoProfileIds(profileId),
    });

    if (!items || items.length === 0) {
      return NextResponse.json({ item: null, alternatives: [] });
    }

    const itemIds = items.map((item: { id: string }) => item.id).filter(Boolean);
    const { data: metadataRows } = await supabase
      .from('listini_vettoriali')
      .select('id, listino_id, category, listini(name)')
      .in('id', itemIds);

    const metadataMap = new Map(
      (metadataRows || []).map((row) => {
        const relatedListino = row.listini as
          { name?: string } | { name?: string }[] | null;
        const listinoName = Array.isArray(relatedListino)
          ? (relatedListino[0]?.name ?? null)
          : (relatedListino?.name ?? null);

        return [
          row.id,
          {
            listino_id: row.listino_id,
            category: row.category,
            listino_name: listinoName,
          },
        ];
      })
    );

    const normalizedItems = items.map((item: { id: string; [key: string]: unknown }) => ({
      ...item,
      ...(metadataMap.get(item.id) || {}),
    }));

    // Similar in meaning is not the same article: always candidates, the user decides.
    return NextResponse.json({ item: null, alternatives: normalizedItems.slice(0, 5) });
  } catch {
    return NextResponse.json({ error: 'Ricerca non riuscita' }, { status: 500 });
  }
}
