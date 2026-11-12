'use client';

import { useEffect, useState } from 'react';

/** Founder places still free, or null while unknown (then the offer is not shown). */
export function useFounderSlots(): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/stripe/founder-slots')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && typeof data?.left === 'number') setLeft(data.left);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return left;
}

/** "Restano N posti." only when few remain: a full counter reads as "nobody bought it". */
export function founderSlotsText(left: number): string | null {
  if (left > 20) return null;
  return left === 1 ? 'Resta 1 posto.' : `Restano ${left} posti.`;
}

const OFFER_KEY = 'mastrovoce:offer';

/** The visitor chose the founder path on the landing page (?offer=founder). */
export function rememberOfferFromUrl(): void {
  try {
    if (new URLSearchParams(window.location.search).get('offer') === 'founder') {
      window.localStorage.setItem(OFFER_KEY, 'founder');
    }
  } catch {
    // Storage unavailable: the choice is offered again at checkout.
  }
}

export function chosenFounderOffer(): boolean {
  try {
    return window.localStorage.getItem(OFFER_KEY) === 'founder';
  } catch {
    return false;
  }
}
