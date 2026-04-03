'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function useSubscription() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [profile, setProfile] = useState<{ onboarding_completed?: boolean; subscription_status?: string; trial_ends_at?: string } | null>(null);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/auth/login');
        return;
      }
      const { data: p } = await supabase.from('profiles').select('onboarding_completed, subscription_status, trial_ends_at').eq('id', session.user.id).single();
      setProfile(p || null);
      const active = process.env.NEXT_PUBLIC_SKIP_SUBSCRIPTION === 'true'
        || p?.subscription_status === 'trialing'
        || p?.subscription_status === 'active'
        || (p?.trial_ends_at && new Date(p.trial_ends_at) > new Date());
      setHasAccess(!!active);
      setLoading(false);
    };
    check();
  }, [router]);

  return { loading, hasAccess, profile };
}
