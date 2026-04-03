/**
 * @jest-environment node
 */
import { POST } from '@/app/api/auth/register/route';
import { NextResponse } from 'next/server';

// Mock supabase-server
jest.mock('@/lib/supabase-server', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: jest.fn(),
      },
    },
    from: jest.fn(() => ({
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockResolvedValue({ data: null, error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

const { supabaseAdmin } = require('@/lib/supabase-server');

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 400 if email or password is missing', async () => {
    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: '' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(req);
    const data = await response.json();
    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  it('returns 200 on successful registration', async () => {
    supabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: { user: { id: 'test-uuid', email: 'test@example.com' } },
      error: null,
    });

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'Test123456',
        country_code: 'IT',
        language: 'it',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(req);
    const data = await response.json();
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.user.email).toBe('test@example.com');
  });

  it('returns 500 if createUser fails', async () => {
    supabaseAdmin.auth.admin.createUser.mockResolvedValue({
      data: null,
      error: { message: 'User already exists' },
    });

    const req = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: 'existing@example.com',
        password: 'Test123456',
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await POST(req);
    expect(response.status).toBe(500);
  });
});
