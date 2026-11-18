'use client';

import { createContext, useContext } from 'react';

export type MobileProfile = {
  id: string;
  companyName: string;
  vatPercent: number;
  materialMarkup: number;
};

export const ProfileContext = createContext<MobileProfile | null>(null);

export function useMobileProfile(): MobileProfile {
  const value = useContext(ProfileContext);
  if (!value) throw new Error('useMobileProfile outside /m');
  return value;
}
