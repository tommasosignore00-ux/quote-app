import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';
// Minimal CSV parser (handles quoted fields, commas, newlines)
function parseCSVText(text: string) {
  const rows: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === '\n' && !inQuotes) {
      rows.push(cur.replace(/\r$/, ''));
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) rows.push(cur.replace(/\r$/, ''));

  if (rows.length === 0) return [];
  const header = rows[0].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(h => h.replace(/^"|"$/g, '').trim());
  const records: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    if (!rows[r].trim()) continue;
    const cols = rows[r].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = cols[c] ?? '';
    }
    records.push(obj);
  }
  return records;
}

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

    // Parse CSV using minimal parser
    const records = parseCSVText(text);

    // Create listino
    const { data: listino, error: listinoErr } = await supabase.from('listini').insert({ profile_id: profileId, name: listinoName || `Imported ${new Date().toISOString()}` }).select().single();
    if (listinoErr) return NextResponse.json({ error: listinoErr.message }, { status: 500 });

    const itemsToInsert = [] as any[];
    for (const r of records) {
      const description = r.description || r.Description || r.desc || r.Descrizione || '';
      const price = parseFloat(r.price || r.Price || r.prezzo || '0') || 0;
      const markup = parseFloat(r.markup || r.markup_percent || '0') || 0;
      itemsToInsert.push({ listino_id: listino.id, profile_id: profileId, description: description.trim(), unit_price: price, markup_percent: markup });
    }

    // Insert in batches
    const batchSize = 200;
    for (let i = 0; i < itemsToInsert.length; i += batchSize) {
      const batch = itemsToInsert.slice(i, i + batchSize);
      const { error } = await supabase.from('listini_vettoriali').insert(batch.map(item => ({
        title: item.description.substring(0, 120),
        description: item.description,
        price: item.unit_price,
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

    return NextResponse.json({ ok: true, inserted: itemsToInsert.length });
  } catch (err: any) {
    console.error('Upload listini error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
