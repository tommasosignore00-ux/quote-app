'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          backgroundColor: '#0f172a',
          color: '#fff',
          padding: '2rem',
        }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Qualcosa è andato storto</h2>
          <p style={{ color: '#94a3b8', marginBottom: '2rem', textAlign: 'center' }}>
            Si è verificato un errore imprevisto. Il nostro team è stato notificato.
          </p>
          <button
            onClick={reset}
            style={{
              backgroundColor: '#dc2626',
              color: '#fff',
              padding: '0.75rem 1.5rem',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Riprova
          </button>
        </div>
      </body>
    </html>
  );
}
