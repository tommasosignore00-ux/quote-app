/**
 * @jest-environment node
 */
import { POST } from '@/app/api/auth/register/route';

const signUp = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { signUp: (...args: unknown[]) => signUp(...args) } }),
}));

jest.mock('@/lib/rate-limit', () => ({
  rateLimitAuth: jest.fn().mockResolvedValue({ success: true, headers: {} }),
}));

jest.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      eq: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

function request(body: unknown) {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

const valid = { email: 'test@example.com', password: 'password123' };

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 if email or password is missing', async () => {
    const response = await POST(request({ email: '' }));
    expect(response.status).toBe(400);
  });

  it('asks for email verification and does not pre-confirm the address', async () => {
    signUp.mockResolvedValue({
      data: { user: { id: 'test-uuid', identities: [{ id: 'identity' }] } },
      error: null,
    });
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, verificationRequired: true });
    expect(signUp.mock.calls[0][0]).not.toHaveProperty('email_confirm');
  });

  it('gives the same answer for an address already registered', async () => {
    signUp.mockResolvedValue({
      data: { user: { id: 'x', identities: [] } },
      error: null,
    });
    const response = await POST(request(valid));
    expect(await response.json()).toEqual({ ok: true, verificationRequired: true });
  });

  it('does not expose provider errors', async () => {
    signUp.mockResolvedValue({
      data: { user: null },
      error: { status: 500, message: 'db detail' },
    });
    const response = await POST(request(valid));
    expect(JSON.stringify(await response.json())).not.toContain('db detail');
  });
});
