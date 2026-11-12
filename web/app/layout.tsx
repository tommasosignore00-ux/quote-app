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
import { Archivo, Source_Sans_3, Caveat } from 'next/font/google';

// Landing fonts, exposed as CSS variables (used through the mv-* Tailwind font families).
const displayFont = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-mv-display',
});
const textFont = Source_Sans_3({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mv-text',
});
// Only the handwritten measurement sheet uses it: not preloaded.
const handFont = Caveat({
  subsets: ['latin'],
  display: 'swap',
  preload: false,
  variable: '--font-mv-hand',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // App disponibile solo in Italia: interfaccia sempre in italiano.
    setLanguage(DEFAULT_LANGUAGE);
  }, []);

  return (
    <html
      lang="it"
      suppressHydrationWarning
      className={`${displayFont.variable} ${textFont.variable} ${handFont.variable}`}
    >
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Detti materiali e lavorazioni dal telefono. Il preventivo esce con i tuoi prezzi e il tuo modello Word, a nome della tua azienda. 14 giorni di prova."
        />
        <meta
          name="keywords"
          content="preventivi, idraulici, elettricisti, artigiani, preventivi a voce, listini"
        />
        <meta name="author" content="Mastrovoce" />
        <meta name="theme-color" content="#c2410c" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta
          property="og:title"
          content="Detti le voci in cantiere. Il preventivo esce con i tuoi prezzi."
        />
        <meta
          property="og:description"
          content="Per fabbri, idraulici, elettricisti e piccole imprese edili. Parli, controlli le righe, mandi il preventivo a nome tuo."
        />
        <meta property="og:site_name" content="Mastrovoce" />
        <meta property="og:locale" content="it_IT" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta
          name="twitter:title"
          content="Detti le voci in cantiere. Il preventivo esce con i tuoi prezzi."
        />
        <meta
          name="twitter:description"
          content="Per fabbri, idraulici, elettricisti e piccole imprese edili. Parli, controlli le righe, mandi il preventivo a nome tuo."
        />

        <meta
          property="og:image"
          content={`${process.env.NEXT_PUBLIC_APP_URL || ''}/og.png`}
        />
        <meta
          name="twitter:image"
          content={`${process.env.NEXT_PUBLIC_APP_URL || ''}/og.png`}
        />
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />

        <title>Mastrovoce · Il preventivo dettato in cantiere, con i tuoi prezzi</title>
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
