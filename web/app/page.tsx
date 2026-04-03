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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-red-900/20 to-slate-900">
      <h1 className="text-4xl font-bold text-white mb-2">{t('app.title')}</h1>
      <p className="text-slate-300 mb-8">{t('app.subtitle')}</p>
      <div className="flex gap-4">
        <Link href="/auth/register" className="btn-primary">
          {t('auth.register')}
        </Link>
        <Link href="/auth/login" className="bg-white/10 hover:bg-white/20 text-white font-semibold py-2 px-4 rounded-lg border border-white/30">
          {t('auth.login')}
        </Link>
      </div>
    </div>
  );
}
