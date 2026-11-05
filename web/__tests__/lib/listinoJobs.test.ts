/**
 * @jest-environment node
 */
const pending: Promise<unknown>[] = [];
jest.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => pending.push(p),
}));
jest.mock('../../lib/apiAuth', () => ({
  getRequestUser: async () => ({ id: 'user-1' }),
  unauthorizedResponse: () => new Response('no', { status: 401 }),
}));

const updates: any[] = [];
let insertResult: any = { data: { id: 'job-1' }, error: null };
jest.mock('../../lib/supabase-server', () => ({
  supabaseAdmin: {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => insertResult }) }),
      update: (values: any) => ({
        eq: async () => {
          updates.push(values);
          return { error: null };
        },
      }),
    }),
  },
}));

import { startListinoJob, wantsBackgroundJob } from '../../lib/listinoJobs';

function request() {
  return new Request('https://app.test/api/listini/ai-organize?async=1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
    body: JSON.stringify({ listinoId: 'L1' }),
  });
}

describe('listino background jobs', () => {
  beforeEach(() => {
    updates.length = 0;
    pending.length = 0;
    insertResult = { data: { id: 'job-1' }, error: null };
  });

  it('answers 202 at once and stores the handler outcome', async () => {
    const seen: Request[] = [];
    const handler = async (req: Request) => {
      seen.push(req);
      return Response.json({ ok: true, importedCount: 844 });
    };
    const response = await startListinoJob(request(), 'ai_organize', handler);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ ok: true, jobId: 'job-1' });

    await Promise.all(pending);
    expect(wantsBackgroundJob(seen[0])).toBe(false);
    expect(await seen[0].json()).toEqual({ listinoId: 'L1' });
    expect(updates.at(-1)).toMatchObject({
      status: 'done',
      http_status: 200,
      result: { ok: true, importedCount: 844 },
    });
  });

  it('runs synchronously when the jobs table is unavailable', async () => {
    insertResult = {
      data: null,
      error: { message: 'relation "listino_jobs" does not exist' },
    };
    const response = await startListinoJob(request(), 'ai_organize', async () =>
      Response.json({ ok: true })
    );
    expect(response.status).toBe(200);
    expect(pending).toHaveLength(0);
  });
});
