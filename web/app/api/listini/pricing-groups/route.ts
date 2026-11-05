import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnProfile,
} from '../../../../lib/apiAuth';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { getListinoSourceMetadata } from '../../../../lib/listinoSourceStorage';
import {
  applyGroupPricesToListino,
  loadPricingGroups,
} from '../../../../lib/listinoPricingGroups';

const supabase = supabaseAdmin;

// Saving prices re-prices up to a few thousand catalogue rows.
export const maxDuration = 120;

async function ownListino(listinoId: string, profileId: string) {
  const { data, error } = await supabase
    .from('listini')
    .select('id')
    .eq('id', listinoId)
    .eq('profile_id', profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** "Prezzi per forma" section of a listino whose PDF has no prices. */
export async function GET(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const { searchParams } = new URL(req.url);
    const listinoId = searchParams.get('listinoId') || '';
    if (!isOwnProfile(user, searchParams.get('profileId'))) return forbiddenResponse();
    if (!listinoId)
      {return NextResponse.json({ error: 'listinoId è obbligatorio' }, { status: 400 });}
    if (!(await ownListino(listinoId, user.id))) {
      return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });
    }

    const groups = await loadPricingGroups({ listinoId, profileId: user.id });
    return NextResponse.json({ ok: true, groups });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || 'Lettura forme non riuscita' },
      { status: 500 }
    );
  }
}

/**
 * Saves the price of each shape and rebuilds the listino items of the catalogue:
 * shapes with a price get their items created/updated (measurement x price).
 */
export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const payload = (await req.json()) as {
      listinoId?: string;
      profileId?: string;
      prices?: Array<{ name?: string; unit_price?: number | string | null }>;
    };
    if (!isOwnProfile(user, payload.profileId)) return forbiddenResponse();
    const listinoId = String(payload.listinoId || '').trim();
    const profileId = user.id;
    if (!listinoId || !Array.isArray(payload.prices)) {
      return NextResponse.json(
        { error: 'listinoId e prices sono obbligatori' },
        { status: 400 }
      );
    }
    if (!(await ownListino(listinoId, profileId))) {
      return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });
    }

    const groups = await loadPricingGroups({ listinoId, profileId });
    const groupByName = new Map(groups.map((group) => [group.name, group]));

    for (const entry of payload.prices) {
      const group = groupByName.get(String(entry.name || ''));
      if (!group) continue;
      const raw = entry.unit_price;
      const parsed =
        raw === null || raw === undefined || String(raw).trim() === ''
          ? null
          : Number(String(raw).replace(',', '.'));
      if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
        return NextResponse.json(
          { error: `Prezzo non valido per "${group.name}"` },
          { status: 400 }
        );
      }
      const unitPrice = parsed && parsed > 0 ? Math.round(parsed * 10000) / 10000 : null;
      if (unitPrice === group.unit_price) continue;
      const { error } = await supabase
        .from('listino_pricing_groups')
        .update({ unit_price: unitPrice })
        .eq('id', group.id!)
        .eq('profile_id', profileId);
      if (error) throw new Error(error.message);
      group.unit_price = unitPrice;
    }

    const metadata = await getListinoSourceMetadata({ profileId, listinoId });
    const candidates = (metadata?.candidateItems || []).filter(
      (item) => item.pricing_group
    );
    if (!candidates.length) {
      return NextResponse.json(
        { error: 'Sorgente del listino non trovata: ricarica il PDF.' },
        { status: 409 }
      );
    }

    const result = await applyGroupPricesToListino({
      listinoId,
      profileId,
      candidates,
      groups,
    });
    return NextResponse.json({ ok: true, groups, ...result });
  } catch (err) {
    console.error('Pricing groups save error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Salvataggio prezzi non riuscito' },
      { status: 500 }
    );
  }
}
