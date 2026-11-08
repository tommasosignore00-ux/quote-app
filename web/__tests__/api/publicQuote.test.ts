/**
 * @jest-environment node
 */
const TOKEN = '11111111-2222-4333-8444-555555555555';
let version: any;
let newerVersions: any[] = [];
const lavoroUpdates: any[] = [];
const versionUpdates: any[] = [];

jest.mock('../../lib/supabase-server', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const query: any = {
        select: () => query,
        eq: () => query,
        is: () => query,
        gt: () => query,
        limit: async () => ({ data: newerVersions, error: null }),
        maybeSingle: async () => ({ data: version, error: null }),
        update: (values: any) => {
          if (table === 'lavori') {
            lavoroUpdates.push(values);
            return { eq: async () => ({ error: null }) };
          }
          versionUpdates.push(values);
          return {
            eq: () => ({
              is: () => ({
                select: async () => ({
                  data: version.client_decision ? [] : [{ id: version.id }],
                  error: null,
                }),
              }),
            }),
          };
        },
      };
      return query;
    },
  },
}));

import { POST } from '../../app/api/public/quote/[token]/route';

function send(body: unknown, token = TOKEN) {
  return POST(
    new Request(`https://app.test/api/public/quote/${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': '10.0.0.1, 10.0.0.2',
        'user-agent': 'jest',
      },
      body: JSON.stringify(body),
    }),
    { params: { token } }
  );
}

describe('public quote decision', () => {
  beforeEach(() => {
    version = {
      id: 'v1',
      lavoro_id: 'l1',
      revision: 1,
      client_decision: null,
      public_token_expires_at: null,
    };
    newerVersions = [];
    lavoroUpdates.length = 0;
    versionUpdates.length = 0;
  });

  it('rejects malformed and unknown tokens', async () => {
    expect((await send({ decision: 'rejected' }, 'abc')).status).toBe(404);
    version = null;
    expect((await send({ decision: 'rejected' })).status).toBe(404);
  });

  it('requires a name to accept', async () => {
    expect((await send({ decision: 'accepted', name: ' ' })).status).toBe(400);
    expect(versionUpdates).toHaveLength(0);
  });

  it('records the acceptance with its proof and approves the job', async () => {
    const response = await send({
      decision: 'accepted',
      name: 'Mario Rossi',
      note: 'Ok',
    });
    expect(response.status).toBe(200);
    expect(versionUpdates[0]).toMatchObject({
      client_decision: 'accepted',
      client_signer_name: 'Mario Rossi',
      client_note: 'Ok',
      client_ip: '10.0.0.1',
      client_user_agent: 'jest',
    });
    expect(lavoroUpdates[0]).toEqual({ status: 'approved' });
  });

  it('lets the client reject without a name and marks the job rejected', async () => {
    expect((await send({ decision: 'rejected' })).status).toBe(200);
    expect(lavoroUpdates[0]).toEqual({ status: 'rejected' });
  });

  it('refuses an answer on an expired link', async () => {
    version.public_token_expires_at = '2020-01-01T00:00:00Z';
    expect((await send({ decision: 'rejected' })).status).toBe(410);
    expect(versionUpdates).toHaveLength(0);
  });

  it('refuses an answer on a version that is no longer the latest', async () => {
    newerVersions = [{ id: 'v2' }];
    expect((await send({ decision: 'rejected' })).status).toBe(409);
    expect(versionUpdates).toHaveLength(0);
  });

  it('does not change an answer already given', async () => {
    version.client_decision = 'accepted';
    expect((await send({ decision: 'rejected' })).status).toBe(409);
    expect(lavoroUpdates).toHaveLength(0);
  });

  it('refuses an unknown decision', async () => {
    expect((await send({ decision: 'maybe', name: 'Mario Rossi' })).status).toBe(400);
  });
});
