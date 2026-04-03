'use client';

import { useEffect } from 'react';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { setLanguage, getStoredLanguage } from '@/lib/language';
import { PostHogProvider } from '@/lib/analytics';
import WebVitals from '@/components/WebVitals';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const restoreLanguage = async () => {
      // 1. Try localStorage first
      const saved = getStoredLanguage();
      if (saved && saved !== 'en') {
        await setLanguage(saved);
        return;
      }
      // 2. Fallback: load from user profile in DB
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase.from('profiles').select('language').eq('id', user.id).single();
          if (profile?.language && profile.language !== 'en') {
            await setLanguage(profile.language);
          }
        }
      } catch (err) {
        console.error('[Layout] Error loading profile language:', err);
      }
    };
    restoreLanguage();
  }, []);

  return (
    <html lang="it" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="QuoteApp - Gestione preventivi con AI vocale, ricerca semantica e sincronizzazione real-time. Crea preventivi professionali in pochi secondi." />
        <meta name="keywords" content="preventivi, quote, AI, vocale, gestione preventivi, fatturazione, invoice, Stripe" />
        <meta name="author" content="QuoteApp" />
        <meta name="theme-color" content="#dc2626" />

        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="QuoteApp - Preventivi con AI Vocale" />
        <meta property="og:description" content="Crea preventivi professionali con input vocale, ricerca semantica e sincronizzazione real-time." />
        <meta property="og:site_name" content="QuoteApp" />
        <meta property="og:locale" content="it_IT" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="QuoteApp - Preventivi con AI Vocale" />
        <meta name="twitter:description" content="Crea preventivi professionali con input vocale e AI." />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />

        <title>QuoteApp - Preventivi con AI Vocale</title>
      </head>
      <body suppressHydrationWarning>
        <a href="#main-content" className="skip-to-content">Vai al contenuto principale</a>
        <PostHogProvider>
          <I18nextProvider i18n={i18n}>
            <WebVitals />
            <main id="main-content" role="main">
              {children}
            </main>
            <Toaster position="top-right" toastOptions={{ ariaProps: { role: 'status', 'aria-live': 'polite' } }} />
          </I18nextProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
