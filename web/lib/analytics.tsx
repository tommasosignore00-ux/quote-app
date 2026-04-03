'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || '';
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.posthog.com';

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY) return;
    
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      persistence: 'localStorage+cookie',
      // GDPR compliance: respect Do Not Track
      respect_dnt: true,
      // Disable session recording by default (enable in PostHog dashboard)
      disable_session_recording: true,
    });
  }, []);

  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

// ── Custom event tracking helpers ──────────────────

export const analytics = {
  /** Track user registration */
  trackRegister: (method: 'email' | 'social', country?: string) => {
    if (!POSTHOG_KEY) return;
    posthog.capture('user_registered', { method, country });
  },

  /** Track user login */
  trackLogin: () => {
    if (!POSTHOG_KEY) return;
    posthog.capture('user_logged_in');
  },

  /** Track quote creation */
  trackQuoteCreated: (templateType: string) => {
    if (!POSTHOG_KEY) return;
    posthog.capture('quote_created', { template_type: templateType });
  },

  /** Track voice command used */
  trackVoiceCommand: (action: string) => {
    if (!POSTHOG_KEY) return;
    posthog.capture('voice_command_used', { action });
  },

  /** Track subscription started */
  trackSubscription: (plan: string) => {
    if (!POSTHOG_KEY) return;
    posthog.capture('subscription_started', { plan });
  },

  /** Track listino uploaded */
  trackListinoUploaded: (itemCount: number) => {
    if (!POSTHOG_KEY) return;
    posthog.capture('listino_uploaded', { item_count: itemCount });
  },

  /** Track quote sent via email */
  trackQuoteEmailed: () => {
    if (!POSTHOG_KEY) return;
    posthog.capture('quote_emailed');
  },

  /** Track feature usage */
  trackFeature: (feature: string, metadata?: Record<string, unknown>) => {
    if (!POSTHOG_KEY) return;
    posthog.capture('feature_used', { feature, ...metadata });
  },

  /** Identify user (call after login) */
  identify: (userId: string, properties?: Record<string, unknown>) => {
    if (!POSTHOG_KEY) return;
    posthog.identify(userId, properties);
  },

  /** Reset identity (call on logout) */
  reset: () => {
    if (!POSTHOG_KEY) return;
    posthog.reset();
  },
};
