const { withSentryConfig } = require('@sentry/nextjs');

const PDF_RUNTIME_FILES = [
  './scripts/extract-pdf-text.cjs',
  './scripts/render-pdf-pages.cjs',
  './node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs',
  './node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs',
  './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
];

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://js.stripe.com https://*.posthog.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.posthog.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://api.stripe.com",
  "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@supabase/supabase-js'],
  experimental: {
    // Moduli nativi / pesanti usati dall'import PDF: vanno caricati a runtime
    // da node_modules, non inclusi nel bundle webpack (altrimenti la build fallisce
    // su file .node come skia.linux-x64-gnu.node).
    serverComponentsExternalPackages: ['@napi-rs/canvas', 'pdf-parse', 'pdfjs-dist'],
    // The PDF fallback extractors run as child processes loaded by path at runtime,
    // so the bundler cannot see them: ship them with the routes that spawn them.
    // pdf.js also loads its worker module dynamically: without it on Vercel every PDF
    // read fails with "Setting up fake worker failed: Cannot find module pdf.worker.mjs".
    outputFileTracingIncludes: {
      '/api/listini/upload': PDF_RUNTIME_FILES,
      '/api/listini/ai-organize': PDF_RUNTIME_FILES,
    },
  },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  webpack: (config, { isServer }) => {
    // Exclude jest.setup.ts from build
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/(jest.setup.ts|jest.config.ts|playwright.config.ts)'],
    };
    return config;
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=15552000' },
        // Report-Only for now: read the violations before enforcing it.
        { key: 'Content-Security-Policy-Report-Only', value: CONTENT_SECURITY_POLICY },
      ],
    },
  ],
};

const sentryConfig = {
  silent: true,
  org: process.env.SENTRY_ORG || '',
  project: process.env.SENTRY_PROJECT || '',
  widenClientFileUpload: true,
  disableLogger: true,
};

module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, sentryConfig)
  : nextConfig;
