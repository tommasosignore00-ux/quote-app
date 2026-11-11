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
