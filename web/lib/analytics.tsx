'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com';

const CONSENT_KEY = 'quoteapp:analytics-consent';
type Consent = 'accepted' | 'rejected';

function readConsent(): Consent | null {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === 'accepted' || value === 'rejected' ? value : null;
  } catch {
    return null;
  }
}

function storeConsent(value: Consent | null) {
  try {
    if (value) localStorage.setItem(CONSENT_KEY, value);
    else localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Private browsing: the choice lasts for this page only.
  }
}

// The quote link carries the client's credential and the client gave no consent.
const isPrivatePath = (path: string | null) => !!path && path.startsWith('/q/');

let started = false;

function startAnalytics() {
  if (started || !POSTHOG_KEY) return;
  started = true;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: true,
    persistence: 'localStorage+cookie',
    respect_dnt: true,
    disable_session_recording: true,
    before_send: (event) => (isPrivatePath(window.location.pathname) ? null : event),
  });
}

function stopAnalytics() {
  if (started) {
    posthog.opt_out_capturing();
    posthog.reset();
    started = false;
  }
}

/** Lets the user reopen the banner and change the answer. */
export function reopenAnalyticsConsent() {
  stopAnalytics();
  storeConsent(null);
  window.dispatchEvent(new Event('quoteapp:analytics-consent'));
}

function isActive() {
  return started && !isPrivatePath(window.location.pathname);
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [askConsent, setAskConsent] = useState(false);

  useEffect(() => {
    if (!POSTHOG_KEY || isPrivatePath(pathname)) {
      setAskConsent(false);
      return;
    }
    const sync = () => {
      const consent = readConsent();
      setAskConsent(consent === null);
      if (consent === 'accepted') startAnalytics();
    };
    sync();
    window.addEventListener('quoteapp:analytics-consent', sync);
    return () => window.removeEventListener('quoteapp:analytics-consent', sync);
  }, [pathname]);

  const answer = (value: Consent) => {
    storeConsent(value);
    setAskConsent(false);
    if (value === 'accepted') startAnalytics();
    else stopAnalytics();
  };

  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      {children}
      {askConsent && (
        <div
          role="dialog"
          aria-label="Preferenze statistiche"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
        >
          <p className="text-sm text-slate-700">
            Usiamo PostHog per statistiche anonime sull&apos;uso dell&apos;app, solo se
            sei d&apos;accordo. Puoi cambiare idea in Profilo.{' '}
            <a href="/privacy" className="underline">
              Informativa
            </a>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => answer('rejected')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900"
            >
              Rifiuta
            </button>
            <button
              type="button"
              onClick={() => answer('accepted')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900"
            >
              Accetta
            </button>
          </div>
        </div>
      )}
    </PHProvider>
  );
}

// ── Custom event tracking helpers ──────────────────

export const analytics = {
  /** Track user registration */
  trackRegister: (method: 'email' | 'social', country?: string) => {
    if (!isActive()) return;
    posthog.capture('user_registered', { method, country });
  },

  /** Track user login */
  trackLogin: () => {
    if (!isActive()) return;
    posthog.capture('user_logged_in');
  },

  /** Track quote creation */
  trackQuoteCreated: (templateType: string) => {
    if (!isActive()) return;
    posthog.capture('quote_created', { template_type: templateType });
  },

  /** Track voice command used */
  trackVoiceCommand: (action: string) => {
    if (!isActive()) return;
    posthog.capture('voice_command_used', { action });
  },

  /** Track subscription started */
  trackSubscription: (plan: string) => {
    if (!isActive()) return;
    posthog.capture('subscription_started', { plan });
  },

  /** Track listino uploaded */
  trackListinoUploaded: (itemCount: number) => {
    if (!isActive()) return;
    posthog.capture('listino_uploaded', { item_count: itemCount });
  },

  /** Track quote sent via email */
  trackQuoteEmailed: () => {
    if (!isActive()) return;
    posthog.capture('quote_emailed');
  },

  /** Track feature usage */
  trackFeature: (feature: string, metadata?: Record<string, unknown>) => {
    if (!isActive()) return;
    posthog.capture('feature_used', { feature, ...metadata });
  },

  /** Identify user (call after login) */
  identify: (userId: string, properties?: Record<string, unknown>) => {
    if (!isActive()) return;
    posthog.identify(userId, properties);
  },

  /** Reset identity (call on logout) */
  reset: () => {
    if (!isActive()) return;
    posthog.reset();
  },
};
