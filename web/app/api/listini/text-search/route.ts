import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';

export async function POST(req: Request) {
  try {
    const { query, profileId } = await req.json();
    if (!query || !profileId) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

    // Simple text search using PostgreSQL ILIKE
    const searchTerm = `%${query.toLowerCase()}%`;
    
    const { data: items, error } = await supabaseAdmin
      .from('listini_vettoriali')
      .select('id, description, unit_price, markup_percent, listino_id, category, listini(name)')
      .eq('profile_id', profileId)
      .ilike('description', searchTerm)
      .limit(5);

    if (error) throw error;

    if (!items || items.length === 0) {
      return NextResponse.json({ item: null, alternatives: [] });
    }

    const normalizedItems = (items || []).map((item) => {
      const relatedListino = item.listini as { name?: string } | { name?: string }[] | null;
      const listinoName = Array.isArray(relatedListino)
        ? relatedListino[0]?.name ?? null
        : relatedListino?.name ?? null;

      return {
      id: item.id,
      description: item.description,
      unit_price: item.unit_price,
      markup_percent: item.markup_percent,
      listino_id: item.listino_id,
      category: item.category,
      listino_name: listinoName,
    };
    });

    return NextResponse.json({ item: normalizedItems[0], alternatives: normalizedItems.slice(1) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
