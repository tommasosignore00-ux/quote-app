'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function useRealtime(profileId: string | null, onUpdate: () => void) {
  useEffect(() => {
    if (!profileId) return;

    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clienti', filter: `profile_id=eq.${profileId}` }, onUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lavori', filter: `profile_id=eq.${profileId}` }, onUpdate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'preventivi_dettaglio' }, onUpdate)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profileId, onUpdate]);
}
