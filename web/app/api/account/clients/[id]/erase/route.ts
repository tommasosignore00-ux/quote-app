import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '@/lib/apiAuth';
import { supabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Erases a client and all their jobs and quotes, when nothing has to be kept: an
 * accepted quote is proof of a contract, and deleting a client cascades to invoices.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();

  try {
    const { data: client, error: clientError } = await supabaseAdmin
      .from('clienti')
      .select('id')
      .eq('id', params.id)
      .eq('profile_id', user.id)
      .maybeSingle();
    if (clientError) throw new Error(clientError.message);
    if (!client)
      {return NextResponse.json({ error: 'Cliente non trovato' }, { status: 404 });}

    const { count: invoices, error: invoiceError } = await supabaseAdmin
      .from('fatture')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', client.id);
    if (invoiceError) throw new Error(invoiceError.message);
    if (invoices) {
      return NextResponse.json(
        { error: 'Questo cliente ha fatture collegate: non si può cancellare.' },
        { status: 409 }
      );
    }

    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('lavori')
      .select('id')
      .eq('cliente_id', client.id)
      .eq('profile_id', user.id);
    if (jobsError) throw new Error(jobsError.message);
    const jobIds = (jobs || []).map((job) => job.id);

    if (jobIds.length) {
      const { count: accepted, error: acceptedError } = await supabaseAdmin
        .from('preventivi_versioni')
        .select('id', { count: 'exact', head: true })
        .in('lavoro_id', jobIds)
        .eq('client_decision', 'accepted');
      if (acceptedError) throw new Error(acceptedError.message);
      if (accepted) {
        return NextResponse.json(
          { error: 'Questo cliente ha un preventivo accettato: non si può cancellare.' },
          { status: 409 }
        );
      }

      const { error: deleteJobsError } = await supabaseAdmin
        .from('lavori')
        .delete()
        .in('id', jobIds);
      if (deleteJobsError) throw new Error(deleteJobsError.message);
    }

    const { error: deleteError } = await supabaseAdmin
      .from('clienti')
      .delete()
      .eq('id', client.id)
      .eq('profile_id', user.id);
    if (deleteError) throw new Error(deleteError.message);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Client erase failed:', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json(
      { error: 'Non è stato possibile cancellare il cliente. Riprova.' },
      { status: 500 }
    );
  }
}
