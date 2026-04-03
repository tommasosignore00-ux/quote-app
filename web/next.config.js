const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@supabase/supabase-js'],
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
