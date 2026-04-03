'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useSubscription } from '@/lib/useSubscription';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const { loading, hasAccess, profile } = useSubscription();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/auth/login';
        return;
      }
      setAuthChecked(true);
    };
    checkAuth();
  }, []);

  useEffect(() => {
    // Wait for both auth and subscription checks to complete
    if (!authChecked || loading) return;
    
    // Priority 1: Check onboarding completion
    if (!profile?.onboarding_completed) {
      console.log('Onboarding not completed, redirecting...');
      window.location.href = '/onboarding';
      return;
    }
    
    // Priority 2: Check subscription access (if not skipped)
    if (!hasAccess) {
      console.log('No subscription access, redirecting...');
      window.location.href = '/dashboard/subscription';
      return;
    }
  }, [authChecked, loading, hasAccess, profile?.onboarding_completed]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    // Force a hard navigation to clear all state
    window.location.href = '/auth/login';
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50">{t('messages.loading')}</div>;

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-slate-900 text-white flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <Link href="/dashboard" className="font-bold text-lg">Quote App</Link>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <Link
            href="/dashboard"
            className={`block py-2 px-3 rounded-lg ${pathname === '/dashboard' ? 'bg-primary' : 'hover:bg-slate-700'}`}
          >
            {t('main.jobs')}
          </Link>
          <Link
            href="/dashboard/listini"
            className={`block py-2 px-3 rounded-lg ${pathname === '/dashboard/listini' ? 'bg-primary' : 'hover:bg-slate-700'}`}
          >
            {t('main.listini')}
          </Link>
          <Link
            href="/dashboard/profile"
            className={`block py-2 px-3 rounded-lg ${pathname === '/dashboard/profile' ? 'bg-primary' : 'hover:bg-slate-700'}`}
          >
            {t('main.profile')}
          </Link>
          <Link
            href="/dashboard/subscription"
            className={`block py-2 px-3 rounded-lg ${pathname === '/dashboard/subscription' ? 'bg-primary' : 'hover:bg-slate-700'}`}
          >
            {t('subscription.title')}
          </Link>
        </nav>
        <div className="p-4 border-t border-slate-700">
          <button onClick={handleLogout} className="text-slate-400 hover:text-white text-sm">
            {t('messages.logout')}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-50">{children}</main>
    </div>
  );
}
