import { NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase-server';

/** Features that call OpenAI, with their default daily limit per user. */
const DEFAULT_DAILY_LIMITS = {
  listino_import: 40,
  listino_ai_organize: 40,
  voice: 400,
  semantic: 2000,
  template: 20,
} as const;

export type AiFeature = keyof typeof DEFAULT_DAILY_LIMITS;

const FEATURE_LABELS: Record<AiFeature, string> = {
  listino_import: 'import di listini',
  listino_ai_organize: 'riorganizzazioni AI dei listini',
  voice: 'richieste vocali',
  semantic: 'ricerche intelligenti',
  template: 'conversioni di template',
};

function dailyLimit(feature: AiFeature): number {
  // e.g. AI_DAILY_LIMIT_LISTINO_IMPORT=100
  const fromEnv = Number(process.env[`AI_DAILY_LIMIT_${feature.toUpperCase()}`]);
  return Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : DEFAULT_DAILY_LIMITS[feature];
}

/** A semantic lookup costs a fraction of a cent; the others call expensive models. */
const FAILS_OPEN: ReadonlySet<AiFeature> = new Set<AiFeature>(['semantic']);

function quotaUnavailable(feature: AiFeature): NextResponse | null {
  if (FAILS_OPEN.has(feature)) return null;
  return NextResponse.json(
    { error: 'Servizio temporaneamente non disponibile. Riprova tra poco.' },
    { status: 503 }
  );
}

/**
 * Consumes one unit of the user's daily AI allowance. Returns a response when the
 * limit is reached. If the counter is unavailable, expensive features are refused
 * and only semantic lookups continue.
 */
export async function enforceAiQuota(
  profileId: string,
  feature: AiFeature,
  units = 1
): Promise<NextResponse | null> {
  const limit = dailyLimit(feature);
  try {
    const { data, error } = await supabaseAdmin.rpc('consume_ai_quota', {
      p_profile_id: profileId,
      p_feature: feature,
      p_units: units,
      p_daily_limit: limit,
    });
    if (error) {
      console.error('AI quota check unavailable:', error.code);
      return quotaUnavailable(feature);
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      return NextResponse.json(
        {
          error: `Hai raggiunto il limite giornaliero di ${limit} ${FEATURE_LABELS[feature]}. Riprova domani.`,
          code: 'AI_DAILY_LIMIT',
        },
        { status: 429 }
      );
    }
    return null;
  } catch {
    console.error('AI quota check failed');
    return quotaUnavailable(feature);
  }
}
