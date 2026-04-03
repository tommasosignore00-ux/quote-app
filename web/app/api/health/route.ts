import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface ServiceStatus {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  error?: string;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceStatus;
    openai: ServiceStatus;
    stripe: ServiceStatus;
  };
}

const startTime = Date.now();

async function checkDatabase(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await supabase.from('profiles').select('id').limit(1);
    if (error) throw error;
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (e: any) {
    return { status: 'down', latencyMs: Date.now() - start, error: e.message };
  }
}

async function checkOpenAI(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { status: 'degraded', error: 'API key not configured' };
    }
    const res = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (e: any) {
    return { status: 'down', latencyMs: Date.now() - start, error: e.message };
  }
}

async function checkStripe(): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return { status: 'degraded', error: 'Secret key not configured' };
    }
    const res = await fetch('https://api.stripe.com/v1/balance', {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (e: any) {
    return { status: 'down', latencyMs: Date.now() - start, error: e.message };
  }
}

export async function GET() {
  const [database, openai, stripe] = await Promise.all([
    checkDatabase(),
    checkOpenAI(),
    checkStripe(),
  ]);

  const services = { database, openai, stripe };

  const allStatuses = Object.values(services).map((s) => s.status);
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (allStatuses.includes('down')) {
    overallStatus = allStatuses.every((s) => s === 'down') ? 'unhealthy' : 'degraded';
  } else if (allStatuses.includes('degraded')) {
    overallStatus = 'degraded';
  }

  const body: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version || '1.0.0',
    services,
  };

  const httpStatus = overallStatus === 'unhealthy' ? 503 : 200;

  return NextResponse.json(body, {
    status: httpStatus,
    headers: { 'Cache-Control': 'no-store' },
  });
}
