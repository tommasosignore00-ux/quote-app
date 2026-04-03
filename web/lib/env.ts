/**
 * Environment variable validation using Zod.
 * Import this module early (e.g. in next.config.js or layout.tsx)
 * to fail fast on missing/invalid env vars.
 */

import { z } from 'zod';

/* ── Server-only variables (never exposed to the browser) ── */
const serverSchema = z.object({
  // Supabase
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  SUPABASE_CA_BUNDLE: z.string().optional(),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('whisper-1'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required'),
  STRIPE_PRICE_MONTHLY: z.string().min(1, 'STRIPE_PRICE_MONTHLY is required'),
  STRIPE_PRICE_YEARLY: z.string().min(1, 'STRIPE_PRICE_YEARLY is required'),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),
  SENDGRID_API_KEY: z.string().optional(),

  // Sentry
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),

  // Node
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

/* ── Public variables (NEXT_PUBLIC_ prefix, available in browser) ── */
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url('NEXT_PUBLIC_APP_URL must be a valid URL')
    .default('http://localhost:3000'),
  NEXT_PUBLIC_SKIP_SUBSCRIPTION: z
    .enum(['true', 'false'])
    .optional()
    .default('false'),

  // Analytics (optional)
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),

  // Sentry (optional)
  NEXT_PUBLIC_SENTRY_DSN: z.string().url().optional(),
});

/* ── Validate & export ── */

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

/**
 * Validates server-side environment variables.
 * Call this only on the server (API routes, server components, next.config.js).
 */
export function validateServerEnv(): ServerEnv {
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ✗ ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(
      `❌ Invalid server environment variables:\n${formatted}\n`
    );
    // In production, throw to prevent startup with bad config
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid server environment variables');
    }
  }
  return (result as any).data ?? ({} as ServerEnv);
}

/**
 * Validates client-side (NEXT_PUBLIC_*) environment variables.
 * Safe to call on both server and client.
 */
export function validateClientEnv(): ClientEnv {
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SKIP_SUBSCRIPTION: process.env.NEXT_PUBLIC_SKIP_SUBSCRIPTION,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ✗ ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    console.error(
      `❌ Invalid client environment variables:\n${formatted}\n`
    );
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid client environment variables');
    }
  }
  return (result as any).data ?? ({} as ClientEnv);
}

/**
 * Convenience: validate all env vars at once. Use in server-side init.
 */
export function validateAllEnv() {
  const server = validateServerEnv();
  const client = validateClientEnv();
  return { server, client };
}

/* ── .env.example template generator ── */
export function generateEnvTemplate(): string {
  return `# ─── Required ───────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

OPENAI_API_KEY=sk-...

STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_YEARLY=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─── Optional ──────────────────────────────────────────
# SUPABASE_CA_BUNDLE=./certs/ca-bundle.crt
# STRIPE_WEBHOOK_SECRET=whsec_...
# RESEND_API_KEY=re_...
# SENDGRID_API_KEY=SG....
# NEXT_PUBLIC_POSTHOG_KEY=phc_...
# NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com
# NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
# SENTRY_ORG=your-org
# SENTRY_PROJECT=your-project
# SENTRY_AUTH_TOKEN=sntrys_...
# OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# OPENAI_TRANSCRIBE_MODEL=whisper-1
# NEXT_PUBLIC_SKIP_SUBSCRIPTION=false
`;
}
