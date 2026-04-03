'use client';

import { useEffect } from 'react';

interface WebVitalMetric {
  id: string;
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
}

/**
 * Reports Web Vitals to analytics/monitoring backends.
 */
function reportWebVital(metric: WebVitalMetric) {
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    const color = metric.rating === 'good' ? '#0cce6b' : metric.rating === 'needs-improvement' ? '#ffa400' : '#ff4e42';
    console.log(
      `%c[Web Vitals] ${metric.name}: ${Math.round(metric.value)}ms (${metric.rating})`,
      `color: ${color}; font-weight: bold;`
    );
  }

  // Send to PostHog if available
  try {
    const posthog = (window as any).__posthog;
    if (posthog?.capture) {
      posthog.capture('web_vital', {
        vital_name: metric.name,
        vital_value: metric.value,
        vital_rating: metric.rating,
        vital_id: metric.id,
      });
    }
  } catch {}

  // Send to custom analytics endpoint if configured
  const endpoint = process.env.NEXT_PUBLIC_VITALS_ENDPOINT;
  if (endpoint) {
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      page: window.location.pathname,
      timestamp: Date.now(),
    });
    
    // Use sendBeacon for reliability
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, body);
    } else {
      fetch(endpoint, { method: 'POST', body, keepalive: true }).catch(() => {});
    }
  }
}

/**
 * Component that initializes Web Vitals tracking.
 * Add to layout.tsx to automatically track Core Web Vitals.
 */
export default function WebVitals() {
  useEffect(() => {
    // Dynamically import web-vitals to avoid SSR issues
    import('web-vitals').then(({ onCLS, onFCP, onLCP, onTTFB, onINP }) => {
      onCLS(reportWebVital as any);
      onFCP(reportWebVital as any);
      onLCP(reportWebVital as any);
      onTTFB(reportWebVital as any);
      onINP(reportWebVital as any);
    }).catch(() => {
      // web-vitals not available, skip
    });
  }, []);

  return null;
}

/**
 * Custom performance markers for your application logic.
 */
export const perf = {
  /** Start a named performance mark */
  start: (name: string) => {
    if (typeof performance !== 'undefined') {
      performance.mark(`${name}-start`);
    }
  },

  /** End a named mark and return duration in ms */
  end: (name: string): number => {
    if (typeof performance === 'undefined') return 0;
    performance.mark(`${name}-end`);
    try {
      const measure = performance.measure(name, `${name}-start`, `${name}-end`);
      return measure.duration;
    } catch {
      return 0;
    }
  },

  /** Time an async function */
  timeAsync: async <T extends unknown>(name: string, fn: () => Promise<T>): Promise<T> => {
    perf.start(name);
    try {
      return await fn();
    } finally {
      const duration = perf.end(name);
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Perf] ${name}: ${Math.round(duration)}ms`);
      }
    }
  },
};
