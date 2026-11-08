import * as Sentry from '@sentry/nextjs';
import { scrubQuoteTokens } from './lib/sentryScrub';

Sentry.init({
  beforeSend: (event) => scrubQuoteTokens(event),
  beforeSendTransaction: (event) => scrubQuoteTokens(event),
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',

  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,

  environment: process.env.NODE_ENV || 'development',

  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});
