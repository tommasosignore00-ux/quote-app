'use client';

import { useEffect, useState } from 'react';
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
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('mfa') === '1')
      {setNeedsCode(true);}
  }, []);

  const continueToApp = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', userId)
      .single();
    // Hard navigation so the middleware sees the new session.
    window.location.href = profile?.onboarding_completed ? '/dashboard' : '/onboarding';
  };

  const handleCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (!factor) throw new Error('Nessun autenticatore configurato');
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code,
      });
      if (error) throw new Error('Codice non corretto');
      const { data } = await supabase.auth.getUser();
      if (data.user) await continueToApp(data.user.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(
          error.code === 'email_not_confirmed'
            ? 'Conferma prima il tuo indirizzo: apri il link che ti abbiamo inviato via email.'
            : 'Email o password non corrette.'
        );
      }

      const { data: assurance } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
        setNeedsCode(true);
        return;
      }
      await continueToApp(data.user.id);
    } catch (err: unknown) {
      const msg = (err as Error).message ?? '';
      if (
        msg === 'Load failed' ||
        msg === 'Failed to fetch' ||
        msg.includes('NetworkError') ||
        msg.includes('fetch')
      ) {
        toast.error(
          'Errore di connessione al server. Verifica la tua connessione e riprova.'
        );
      } else {
        toast.error(msg || 'Errore durante il login');
      }
    } finally {
      setLoading(false);
    }
  };

  if (needsCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <form
          onSubmit={handleCode}
          className="w-full max-w-md bg-white rounded-xl shadow-lg p-6 space-y-4"
        >
          <h1 className="text-2xl font-bold">Codice di verifica</h1>
          <p className="text-sm text-slate-600">
            Inserisci il codice a 6 cifre della tua app di autenticazione.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
            className="w-full border rounded-lg px-3 py-2 text-center text-xl tracking-widest"
          />
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full btn-primary"
          >
            {loading ? '...' : 'Verifica'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={handleLogin}
        className="w-full max-w-md bg-white rounded-xl shadow-lg p-6"
      >
        <h1 className="text-2xl font-bold mb-6">{t('auth.login')}</h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2"
            />
            <div className="mt-2 text-right">
              <Link
                href="/auth/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Password dimenticata?
              </Link>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full btn-primary">
            {loading ? '...' : t('auth.login')}
          </button>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/auth/register" className="text-primary hover:underline">
            {t('auth.register')}
          </Link>
        </p>
      </form>
    </div>
  );
}
