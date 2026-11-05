/**
 * @jest-environment node
 */
const rpcMock = jest.fn();
jest.mock('../../lib/supabase-server', () => ({
  supabaseAdmin: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { enforceAiQuota } from '../../lib/aiQuota';

describe('enforceAiQuota', () => {
  beforeEach(() => rpcMock.mockReset());

  it('allows the request while under the daily limit', async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: true, used: 3 }], error: null });
    expect(await enforceAiQuota('user-1', 'listino_import')).toBeNull();
    expect(rpcMock).toHaveBeenCalledWith('consume_ai_quota', {
      p_profile_id: 'user-1',
      p_feature: 'listino_import',
      p_units: 1,
      p_daily_limit: 40,
    });
  });

  it('answers 429 with an Italian message when the limit is reached', async () => {
    rpcMock.mockResolvedValue({ data: [{ allowed: false, used: 40 }], error: null });
    const response = await enforceAiQuota('user-1', 'listino_import');
    expect(response?.status).toBe(429);
    expect((await response!.json()).error).toMatch(
      /limite giornaliero di 40 import di listini/
    );
  });

  it('never blocks users when the quota table is unavailable', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'function consume_ai_quota does not exist' },
    });
    expect(await enforceAiQuota('user-1', 'voice')).toBeNull();
  });
});
