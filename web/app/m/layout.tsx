'use client';

/**
 * Phone version of the site, made to be added to the home screen (Safari → Condividi →
 * Aggiungi alla schermata Home). Same account and data as the desktop dashboard.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useSubscription } from '@/lib/useSubscription';
import { resolveVatPercent } from '@/lib/constants';
import { TabBar } from '@/components/m/ui';
import { ProfileContext, type MobileProfile } from '@/components/m/profile';

export default function MobileLayout({ children }: { children: ReactNode }) {
  const { loading, hasAccess, profile } = useSubscription();
  const [mobileProfile, setMobileProfile] = useState<MobileProfile | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/auth/login';
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('id, company_name, vat_percent, material_markup')
        .eq('id', session.user.id)
        .single();
      setMobileProfile({
        id: session.user.id,
        companyName: data?.company_name || '',
        vatPercent: resolveVatPercent(data?.vat_percent),
        materialMarkup: Number(data?.material_markup) || 0,
      });
    };
    load();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (profile && !profile.onboarding_completed) window.location.href = '/onboarding';
    else if (profile && !hasAccess) window.location.href = '/dashboard/subscription';
  }, [loading, hasAccess, profile]);

  if (loading || !mobileProfile) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-mv-paper font-sans text-xl text-mv-ink">
        Caricamento…
      </div>
    );
  }

  return (
    <ProfileContext.Provider value={mobileProfile}>
      <div className="min-h-[100dvh] bg-mv-paper pb-[calc(80px+env(safe-area-inset-bottom))] font-sans text-base text-mv-ink antialiased">
        {children}
      </div>
      <TabBar />
    </ProfileContext.Provider>
  );
}
