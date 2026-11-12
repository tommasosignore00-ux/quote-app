'use client';

/*
 * Mastrovoce landing. Copy: landing-copy.md (used verbatim). Sections A-H.
 *
 * MEDIA SLOTS (components/landing/media.ts). Each one starts empty and shows the
 * "Esempio" mockup or the dashed "Foto in arrivo" frame. To use the real file, add it to
 * web/public/landing/ with this name and set `src` to the same path in media.ts.
 *
 *   heroScreen            /landing/hero-dettatura.png         screenshot: dictated sentence + recognised line with price list price (B)
 *   heroPdf               /landing/hero-preventivo.png        first page of a real quote PDF, pensilina in ferro (B)
 *   seraPrima             /landing/sera-tavolo-prima.jpg      photo: kitchen table at 21:40, measurements sheet, price list, calculator (C0)
 *   listino               /landing/listino-caricamento.png    screenshot: price list upload with the first rows (C1)
 *   schermataMicrofono    /landing/schermata-microfono.png    screenshot: home screen with the big orange mic (C2)
 *   manoMicrofono         /landing/mano-guanto-microfono.jpg  photo: gloved hand tapping the mic, in the workshop (C2)
 *   conferma              /landing/conferma-voci.png          screenshot: confirmation sheet with the 3 dictated lines (C3)
 *   avvisoScelta          /landing/avviso-scelta.png          screenshot: "Più articoli possibili" warning, two tubolari (C3)
 *   modelloWord           /landing/modello-word.png           the firm's own Word quote, client data covered (D1)
 *   preventivoMastrovoce  /landing/preventivo-mastrovoce.png  the same quote made with Mastrovoce, pensilina rows (D1)
 *   clientePrima          /landing/cliente-prima.png          screenshot: client page with name field and accept/refuse (D2)
 *   clienteDopo           /landing/cliente-dopo.png           screenshot: client page after acceptance (D2)
 *   clienteFoto           /landing/cliente-telefono-casa.jpg  photo (optional): client's hand holding the phone at home (D2)
 *   preventiviAccettati   /landing/preventivi-accettati.png   screenshot: Preventivi screen, "Accettati" tab (F, closing)
 *   seraDopo              /landing/sera-tavolo-dopo.jpg       photo: same table, same framing as seraPrima, cleared, phone on Preventivi (F)
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useFounderSlots } from '@/lib/useFounderSlots';
import { LandingHeader, StickyCta } from '@/components/landing/Chrome';
import { QuoteSheet, WordTemplateSheet } from '@/components/landing/QuoteSheet';
import {
  ChoiceBox,
  ClientAfterScreen,
  ClientBeforeScreen,
  ConfirmScreen,
  HeroDictationScreen,
  ListinoSample,
  MicScreen,
  PreventiviScreen,
} from '@/components/landing/AppScreens';
import { Faq } from '@/components/landing/Faq';
import { Pricing, founderPlacesText } from '@/components/landing/Pricing';
import { MEDIA } from '@/components/landing/media';
import {
  CtaLink,
  PhotoSlot,
  ScreenSlot,
  TickRule,
} from '@/components/landing/primitives';

/* ================= DA RIEMPIRE PRIMA DI PUBBLICARE =================
 * Empty values are never shown to visitors.
 */
/** [EMAIL ASSISTENZA]: address on the Mastrovoce domain. Until set, the current one is shown. */
const SUPPORT_EMAIL = '';
const CURRENT_SUPPORT_EMAIL = 'quote.app.support@gmail.com';
/** [RAGIONE SOCIALE] and [PARTITA IVA]: the footer line appears only when filled. */
const COMPANY_LEGAL_NAME = '';
const COMPANY_VAT_NUMBER = '';
/** [NOME DEL FONDATORE]: signature of section G and the "Scrivi a …" link. */
const FOUNDER_NAME = '';
/** Set to true only if "in Italia" (section G, short version) is confirmed. */
const MADE_IN_ITALY_CONFIRMED = false;
/* =================================================================== */

const supportEmail = SUPPORT_EMAIL || CURRENT_SUPPORT_EMAIL;
const companyLine = [
  COMPANY_LEGAL_NAME,
  COMPANY_VAT_NUMBER ? `P.IVA ${COMPANY_VAT_NUMBER}` : '',
]
  .filter(Boolean)
  .join(' · ');

const SESSION_ATTR = 'data-mv-session';
// Runs before the first paint: if a Supabase session cookie exists, the landing stays
// hidden while the session is checked, so logged-in users don't see it flash.
const SESSION_HINT_SCRIPT = `try{if(/(?:^|;\\s*)sb-[^=]*-auth-token/.test(document.cookie)){document.documentElement.setAttribute('${SESSION_ATTR}','')}}catch(e){}`;

const WRAP = 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8';
const H2 = 'mv-display text-[2rem] font-bold leading-[1.1] sm:text-5xl';
const H3 = 'mv-display text-2xl font-bold leading-tight sm:text-3xl';
const BODY = 'space-y-3 text-base leading-7 sm:text-lg sm:leading-8';
const CAPTION = 'mt-3 text-base text-mv-muted';

export default function HomePage() {
  const router = useRouter();
  const founderSlots = useFounderSlots();
  const heroRef = useRef<HTMLElement>(null);
  const pricesRef = useRef<HTMLElement>(null);
  const showFounder = founderPlacesText(founderSlots) !== null;

  useEffect(() => {
    const reveal = () => document.documentElement.removeAttribute(SESSION_ATTR);
    let redirected = false;
    const goToDashboard = () => {
      if (redirected) return;
      redirected = true;
      router.replace('/dashboard');
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) goToDashboard();
    });
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session) goToDashboard();
        else reveal();
      })
      .catch(reveal);
    // Never leave the page hidden if the check hangs.
    const safety = window.setTimeout(() => {
      if (!redirected) reveal();
    }, 4000);
    return () => {
      subscription.unsubscribe();
      window.clearTimeout(safety);
      reveal();
    };
  }, [router]);

  return (
    <div className="mv-landing min-h-screen bg-mv-paper font-mv-text text-mv-ink">
      <script dangerouslySetInnerHTML={{ __html: SESSION_HINT_SCRIPT }} />
      <LandingHeader />

      {/* B. Apertura */}
      <section
        ref={heroRef}
        aria-labelledby="titolo"
        className={`${WRAP} pb-14 pt-5 sm:pt-12`}
      >
        <div className="grid gap-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
          <div className="lg:pt-6">
            <p className="text-base leading-6 text-mv-muted sm:text-lg">
              Per fabbri, idraulici, elettricisti e piccole imprese edili.
            </p>
            <h1
              id="titolo"
              className="mv-display mt-3 text-[2.25rem] font-bold leading-[1.05] sm:text-6xl lg:text-[4rem]"
            >
              Detti le voci in cantiere. Il preventivo esce con i tuoi prezzi.
            </h1>
            <div className="mt-3 max-w-[38rem] space-y-3 text-base leading-[1.6] sm:mt-6 sm:text-lg sm:leading-8">
              <p>
                Dal telefono dici materiali e lavorazioni. Le righe escono con i prezzi
                del tuo listino, tu le controlli e il preventivo parte a nome della tua
                azienda.
              </p>
              <p className="hidden sm:block">
                Niente listino? Detti le voci e il prezzo lo scrivi tu.
              </p>
            </div>
            <div className="mt-4 sm:mt-8">
              <CtaLink href="/auth/register" className="w-full sm:w-auto">
                Prova con i tuoi prezzi
              </CtaLink>
              <p className="mt-2 text-base text-mv-muted">
                14 giorni di prova · serve la carta · disdici quando vuoi
              </p>
            </div>
            <div className="hidden lg:block">
              <HeroLinks showFounder={showFounder} />
            </div>
          </div>

          <div className="lg:flex lg:items-end lg:gap-6">
            <figure className="min-w-0 lg:flex-1">
              <ScreenSlot slot={MEDIA.heroPdf} sizes="(min-width: 1024px) 460px, 100vw">
                <QuoteSheet variant="preview" />
              </ScreenSlot>
              <figcaption className={CAPTION}>
                Il preventivo finito, con il nome e il modello della tua azienda.
              </figcaption>
            </figure>
            <div className="lg:hidden">
              <p className="mt-6 text-base leading-7">
                Niente listino? Detti le voci e il prezzo lo scrivi tu.
              </p>
              <HeroLinks showFounder={showFounder} />
            </div>
            <figure className="mt-10 lg:order-first lg:mt-0 lg:w-[240px] lg:shrink-0">
              <ScreenSlot slot={MEDIA.heroScreen} sizes="240px">
                <HeroDictationScreen />
              </ScreenSlot>
              <figcaption className={`${CAPTION} text-center lg:text-left`}>
                La voce detta diventa una riga, con il prezzo del tuo listino.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* C. Come funziona */}
      <section aria-labelledby="come-funziona" className="border-t border-mv-line">
        <div className={`${WRAP} py-14 sm:py-20`}>
          <h2 id="come-funziona" className={H2}>
            Come funziona
          </h2>

          {/* C0. La sera */}
          <div className="mt-10 grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <p className="mv-display text-3xl font-bold leading-tight sm:text-4xl">
                Il preventivo, di solito, si fa la sera.
              </p>
              <p className="mt-4 max-w-[38rem] text-base leading-7 sm:text-lg sm:leading-8">
                Misure su un foglio, il listino del fornitore aperto sul tavolo, la
                calcolatrice. E poi ricopiare tutto.
              </p>
            </div>
            <PhotoSlot slot={MEDIA.seraPrima}>
              <MeasurementSheet />
            </PhotoSlot>
          </div>

          <TickRule className="mt-14 sm:mt-20" />

          {/* C1. Prepari una volta */}
          <div className="mt-10 grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <h3 className={H3}>
                <StepNumber n={1} />
                Prepari una volta il listino e il modello
              </h3>
              <div className={`mt-4 ${BODY} max-w-[38rem]`}>
                <p>
                  Il listino lo carichi in PDF o Excel. Se il tuo grossista te lo dà in
                  formato METEL, va bene anche quello.
                </p>
                <p>
                  Per l&apos;aspetto del preventivo basta un tuo preventivo fatto in Word:
                  prima di caricarlo togli nomi e indirizzi dei clienti.
                </p>
                <p>
                  Niente listino? Si parte lo stesso: detti le voci e il prezzo lo scrivi
                  tu.
                </p>
              </div>
            </div>
            <figure>
              <ScreenSlot slot={MEDIA.listino}>
                <ListinoSample />
              </ScreenSlot>
              <figcaption className={CAPTION}>
                Il tuo listino, così com&apos;è. Lo carichi una volta.
              </figcaption>
            </figure>
          </div>

          <TickRule className="mt-14 sm:mt-20" />

          {/* C2. Detti in cantiere */}
          <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
            <div>
              <h3 className={H3}>
                <StepNumber n={2} />
                In cantiere lo dici. Non lo scrivi.
              </h3>
              <div className={`mt-4 ${BODY} max-w-[38rem]`}>
                <p>
                  Tocchi il microfono e dici cosa serve, come lo diresti a un collega.
                  Tocchi di nuovo per finire.
                </p>
                <p>
                  Se lì non c&apos;è campo, la registrazione resta salvata e parte quando
                  torna il segnale.
                </p>
              </div>
            </div>
            <div className="grid gap-10 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-start sm:gap-8">
              <figure>
                <ScreenSlot slot={MEDIA.schermataMicrofono}>
                  <MicScreen />
                </ScreenSlot>
                <figcaption className={`${CAPTION} text-center`}>
                  Un tocco per iniziare, uno per finire.
                </figcaption>
              </figure>
              <PhotoSlot
                slot={MEDIA.manoMicrofono}
                sizes="(min-width: 1024px) 320px, 100vw"
              />
            </div>
          </div>

          <TickRule className="mt-14 sm:mt-20" />

          {/* C3. Il prezzo è il tuo */}
          <div className="mt-10">
            <h3 className={`${H3} max-w-[46rem]`}>
              <StepNumber n={3} />
              Il prezzo è il tuo. E niente si salva senza il tuo sì.
            </h3>
            <div className={`mt-4 ${BODY} max-w-[38rem]`}>
              <p>
                Le righe escono con il prezzo del tuo listino. Prima di salvarle le
                guardi: cambi la quantità, togli quella che non va.
              </p>
              <p>
                Se una voce può essere più articoli, non tira a indovinare: ti chiede
                quale.
              </p>
            </div>

            <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,4fr)_minmax(0,4fr)] lg:gap-10">
              <figure className="lg:pt-6">
                <blockquote className="mv-display border-l-4 border-primary pl-4 text-[1.75rem] font-semibold leading-tight sm:text-4xl">
                  &ldquo;Sei metri di trave IPE 120, otto ancoranti chimici M12, e dodici
                  ore di manodopera.&rdquo;
                </blockquote>
                <figcaption className={CAPTION}>Quello che hai detto.</figcaption>
              </figure>
              <figure>
                <ScreenSlot slot={MEDIA.conferma}>
                  <ConfirmScreen />
                </ScreenSlot>
                <figcaption className={`${CAPTION} text-center`}>
                  Quello che esce. Lo salvi solo tu.
                </figcaption>
              </figure>
              <figure className="lg:pt-24">
                <ScreenSlot slot={MEDIA.avvisoScelta}>
                  <ChoiceBox />
                </ScreenSlot>
                <figcaption className={CAPTION}>
                  Quando non è sicuro, chiede a te.
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      {/* D. Esce a nome tuo. Il cliente risponde dal link. */}
      <section aria-labelledby="a-nome-tuo" className="border-t border-mv-line">
        <div className={`${WRAP} py-14 sm:py-20`}>
          <h2 id="a-nome-tuo" className={`${H2} max-w-[46rem]`}>
            Esce a nome tuo, con il tuo modello.
          </h2>
          <div className={`mt-4 ${BODY} max-w-[38rem]`}>
            <p>
              Stesso logo, stessa intestazione, stesso piè di pagina del preventivo che
              fai oggi in Word. Le righe sono quelle che hai detto in cantiere.
            </p>
            <p>Lo mandi come PDF o come link.</p>
          </div>

          <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-10">
            <figure className="mx-auto w-full max-w-[20rem] sm:max-w-[26rem] lg:max-w-none lg:pt-10">
              <p className="mb-3 text-lg font-semibold">Il tuo modello Word</p>
              <ScreenSlot slot={MEDIA.modelloWord}>
                <WordTemplateSheet />
              </ScreenSlot>
              <figcaption className={CAPTION}>
                Esempio con modello fittizio. Come lo fai oggi.
              </figcaption>
            </figure>
            <figure>
              <p className="mb-3 text-lg font-semibold">
                Il preventivo fatto con Mastrovoce
              </p>
              <ScreenSlot
                slot={MEDIA.preventivoMastrovoce}
                sizes="(min-width: 1024px) 640px, 100vw"
              >
                <QuoteSheet variant="full" />
              </ScreenSlot>
              <figcaption className={CAPTION}>
                Stessa faccia. Le righe dettate al passo 3 sono queste.
              </figcaption>
            </figure>
          </div>

          <TickRule className="mt-14 sm:mt-20" />

          {/* D2. Il cliente risponde dal link */}
          <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
            <div>
              <h3 className={H3}>
                Il cliente risponde dal link. La risposta resta registrata.
              </h3>
              <div className={`mt-4 ${BODY} max-w-[38rem]`}>
                <p>
                  Il cliente apre il link dal suo telefono, legge il preventivo e scrive
                  nome e cognome per accettare. Se vuole, ti lascia una nota. Può anche
                  rifiutare.
                </p>
                <p>
                  Quando accetta, il preventivo si blocca: non lo cambia più nessuno.
                  Resta scritto chi ha accettato, il giorno e l&apos;ora.
                </p>
                <p>
                  Non è una firma e non è una garanzia legale: è la registrazione di
                  quello che il cliente ha risposto.
                </p>
              </div>
              <PhotoSlot
                slot={MEDIA.clienteFoto}
                sizes="(min-width: 1024px) 380px, 100vw"
                className="mt-8 max-w-[24rem]"
              />
            </div>
            <div className="grid gap-10 sm:grid-cols-2 sm:gap-8">
              <figure>
                <ScreenSlot slot={MEDIA.clientePrima}>
                  <ClientBeforeScreen />
                </ScreenSlot>
                <figcaption className={`${CAPTION} text-center`}>
                  Quello che vede il cliente.
                </figcaption>
              </figure>
              <figure className="sm:pt-16">
                <ScreenSlot slot={MEDIA.clienteDopo}>
                  <ClientAfterScreen />
                </ScreenSlot>
                <figcaption className={`${CAPTION} text-center`}>
                  Dopo il sì, il preventivo è bloccato. Data d&apos;esempio.
                </figcaption>
              </figure>
            </div>
          </div>

          {/* D3. E dopo? */}
          <div className="mt-14 max-w-[42rem] border-l-4 border-mv-ink pl-5">
            <h3 className={H3}>E dopo?</h3>
            <div className={`mt-3 ${BODY}`}>
              <p>
                Il preventivo accettato resta nella lista Preventivi, tra gli accettati,
                con il PDF.
              </p>
              <p>
                Mastrovoce non fa fatture, non manda fatture elettroniche e non si collega
                al tuo gestionale. La fattura la fai come oggi, con il programma che usi
                già.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* E. Domande vere */}
      <section aria-labelledby="domande" className="border-t border-mv-line">
        <div className={`${WRAP} py-14 sm:py-20`}>
          <h2 id="domande" className={H2}>
            Le domande che ci fanno
          </h2>
          <Faq />
        </div>
      </section>

      {/* F. Quanto costa */}
      <section
        id="prezzi"
        ref={pricesRef}
        aria-labelledby="quanto-costa"
        className="scroll-mt-4 border-t border-mv-line"
      >
        <div className={`${WRAP} py-14 sm:py-20`}>
          <h2 id="quanto-costa" className={H2}>
            Quanto costa
          </h2>
          <div className="mt-8">
            <Pricing founderSlots={founderSlots} />
          </div>
        </div>

        {/* Chiusura: la sera libera (the only dark band of the page) */}
        <div className="bg-mv-ink text-mv-paper">
          <div
            className={`${WRAP} grid items-center gap-10 py-14 sm:py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,4fr)] lg:gap-10`}
          >
            <div>
              <p className="mv-display text-[2.25rem] font-bold leading-[1.05] sm:text-5xl">
                E la sera resta tua.
              </p>
              <p className="mt-4 text-base leading-7 text-stone-300 sm:text-lg sm:leading-8">
                Il preventivo è partito dal cantiere. Il cliente ha risposto dal link.
              </p>
              <CtaLink href="/auth/register" className="mt-8 w-full sm:w-auto">
                Prova con i tuoi prezzi
              </CtaLink>
              <p className="mt-2 text-base text-stone-300">
                14 giorni di prova · serve la carta · disdici quando vuoi
              </p>
            </div>
            <figure>
              <ScreenSlot slot={MEDIA.preventiviAccettati}>
                <PreventiviScreen />
              </ScreenSlot>
              <figcaption className="mt-3 text-center text-base text-stone-300">
                I preventivi accettati, tutti in una lista. Nomi e date d&apos;esempio.
              </figcaption>
            </figure>
            <PhotoSlot
              slot={MEDIA.seraDopo}
              dark
              sizes="(min-width: 1024px) 380px, 100vw"
            />
          </div>
        </div>
      </section>

      {/* G. Chi c'è dietro: short version (the story with the father is [DA CONFERMARE]).
          Long version, to publish only if true and confirmed by the founder:
          "Sono figlio di un [MESTIERE DEL PADRE]. Per anni ho visto mio padre fare i preventivi
          la sera, al tavolo di cucina, con il listino del fornitore e la calcolatrice.
          Mastrovoce è nato da quelle sere. L'ho fatto perché il preventivo si possa dire in
          cantiere, invece di scriverlo a casa. Se hai un dubbio, scrivimi. Rispondo io." */}
      <section aria-labelledby="chi-ce-dietro" className="border-b border-mv-line">
        <div className={`${WRAP} py-14 sm:py-20`}>
          <div className="max-w-[42rem]">
            <h2 id="chi-ce-dietro" className={H2}>
              Chi c&apos;è dietro
            </h2>
            <p className="mt-5 text-lg leading-8 sm:text-xl sm:leading-9">
              Mastrovoce lo facciamo noi{MADE_IN_ITALY_CONFIRMED ? ', in Italia,' : ''}{' '}
              per chi i preventivi li fa tra un lavoro e l&apos;altro. Se hai un dubbio,
              scrivici: risponde una persona.
            </p>
            {FOUNDER_NAME ? (
              <p className="mt-5 text-lg font-semibold">— {FOUNDER_NAME}</p>
            ) : null}
            <p className={FOUNDER_NAME ? 'mt-1' : 'mt-5'}>
              <CtaLink href={`mailto:${supportEmail}`} variant="text">
                {FOUNDER_NAME ? `Scrivi a ${FOUNDER_NAME}` : supportEmail}
              </CtaLink>
            </p>
          </div>
        </div>
      </section>

      {/* H. Piè di pagina */}
      <footer className={`${WRAP} pb-12 pt-10 text-base leading-7`}>
        <p>
          <span className="font-semibold">Mastrovoce</span> · Il preventivo dettato in
          cantiere, con i tuoi prezzi.
        </p>
        <p className="mt-2">
          Assistenza:{' '}
          <a
            href={`mailto:${supportEmail}`}
            className="inline-flex min-h-[48px] items-center font-semibold underline decoration-primary decoration-2 underline-offset-4 hover:text-primary-dark"
          >
            {supportEmail}
          </a>
        </p>
        {companyLine ? <p className="mt-1">{companyLine}</p> : null}
        <nav
          aria-label="Documenti legali"
          className="mt-1 flex flex-wrap items-center gap-x-2"
        >
          <CtaLink href="/privacy" variant="text">
            Privacy
          </CtaLink>
          <span aria-hidden="true">·</span>
          <CtaLink href="/terms" variant="text">
            Termini di servizio
          </CtaLink>
        </nav>
        <p className="mt-2 text-mv-muted">
          In cantiere lo usi dal telefono, in ufficio dal computer.
        </p>
      </footer>

      <StickyCta heroRef={heroRef} pricesRef={pricesRef} />
    </div>
  );
}

function HeroLinks({ showFounder }: { showFounder: boolean }) {
  return (
    <div className="mt-4 flex flex-col items-start">
      {/* Reserved line: the founder link appears only with a real number of places. */}
      <div className="min-h-[48px]">
        {showFounder ? (
          <CtaLink href="#prezzi" variant="text">
            Sei tra i primi 50? Guarda il prezzo fondatori
          </CtaLink>
        ) : null}
      </div>
      <CtaLink href="/auth/login" variant="text">
        Hai già un account? Accedi
      </CtaLink>
    </div>
  );
}

/** Step number of "Come funziona", in the brand orange. */
function StepNumber({ n }: { n: number }) {
  return <span className="mr-2 tabular-nums text-primary">{n}.</span>;
}

/** Squared sheet with handwritten measurements, drawn inside the photo slot (decorative). */
function MeasurementSheet() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center p-6"
    >
      <div className="relative w-full max-w-[22rem] rotate-[-2deg] border border-stone-300 bg-white px-6 py-5">
        <svg className="absolute inset-0 h-full w-full text-sky-200" aria-hidden="true">
          <defs>
            <pattern id="mv-squares" width="18" height="18" patternUnits="userSpaceOnUse">
              <path d="M18 0H0V18" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#mv-squares)" />
        </svg>
        <div className="relative font-mv-hand text-[1.6rem] leading-[2.25rem] text-[#1e3a8a]">
          <p>pensilina ingresso</p>
          <p>IPE 120 → 6 m</p>
          <p>
            tubolare 80 → 4 m <s className="text-[#1e3a8a]/70">3,5 m</s>
          </p>
          <p>lamiera 7,5 mq</p>
        </div>
      </div>
    </div>
  );
}
