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
      .select('id, description, unit_price, markup_percent, listino_id')
      .eq('profile_id', profileId)
      .ilike('description', searchTerm)
      .limit(5);

    if (error) throw error;

    if (!items || items.length === 0) {
      return NextResponse.json({ item: null, alternatives: [] });
    }

    // Return best match (first one)
    return NextResponse.json({ item: items[0], alternatives: items.slice(1) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
