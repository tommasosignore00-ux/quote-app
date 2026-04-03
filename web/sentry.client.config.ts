import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  
  // Performance monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  
  // Session replay for debugging (production only)
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  
  // Environment
  environment: process.env.NODE_ENV || 'development',
  
  // Only enable if DSN is configured
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Filter out noise
  ignoreErrors: [
    'ResizeObserver loop',
    'Non-Error promise rejection',
    'AbortError',
    'Network request failed',
  ],
});
