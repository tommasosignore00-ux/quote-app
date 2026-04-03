/**
 * Simple feature flag system.
 * Flags can be configured via:
 * 1. Environment variables (NEXT_PUBLIC_FF_*)
 * 2. Database (feature_flags table)
 * 3. Local overrides (localStorage in dev)
 */

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  /** Percentage of users who see this (0-100) */
  rolloutPercent?: number;
}

// ── Default flags ──────────────────────────────

const DEFAULT_FLAGS: Record<string, FeatureFlag> = {
  voice_commands: {
    key: 'voice_commands',
    enabled: true,
    description: 'Comandi vocali per creare clienti/lavori/costi',
  },
  semantic_search: {
    key: 'semantic_search',
    enabled: true,
    description: 'Ricerca semantica nel listino con embeddings',
  },
  custom_templates: {
    key: 'custom_templates',
    enabled: true,
    description: 'Upload template personalizzati per preventivi',
  },
  pdf_export: {
    key: 'pdf_export',
    enabled: true,
    description: 'Esportazione preventivi in PDF',
  },
  email_quotes: {
    key: 'email_quotes',
    enabled: true,
    description: 'Invio preventivi via email',
  },
  dark_mode: {
    key: 'dark_mode',
    enabled: false,
    description: 'Tema scuro (in beta)',
    rolloutPercent: 0,
  },
  ai_suggestions: {
    key: 'ai_suggestions',
    enabled: false,
    description: 'Suggerimenti AI per prezzi e materiali',
    rolloutPercent: 10,
  },
  multi_currency: {
    key: 'multi_currency',
    enabled: false,
    description: 'Supporto multi-valuta nei preventivi',
    rolloutPercent: 0,
  },
  push_notifications: {
    key: 'push_notifications',
    enabled: true,
    description: 'Notifiche push (mobile)',
  },
  offline_mode: {
    key: 'offline_mode',
    enabled: true,
    description: 'Modalità offline con sync (mobile)',
  },
};

// ── Check if a flag is enabled ──────────────────

export function isFeatureEnabled(
  flagKey: string,
  userId?: string
): boolean {
  // 1. Check env var override: NEXT_PUBLIC_FF_VOICE_COMMANDS=true
  const envKey = `NEXT_PUBLIC_FF_${flagKey.toUpperCase()}`;
  const envValue = typeof process !== 'undefined' ? process.env?.[envKey] : undefined;
  if (envValue !== undefined) {
    return envValue === 'true' || envValue === '1';
  }

  // 2. Check localStorage override (development only)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    const localOverride = localStorage.getItem(`ff:${flagKey}`);
    if (localOverride !== null) {
      return localOverride === 'true';
    }
  }

  // 3. Use default configuration
  const flag = DEFAULT_FLAGS[flagKey];
  if (!flag) return false;
  if (!flag.enabled) return false;

  // 4. Check rollout percentage
  if (flag.rolloutPercent !== undefined && flag.rolloutPercent < 100) {
    if (!userId) return flag.rolloutPercent > 50; // default for anonymous
    const hash = simpleHash(userId + flagKey);
    return (hash % 100) < flag.rolloutPercent;
  }

  return true;
}

/** Get all feature flags with their current state */
export function getAllFlags(userId?: string): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of Object.keys(DEFAULT_FLAGS)) {
    result[key] = isFeatureEnabled(key, userId);
  }
  return result;
}

/** Override a flag locally (development only) */
export function setLocalOverride(flagKey: string, enabled: boolean): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(`ff:${flagKey}`, String(enabled));
  }
}

/** Clear all local overrides */
export function clearLocalOverrides(): void {
  if (typeof window === 'undefined') return;
  for (const key of Object.keys(DEFAULT_FLAGS)) {
    localStorage.removeItem(`ff:${key}`);
  }
}

// ── Helpers ──────────────────────────────────────

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}
