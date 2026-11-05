import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { supabaseAdmin } from '../../../lib/supabase-server';
import DecisionForm from './DecisionForm';

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
      'html_content, client_decision, client_decision_at, client_signer_name, lavori(title)'
    )
    .eq('public_token', params.token)
    .maybeSingle();
  if (!version?.html_content) notFound();

  const lavoro = version.lavori as unknown as { title?: string } | null;
  const decidedAt = version.client_decision_at
    ? new Date(version.client_decision_at).toLocaleString('it-IT', {
        timeZone: 'Europe/Rome',
      })
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-xl font-semibold text-slate-900">
        Preventivo{lavoro?.title ? `: ${lavoro.title}` : ''}
      </h1>
      {/* sandbox with no permissions: the quote HTML can neither run scripts nor navigate. */}
      <iframe
        title="Testo del preventivo"
        sandbox=""
        srcDoc={version.html_content}
        className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white"
      />
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        {version.client_decision ? (
          <p role="status" className="text-slate-800">
            {version.client_decision === 'accepted'
              ? `Preventivo accettato da ${version.client_signer_name || 'il cliente'} il ${decidedAt}.`
              : `Preventivo rifiutato il ${decidedAt}.`}
          </p>
        ) : (
          <DecisionForm token={params.token} />
        )}
      </section>
    </div>
  );
}
