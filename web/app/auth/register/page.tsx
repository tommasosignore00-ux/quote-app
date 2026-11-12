'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { analytics } from '@/lib/analytics';
import Link from 'next/link';
import LegalModule from '@/components/LegalModule';
import { DEFAULT_COUNTRY_CODE, DEFAULT_LANGUAGE } from '@/lib/constants';
import { rememberOfferFromUrl } from '@/lib/useFounderSlots';

export default function RegisterPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // App disponibile solo in Italia
  const countryCode = DEFAULT_COUNTRY_CODE;
  const language = DEFAULT_LANGUAGE;
  const [legalAccepted, setLegalAccepted] = useState<Record<string, boolean>>({});
  const [legalDocuments, setLegalDocuments] = useState<{ id: string; version: string }[]>(
    []
  );
  const [loading, setLoading] = useState(false);

  // The landing page's founder button arrives here with ?offer=founder.
  useEffect(() => {
    rememberOfferFromUrl();
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Le password non coincidono');
      return;
    }
    if (Object.values(legalAccepted).some((v) => !v)) {
      toast.error('Devi accettare tutti i documenti legali');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          country_code: countryCode,
          language,
          legalAccepted: legalDocuments.filter((doc) => legalAccepted[doc.id]),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registrazione non riuscita');
      toast.success(
        "Ti abbiamo inviato un'email: apri il link per confermare l'indirizzo.",
        { duration: 8000 }
      );
      analytics.trackRegister('email');
      router.push('/auth/login');
    } catch (err: unknown) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <form
        onSubmit={handleRegister}
        className="w-full max-w-md bg-white rounded-xl shadow-lg p-6"
      >
        <h1 className="text-2xl font-bold mb-6">{t('auth.register')}</h1>
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
              minLength={8}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('auth.confirmPassword')}
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              {t('profile.country')}
            </label>
            <div className="w-full border rounded-lg px-3 py-2 bg-slate-50 text-slate-600">
              🇮🇹 Italia
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Al momento il servizio è disponibile solo in Italia.
            </p>
          </div>
          <LegalModule
            countryCode={countryCode}
            onAccept={setLegalAccepted}
            onDocumentsLoaded={setLegalDocuments}
            accepted={legalAccepted}
          />
          <button type="submit" disabled={loading} className="w-full btn-primary">
            {loading ? '...' : t('auth.register')}
          </button>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link href="/auth/login" className="text-primary hover:underline">
            {t('auth.login')}
          </Link>
        </p>
      </form>
    </div>
  );
}
