'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import Link from 'next/link';

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // Supabase automatically handles session cookies
      // Check onboarding status and redirect
      const { data: profile } = await supabase.from('profiles').select('onboarding_completed').eq('id', data.user.id).single();
      
      // Force a hard navigation to ensure middleware picks up the new session
      if (profile?.onboarding_completed) {
        window.location.href = '/dashboard';
      } else {
        window.location.href = '/onboarding';
      }
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <form onSubmit={handleLogin} className="w-full max-w-md bg-white rounded-xl shadow-lg p-6">
        <h1 className="text-2xl font-bold mb-6">{t('auth.login')}</h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('auth.email')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full border rounded-lg px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('auth.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full border rounded-lg px-3 py-2" />
            <div className="mt-2 text-right">
              <Link href="/auth/forgot-password" className="text-sm text-blue-600 hover:underline">
                Forgot password?
              </Link>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full btn-primary">
            {loading ? '...' : t('auth.login')}
          </button>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/auth/register" className="text-primary hover:underline">{t('auth.register')}</Link>
        </p>
      </form>
    </div>
  );
}
