import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { supabaseAdmin } from './supabase-server';
import { getRequestUser, unauthorizedResponse } from './apiAuth';

const JOB_RUN_HEADER = 'x-listino-job-run';

/** True when the client asked to run this request as a background job (?async=1). */
export function wantsBackgroundJob(req: Request): boolean {
  return (
    req.headers.get(JOB_RUN_HEADER) !== '1' &&
    new URL(req.url).searchParams.get('async') === '1'
  );
}

/**
 * Runs a long listini request (PDF import, AI organize) after answering: the client
 * gets { jobId } at once and polls /api/listini/jobs. The handler is called again
 * with the same headers and body, so auth, validation and quota stay in one place.
 * If the jobs table is unavailable the request simply runs synchronously.
 */
export async function startListinoJob(
  req: Request,
  kind: string,
  handler: (req: Request) => Promise<Response>
): Promise<Response> {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();

  const body = await req.text();
  let listinoId: string | null = null;
  try {
    listinoId = (JSON.parse(body) as { listinoId?: string }).listinoId || null;
  } catch {
    listinoId = null;
  }

  const url = new URL(req.url);
  url.searchParams.delete('async');
  const headers = new Headers(req.headers);
  headers.set(JOB_RUN_HEADER, '1');
  const replay = () => new Request(url, { method: req.method, headers, body });

  const { data: job, error } = await supabaseAdmin
    .from('listino_jobs')
    .insert({ profile_id: user.id, listino_id: listinoId, kind, status: 'queued' })
    .select('id')
    .single();

  if (error || !job) {
    console.warn('Listino jobs unavailable, running synchronously:', error?.message);
    return handler(replay());
  }

  const run = async () => {
    await supabaseAdmin
      .from('listino_jobs')
      .update({ status: 'running', updated_at: new Date().toISOString() })
      .eq('id', job.id);
    let status = 500;
    let result: unknown = null;
    try {
      const response = await handler(replay());
      status = response.status;
      result = await response.json().catch(() => null);
    } catch (runError) {
      result = { error: (runError as Error).message || 'Lavoro non riuscito' };
    }
    await supabaseAdmin
      .from('listino_jobs')
      .update({
        status: status >= 200 && status < 300 ? 'done' : 'error',
        http_status: status,
        result,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  };

  waitUntil(run());
  return NextResponse.json({ ok: true, jobId: job.id }, { status: 202 });
}
