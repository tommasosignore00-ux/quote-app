import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnProfile,
} from '../../../../lib/apiAuth';
import { supabaseAdmin } from '../../../../lib/supabase-server';

const supabase = supabaseAdmin;

async function ownListino(listinoId: string, profileId: string) {
  const { data, error } = await supabase
    .from('listini')
    .select('id, supplier_discount_percent')
    .eq('id', listinoId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function parsePercent(value: unknown, max: number): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0 || n >= max) return NaN;
  return Math.round(n * 100) / 100;
}

/** Supplier discount and category markups of a listino, with its categories. */
export async function GET(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const { searchParams } = new URL(req.url);
    if (!isOwnProfile(user, searchParams.get('profileId'))) return forbiddenResponse();
    const listinoId = searchParams.get('listinoId') || '';
    const listino = listinoId ? await ownListino(listinoId, user.id) : null;
    if (!listino)
      {return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });}

    const [{ data: markups }, { data: rows }] = await Promise.all([
      supabase
        .from('listino_category_markups')
        .select('category, markup_percent')
        .eq('listino_id', listinoId),
      supabase
        .from('listini_vettoriali')
        .select('category')
        .eq('listino_id', listinoId)
        .not('category', 'is', null)
        .limit(10000),
    ]);
    const counts = new Map<string, number>();
    for (const row of rows || [])
      {counts.set(row.category, (counts.get(row.category) || 0) + 1);}
    const markupByCategory = new Map(
      (markups || []).map((m) => [m.category, Number(m.markup_percent)])
    );

    return NextResponse.json({
      ok: true,
      supplierDiscountPercent: Number(listino.supplier_discount_percent) || 0,
      categories: Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([category, itemCount]) => ({
          category,
          itemCount,
          markupPercent: markupByCategory.has(category)
            ? markupByCategory.get(category)!
            : null,
        })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Lettura impostazioni non riuscita' },
      { status: 500 }
    );
  }
}

/**
 * Saves supplier discount and category markups, then recomputes the listino's net
 * prices (list price x (1 - discount)) and applies the markups to its items.
 */
export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const payload = (await req.json()) as {
      listinoId?: string;
      profileId?: string;
      supplierDiscountPercent?: number | string | null;
      categoryMarkups?: Array<{
        category?: string;
        markupPercent?: number | string | null;
      }>;
    };
    if (!isOwnProfile(user, payload.profileId)) return forbiddenResponse();
    const listinoId = String(payload.listinoId || '');
    const listino = listinoId ? await ownListino(listinoId, user.id) : null;
    if (!listino)
      {return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });}

    const discount = parsePercent(payload.supplierDiscountPercent, 100) ?? 0;
    if (Number.isNaN(discount)) {
      return NextResponse.json(
        { error: 'Sconto fornitore non valido (0-99%)' },
        { status: 400 }
      );
    }

    const { error: listinoError } = await supabase
      .from('listini')
      .update({ supplier_discount_percent: discount })
      .eq('id', listinoId)
      .eq('profile_id', user.id);
    if (listinoError) throw new Error(listinoError.message);

    const toSave: Array<{
      listino_id: string;
      profile_id: string;
      category: string;
      markup_percent: number;
    }> = [];
    const toClear: string[] = [];
    for (const entry of payload.categoryMarkups || []) {
      const category = String(entry.category || '').trim();
      if (!category) continue;
      const markup = parsePercent(entry.markupPercent, 1000);
      if (markup === null) toClear.push(category);
      else if (Number.isNaN(markup)) {
        return NextResponse.json(
          { error: `Ricarico non valido per "${category}"` },
          { status: 400 }
        );
      } else
        {toSave.push({
          listino_id: listinoId,
          profile_id: user.id,
          category,
          markup_percent: markup,
        });}
    }
    if (toSave.length) {
      const { error } = await supabase
        .from('listino_category_markups')
        .upsert(toSave, { onConflict: 'listino_id,category' });
      if (error) throw new Error(error.message);
    }
    if (toClear.length) {
      await supabase
        .from('listino_category_markups')
        .delete()
        .eq('listino_id', listinoId)
        .in('category', toClear);
    }

    const { data: repriced, error: applyError } = await supabase.rpc(
      'apply_listino_pricing',
      {
        p_listino_id: listinoId,
      }
    );
    if (applyError) throw new Error(applyError.message);

    return NextResponse.json({
      ok: true,
      supplierDiscountPercent: discount,
      repricedItems: Number(repriced) || 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Salvataggio non riuscito' },
      { status: 500 }
    );
  }
}
