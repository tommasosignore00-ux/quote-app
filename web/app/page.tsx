'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function HomePage() {
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) router.push('/dashboard');
    });
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) router.push('/dashboard');
    };
    checkSession();
    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Quote App</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-5xl">{t('app.title')}</h1>
          </div>
          <div className="hidden gap-3 sm:flex">
            <Link href="/auth/login" className="rounded-lg border border-white/20 px-4 py-2 font-semibold text-white hover:bg-white/10">
              {t('auth.login')}
            </Link>
            <Link href="/auth/register" className="btn-primary">
              {t('auth.register')}
            </Link>
          </div>
        </header>

        <main className="flex flex-1 flex-col justify-center py-12">
          <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="mb-4 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-sm text-emerald-300">
                Software per preventivi rapidi per imprenditori e attività di servizi
              </div>
              <h2 className="max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
                Crea, scarica e invia preventivi professionali in pochi minuti.
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                Quote App aiuta professionisti, artigiani e piccole imprese a creare preventivi e fatture,
                gestire clienti, usare l&apos;input vocale con AI e condividere documenti direttamente dal web e dal mobile.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/auth/register" className="btn-primary text-center">
                  {t('auth.register')}
                </Link>
                <Link href="/auth/login" className="rounded-lg border border-white/20 px-4 py-2 text-center font-semibold text-white hover:bg-white/10">
                  {t('auth.login')}
                </Link>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Preventivi e fatture</p>
                  <p className="mt-2 text-sm text-slate-300">Creazione documenti, PDF, invio cliente e stato pagamento.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">AI vocale</p>
                  <p className="mt-2 text-sm text-slate-300">Acquisizione rapida di lavori, voci e prezzi tramite voce.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">Web e mobile</p>
                  <p className="mt-2 text-sm text-slate-300">Stesse funzioni principali disponibili su entrambe le versioni.</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Come funziona</p>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="font-semibold text-white">1. Crea cliente e lavoro</p>
                  <p className="mt-1 text-sm text-slate-300">Organizza clienti, lavori, listini e dettagli fiscali in un solo posto.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="font-semibold text-white">2. Genera il documento</p>
                  <p className="mt-1 text-sm text-slate-300">Prepara preventivi o fatture con totali, IVA, note e righe personalizzate.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="font-semibold text-white">3. Scarica o invia</p>
                  <p className="mt-1 text-sm text-slate-300">Esporta PDF, condividi i documenti e gestisci il flusso cliente senza carta.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-12 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-lg font-semibold text-white">Contatti</p>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Assistenza: <a className="text-emerald-300 hover:text-emerald-200" href="mailto:quote.app.support@gmail.com">quote.app.support@gmail.com</a>
              </p>
              <p className="text-sm leading-7 text-slate-300">
                Il servizio e&apos; accessibile da web app pubblica e area autenticata per l&apos;utilizzo operativo.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-lg font-semibold text-white">Informazioni legali</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href="/privacy" className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
                  Privacy
                </Link>
                <Link href="/terms" className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10">
                  Termini di Servizio
                </Link>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                La piattaforma supporta la gestione di preventivi, fatture e dati cliente per attivita&apos; professionali.
              </p>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10 pt-6 text-sm text-slate-400">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>{t('app.title')} · {t('app.subtitle')}</p>
            <p>Supporto: quote.app.support@gmail.com</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
