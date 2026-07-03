import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { parseUniversalCsvText } from '../../../../lib/listinoUniversalImport';

const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const listinoName = formData.get('listinoName') as string | null;
    const profileId = formData.get('profileId') as string | null;

    if (!file || !profileId) return NextResponse.json({ error: 'Missing file or profileId' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const text = Buffer.from(arrayBuffer).toString('utf-8');

    // Parse CSV with universal normalizer (units, packs, localized numbers)
    const parsed = parseUniversalCsvText(text);

    // Create listino
    const { data: listino, error: listinoErr } = await supabase.from('listini').insert({ profile_id: profileId, name: listinoName || `Imported ${new Date().toISOString()}` }).select().single();
    if (listinoErr) return NextResponse.json({ error: listinoErr.message }, { status: 500 });

    const itemsToInsert = [] as any[];
    for (const row of parsed.items) {
      itemsToInsert.push({
        listino_id: listino.id,
        profile_id: profileId,
        description: row.description.trim(),
        unit_price: row.unit_price,
        markup_percent: row.markup_percent,
      });
    }

    // Insert in batches
    const batchSize = 200;
    for (let i = 0; i < itemsToInsert.length; i += batchSize) {
      const batch = itemsToInsert.slice(i, i + batchSize);
      const { error } = await supabase.from('listini_vettoriali').insert(batch.map(item => ({
        profile_id: item.profile_id,
        title: item.description.substring(0, 120),
        description: item.description,
        unit_price: item.unit_price,
        markup_percent: item.markup_percent,
        listino_id: item.listino_id,
        embedding: null,
        created_at: new Date(),
      })));
      if (error) console.warn('Insert batch error', error.message);
    }

    // Kick off embedding job: call internal endpoint to generate embeddings for new listini_vettoriali
    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/embeddings/bulk-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listinoId: listino.id }),
      });
    } catch (e) {
      console.warn('Failed to trigger bulk embeddings', e);
    }

    return NextResponse.json({ ok: true, inserted: itemsToInsert.length, summary: parsed.summary });
  } catch (err: any) {
    console.error('Upload listini error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
