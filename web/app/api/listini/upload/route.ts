import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import * as XLSX from 'xlsx';
import { mergeUniversalImportResults, parseUniversalCsvText, parseUniversalSpreadsheetRows } from '../../../../lib/listinoUniversalImport';

const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const listinoName = formData.get('listinoName') as string | null;
    const profileId = formData.get('profileId') as string | null;
    const listinoId = formData.get('listinoId') as string | null;

    if (!file || !profileId) return NextResponse.json({ error: 'Missing file or profileId' }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const ext = file.name.split('.').pop()?.toLowerCase();

    const parsed = ext === 'xlsx' || ext === 'xls'
      ? (() => {
          const workbook = XLSX.read(arrayBuffer, { type: 'array' });
          return mergeUniversalImportResults(
            workbook.SheetNames.map((sheetName) => {
              const worksheet = workbook.Sheets[sheetName];
              const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false, blankrows: false }) as unknown[][];
              return parseUniversalSpreadsheetRows(rows);
            })
          );
        })()
      : parseUniversalCsvText(Buffer.from(arrayBuffer).toString('utf-8'));

    if (!parsed.items.length) {
      return NextResponse.json(
        {
          error: 'Nessuna riga valida trovata nel file. Verifica che esistano almeno una colonna descrizione e una colonna prezzo.',
          summary: parsed.summary,
        },
        { status: 400 }
      );
    }

    let targetListinoId = listinoId;
    if (targetListinoId) {
      const { data: existingListino, error: existingListinoErr } = await supabase
        .from('listini')
        .select('id')
        .eq('id', targetListinoId)
        .eq('profile_id', profileId)
        .maybeSingle();
      if (existingListinoErr) return NextResponse.json({ error: existingListinoErr.message }, { status: 500 });
      if (!existingListino) return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });
    } else {
      const { data: listino, error: listinoErr } = await supabase
        .from('listini')
        .insert({ profile_id: profileId, name: listinoName || `Imported ${new Date().toISOString()}` })
        .select('id')
        .single();
      if (listinoErr) return NextResponse.json({ error: listinoErr.message }, { status: 500 });
      targetListinoId = listino.id;
    }

    const itemsToInsert = [] as any[];
    for (const row of parsed.items) {
      itemsToInsert.push({
        listino_id: targetListinoId,
        profile_id: profileId,
        description: row.description.trim(),
        unit_price: row.unit_price,
        markup_percent: row.markup_percent,
        category: row.category || null,
      });
    }

    // Insert in batches
    const batchSize = 200;
    for (let i = 0; i < itemsToInsert.length; i += batchSize) {
      const batch = itemsToInsert.slice(i, i + batchSize);
      const { error } = await supabase.from('listini_vettoriali').insert(batch.map(item => ({
        profile_id: item.profile_id,
        description: item.description,
        unit_price: item.unit_price,
        markup_percent: item.markup_percent,
        category: item.category,
        listino_id: item.listino_id,
        embedding: null,
        created_at: new Date().toISOString(),
      })));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Kick off embedding job: call internal endpoint to generate embeddings for new listini_vettoriali
    try {
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
      await fetch(`${origin}/api/embeddings/bulk-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listinoId: targetListinoId }),
      });
    } catch (e) {
      console.warn('Failed to trigger bulk embeddings', e);
    }

    return NextResponse.json({ ok: true, inserted: itemsToInsert.length, listinoId: targetListinoId, summary: parsed.summary });
  } catch (err: any) {
    console.error('Upload listini error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
