import { NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase-server';

/** Features that call OpenAI, with their default daily limit per user. */
const DEFAULT_DAILY_LIMITS = {
  listino_import: 40,
  listino_ai_organize: 40,
  voice: 400,
  semantic: 2000,
} as const;

export type AiFeature = keyof typeof DEFAULT_DAILY_LIMITS;

const FEATURE_LABELS: Record<AiFeature, string> = {
  listino_import: 'import di listini',
  listino_ai_organize: 'riorganizzazioni AI dei listini',
  voice: 'richieste vocali',
  semantic: 'ricerche intelligenti',
};

function dailyLimit(feature: AiFeature): number {
  // e.g. AI_DAILY_LIMIT_LISTINO_IMPORT=100
  const fromEnv = Number(process.env[`AI_DAILY_LIMIT_${feature.toUpperCase()}`]);
  return Number.isFinite(fromEnv) && fromEnv > 0
    ? fromEnv
    : DEFAULT_DAILY_LIMITS[feature];
}

/**
 * Consumes one unit of the user's daily AI allowance. Returns a 429 response when
 * the limit is reached, otherwise null. If the quota table is not available the
 * request is allowed: a missing counter must never block paying users.
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
      console.warn('AI quota check unavailable, allowing request:', error.message);
      return null;
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
  } catch (error) {
    console.warn('AI quota check failed, allowing request:', error);
    return null;
  }
}
