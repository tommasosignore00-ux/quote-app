'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { useFounderSlots } from '@/lib/useFounderSlots';

export default function HomePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const founderSlots = useFounderSlots();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) router.push('/dashboard');
    });
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
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
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
              Mastrovoce
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-5xl">{t('app.title')}</h1>
          </div>
          <div className="hidden gap-3 sm:flex">
            <Link
              href="/auth/login"
              className="rounded-lg border border-white/20 px-4 py-2 font-semibold text-white hover:bg-white/10"
            >
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
                Per fabbri, idraulici, elettricisti e piccole imprese edili
              </div>
              <h2 className="max-w-3xl text-4xl font-bold leading-tight sm:text-6xl">
                Detti le voci in cantiere. Il preventivo esce con i tuoi prezzi.
              </h2>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
                Carichi il tuo listino in PDF, Excel o METEL. Detti materiali e
                lavorazioni, controlli le righe e mandi il preventivo a nome della tua
                azienda.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/auth/register" className="btn-primary text-center">
                  Prova con il tuo listino
                </Link>
                <Link
                  href="/auth/login"
                  className="rounded-lg border border-white/20 px-4 py-2 text-center font-semibold text-white hover:bg-white/10"
                >
                  {t('auth.login')}
                </Link>
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">I prezzi sono i tuoi</p>
                  <p className="mt-2 text-sm text-slate-300">
                    Dici la voce, il prezzo arriva dal tuo listino. Se il PDF non ha
                    prezzi, li indichi tu per forma.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">
                    Il documento è il tuo
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    Il tuo modello Word o HTML, il tuo logo, il nome della tua azienda.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-white">
                    Il cliente accetta online
                  </p>
                  <p className="mt-2 text-sm text-slate-300">
                    Scrive nome e cognome dal link. La risposta non si cambia più e resta
                    registrata con data e ora.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                Come funziona
              </p>
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="font-semibold text-white">1. Carica listino e modello</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Il listino in PDF, Excel o METEL. Per il tuo formato, un tuo
                    preventivo in Word o HTML, senza dati di clienti veri.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="font-semibold text-white">2. Detta le voci in cantiere</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Dal telefono dici materiali e lavorazioni. Controlli le righe: niente
                    viene salvato senza la tua conferma.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <p className="font-semibold text-white">3. Mandalo al cliente</p>
                  <p className="mt-1 text-sm text-slate-300">
                    Mandi il PDF o il link a nome della tua azienda. Dal link il cliente
                    accetta o rifiuta online.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Quello che ti stai chiedendo
            </h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <p className="text-lg font-semibold text-white">
                  &ldquo;Non ho tempo di stare dietro a un&apos;altra app.&rdquo;
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Prepari listino e modello all&apos;inizio. Dopo, sul lavoro, a te resta
                  parlare e controllare.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <p className="text-lg font-semibold text-white">
                  &ldquo;Ho già il mio Excel.&rdquo;
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Tienilo: lo carichi come listino. Cambia che non ricopi più i prezzi a
                  mano.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <p className="text-lg font-semibold text-white">
                  &ldquo;Non mi fido di un&apos;app.&rdquo;
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  Niente viene salvato senza la tua conferma, e il cliente vede il tuo
                  nome. L&apos;accettazione è una registrazione di quello che il cliente
                  ha risposto, non una garanzia legale.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <p className="text-lg font-semibold text-white">
                  &ldquo;Quanto mi costa?&rdquo;
                </p>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  €29,99 al mese, con 14 giorni di prova per provarlo con i tuoi prezzi.
                  Disdici quando vuoi dalla tua area account.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-2xl font-bold sm:text-3xl">Prezzi chiari</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <p className="text-lg font-semibold text-white">Mensile</p>
                <p className="mt-3 text-3xl font-bold text-white">€29,99</p>
                <p className="text-sm text-slate-300">al mese</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <p className="text-lg font-semibold text-white">Annuale</p>
                <p className="mt-3 text-3xl font-bold text-white">€299,99</p>
                <p className="text-sm text-slate-300">all&apos;anno</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <p className="text-lg font-semibold text-white">Team</p>
                <p className="mt-3 text-3xl font-bold text-white">€79,99</p>
                <p className="text-sm text-slate-300">
                  al mese, 5 utenti tu compreso. €9,99 al mese per ogni utente in più,
                  fino a 10.
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              I 14 giorni di prova valgono per il primo abbonamento. Al momento
              dell&apos;attivazione serve la carta: se non disdici entro la fine della
              prova, parte il piano che hai scelto.
            </p>
            {founderSlots !== null && founderSlots > 0 && (
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                <strong className="text-white">Primi 50 clienti:</strong> €19,99 al mese o
                €199,99 all&apos;anno, finché resti abbonato senza interruzioni. Si paga
                subito, senza prova, e se entro 30 giorni non ti convince ti rimborsiamo
                il primo pagamento. Restano {founderSlots} posti.
              </p>
            )}
          </section>

          <section className="mt-12 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-lg font-semibold text-white">Contatti</p>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Assistenza:{' '}
                <a
                  className="text-emerald-300 hover:text-emerald-200"
                  href="mailto:quote.app.support@gmail.com"
                >
                  quote.app.support@gmail.com
                </a>
              </p>
              <p className="text-sm leading-7 text-slate-300">
                In cantiere lo usi dal telefono, in ufficio dal computer.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className="text-lg font-semibold text-white">Informazioni legali</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href="/privacy"
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Privacy
                </Link>
                <Link
                  href="/terms"
                  className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  Termini di Servizio
                </Link>
              </div>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                Qui trovi come trattiamo i dati e le condizioni del servizio.
              </p>
            </div>
          </section>
        </main>

        <footer className="border-t border-white/10 pt-6 text-sm text-slate-400">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {t('app.title')} · {t('app.subtitle')}
            </p>
            <p>Supporto: quote.app.support@gmail.com</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
