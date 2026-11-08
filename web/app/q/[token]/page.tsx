import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '../../../lib/supabase-server';
import DecisionForm from './DecisionForm';
import {
  LINK_EXPIRED_MESSAGE,
  NOT_LATEST_MESSAGE,
  isLatestQuoteVersion,
  isPublicLinkExpired,
} from '../../../lib/publicQuote';

export const dynamic = 'force-dynamic';

// A private link: never indexed, and not sent as referrer to external sites.
export const metadata: Metadata = {
  title: 'Il tuo preventivo',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PublicQuotePage({ params }: { params: { token: string } }) {
  if (!UUID_RE.test(params.token)) notFound();

  const { data: version } = await supabaseAdmin
    .from('preventivi_versioni')
    .select(
      'html_content, lavoro_id, revision, public_token_expires_at, client_decision, client_decision_at, client_signer_name, lavori(title, profiles(company_name))'
    )
    .eq('public_token', params.token)
    .maybeSingle();
  if (!version?.html_content) notFound();

  const lavoro = version.lavori as unknown as {
    title?: string;
    profiles?: { company_name?: string | null } | null;
  } | null;
  const company = lavoro?.profiles?.company_name;
  const decidedAt = version.client_decision_at
    ? new Date(version.client_decision_at).toLocaleString('it-IT', {
        timeZone: 'Europe/Rome',
      })
    : null;

  const expired = isPublicLinkExpired(version.public_token_expires_at);
  const accepted = version.client_decision === 'accepted';
  const status = version.client_decision
    ? accepted
      ? `Preventivo accettato da ${version.client_signer_name || 'il cliente'} il ${decidedAt}.`
      : `Preventivo rifiutato il ${decidedAt}.`
    : null;

  const privacyNotice = (
    <p className="text-xs text-slate-500">
      Il preventivo ti è stato inviato dall&apos;impresa indicata nel documento, che
      tratta i tuoi dati. Se rispondi, registriamo nome, eventuale nota, data, indirizzo
      IP e browser come prova della risposta. Questa pagina non usa cookie di analisi.
      Dettagli nell&apos;{' '}
      <a href="/privacy" className="underline">
        informativa privacy
      </a>
      .
    </p>
  );

  // After expiry the document is gone: an accepted quote only confirms its status.
  if (expired) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-4">
        <p
          role="status"
          className="rounded-lg border border-slate-200 bg-white p-4 text-slate-800"
        >
          {accepted ? status : LINK_EXPIRED_MESSAGE}
        </p>
        {privacyNotice}
      </div>
    );
  }

  const canAnswer =
    !version.client_decision &&
    (await isLatestQuoteVersion(version.lavoro_id, version.revision));

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-xl font-semibold text-slate-900">
        Preventivo{company ? ` di ${company}` : ''}
        {lavoro?.title ? `: ${lavoro.title}` : ''}
      </h1>
      {/* sandbox with no permissions: the quote HTML can neither run scripts nor navigate. */}
      <iframe
        title="Testo del preventivo"
        sandbox=""
        srcDoc={version.html_content}
        className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white"
      />
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        {canAnswer ? (
          <DecisionForm token={params.token} />
        ) : (
          <p role="status" className="text-slate-800">
            {status || NOT_LATEST_MESSAGE}
          </p>
        )}
      </section>
      {privacyNotice}
    </div>
  );
}
