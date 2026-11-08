'use client';

import { useEffect } from 'react';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { setLanguage } from '@/lib/language';
import { DEFAULT_LANGUAGE } from '@/lib/constants';
import { PostHogProvider } from '@/lib/analytics';
import WebVitals from '@/components/WebVitals';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // App disponibile solo in Italia: interfaccia sempre in italiano.
    setLanguage(DEFAULT_LANGUAGE);
  }, []);

  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Mastrovoce - Detta le voci dal cantiere e prepara il preventivo per il cliente."
        />
        <meta
          name="keywords"
          content="preventivi, idraulici, elettricisti, artigiani, preventivi a voce, listini"
        />
        <meta name="author" content="Mastrovoce" />
        <meta name="theme-color" content="#dc2626" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content="Mastrovoce - Preventivi a voce per artigiani"
        />
        <meta
          property="og:description"
          content="Crea preventivi professionali con input vocale, ricerca semantica e sincronizzazione real-time."
        />
        <meta property="og:site_name" content="Mastrovoce" />
        <meta property="og:locale" content="it_IT" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Mastrovoce - Preventivi a voce per artigiani"
        />
        <meta
          name="twitter:description"
          content="Detta le voci dal cantiere e prepara il preventivo per il cliente."
        />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />

        <title>Mastrovoce - Preventivi a voce per artigiani</title>
      </head>
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-to-content">
          Vai al contenuto principale
        </a>
        <PostHogProvider>
          <I18nextProvider i18n={i18n}>
            <WebVitals />
            <main id="main-content" role="main">
              {children}
            </main>
            <Toaster
              position="top-right"
              toastOptions={{ ariaProps: { role: 'status', 'aria-live': 'polite' } }}
            />
          </I18nextProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
