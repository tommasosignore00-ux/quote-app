import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../../lib/supabase-server';
import { rateLimit } from '../../../../../lib/rate-limit';
import {
  LINK_EXPIRED_MESSAGE,
  NOT_LATEST_MESSAGE,
  isLatestQuoteVersion,
  isPublicLinkExpired,
} from '../../../../../lib/publicQuote';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 120;
const MAX_NOTE_LENGTH = 1000;

/**
 * The client's decision on a quote, from the secret link in the email. No account:
 * the unguessable token is the credential. A decision is final once recorded.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
    const limit = await rateLimit(`public-quote:${ip || 'unknown'}`, {
      maxRequests: 20,
      windowMs: 60_000,
      // A client accepting a quote must not be stopped by a counter outage.
      whenUnavailable: 'allow',
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429 }
      );
    }
    if (!UUID_RE.test(params.token)) {
      return NextResponse.json({ error: 'Link non valido' }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      decision?: string;
      name?: string;
      note?: string;
    };
    const decision = body.decision;
    const name = String(body.name || '')
      .trim()
      .slice(0, MAX_NAME_LENGTH);
    const note = String(body.note || '')
      .trim()
      .slice(0, MAX_NOTE_LENGTH);
    if (decision !== 'accepted' && decision !== 'rejected') {
      return NextResponse.json({ error: 'Scelta non valida' }, { status: 400 });
    }
    if (decision === 'accepted' && name.length < 3) {
      return NextResponse.json(
        { error: 'Scrivi nome e cognome per accettare' },
        { status: 400 }
      );
    }

    const { data: version, error } = await supabaseAdmin
      .from('preventivi_versioni')
      .select('id, lavoro_id, revision, client_decision, public_token_expires_at')
      .eq('public_token', params.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!version) return NextResponse.json({ error: 'Link non valido' }, { status: 404 });
    if (version.client_decision) {
      return NextResponse.json(
        { error: 'Hai già risposto a questo preventivo' },
        { status: 409 }
      );
    }

    if (isPublicLinkExpired(version.public_token_expires_at)) {
      return NextResponse.json({ error: LINK_EXPIRED_MESSAGE }, { status: 410 });
    }
    if (!(await isLatestQuoteVersion(version.lavoro_id, version.revision))) {
      return NextResponse.json({ error: NOT_LATEST_MESSAGE }, { status: 409 });
    }

    const decidedAt = new Date().toISOString();
    // The filter on client_decision makes a double click or two tabs record one answer.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('preventivi_versioni')
      .update({
        client_decision: decision,
        client_decision_at: decidedAt,
        client_signer_name: name || null,
        client_note: note || null,
        client_ip: ip,
        client_user_agent: (req.headers.get('user-agent') || '').slice(0, 300) || null,
      })
      .eq('id', version.id)
      .is('client_decision', null)
      .select('id');
    if (updateError) throw new Error(updateError.message);
    if (!updated?.length) {
      return NextResponse.json(
        { error: 'Hai già risposto a questo preventivo' },
        { status: 409 }
      );
    }

    await supabaseAdmin
      .from('lavori')
      .update({ status: decision === 'accepted' ? 'approved' : 'rejected' })
      .eq('id', version.lavoro_id);

    return NextResponse.json({ ok: true, decision, decidedAt });
  } catch (err) {
    console.error('Public quote decision error:', err);
    return NextResponse.json(
      { error: 'Non è stato possibile registrare la risposta. Riprova.' },
      { status: 500 }
    );
  }
}
