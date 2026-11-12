'use client';

import Link from 'next/link';
import { useEffect, useState, type RefObject } from 'react';
import { BrandSymbol, CtaLink } from './primitives';

/** Section A: symbol + name once, "Accedi" and "Prova" visible on phones too. */
export function LandingHeader() {
  return (
    <header className="border-b border-mv-line bg-mv-paper">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Mastrovoce, torna all'inizio"
          className="flex min-h-[48px] items-center gap-2 text-mv-ink"
        >
          <BrandSymbol className="h-7 w-auto text-mv-ink" />
          <span className="mv-display text-xl font-bold">Mastrovoce</span>
        </Link>
        <nav aria-label="Accesso" className="flex items-center gap-2 sm:gap-3">
          <CtaLink href="/auth/login" variant="text" className="px-2">
            Accedi
          </CtaLink>
          <CtaLink href="/auth/register" className="min-h-[48px] px-5 text-base">
            Prova gratis
          </CtaLink>
        </nav>
      </div>
    </header>
  );
}

/**
 * Phone-only CTA fixed at the bottom: shows once the opening is scrolled past and
 * hides from the price section on, so it never doubles the buttons there.
 */
export function StickyCta({
  heroRef,
  pricesRef,
}: {
  heroRef: RefObject<HTMLElement>;
  pricesRef: RefObject<HTMLElement>;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const hero = heroRef.current;
      const prices = pricesRef.current;
      if (!hero || !prices) return;
      const pastHero = hero.getBoundingClientRect().bottom < 0;
      const atPrices = prices.getBoundingClientRect().top < window.innerHeight;
      setVisible(pastHero && !atPrices);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [heroRef, pricesRef]);

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-mv-line bg-mv-paper px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:hidden">
      <CtaLink href="/auth/register" className="w-full">
        Prova gratis per 14 giorni
      </CtaLink>
    </div>
  );
}
