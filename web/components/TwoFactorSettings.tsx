'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';

type Enrollment = { id: string; qr: string; secret: string };

/** Optional second factor with an authenticator app. */
export default function TwoFactorSettings() {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');

  const load = async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp?.[0]?.id ?? null);
  };

  useEffect(() => {
    load();
  }, []);

  const start = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Mastrovoce ${Date.now()}`,
    });
    if (error || !data) {
      toast.error('Attivazione non riuscita');
      return;
    }
    setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const confirm = async () => {
    if (!enrollment) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.id,
      code,
    });
    if (error) {
      toast.error('Codice non corretto');
      return;
    }
    setEnrollment(null);
    setCode('');
    toast.success('Verifica in due passaggi attiva');
    load();
  };

  const remove = async () => {
    if (!factorId || !confirmRemoval()) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      toast.error('Operazione non riuscita');
      return;
    }
    setFactorId(null);
    await supabase.auth.refreshSession();
    toast.success('Verifica in due passaggi disattivata');
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Verifica in due passaggi</h2>
      <p className="mt-1 text-sm text-slate-500">
        Facoltativa: all&apos;accesso ti chiederemo anche un codice dell&apos;app di
        autenticazione.
      </p>
      {enrollment ? (
        <div className="mt-4 space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrollment.qr} alt="Codice QR da inquadrare" className="h-44 w-44" />
          <p className="break-all text-sm text-slate-600">
            Oppure inserisci: {enrollment.secret}
          </p>
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-40 rounded-lg border border-slate-200 px-3 py-2"
            aria-label="Codice a 6 cifre"
          />
          <button
            className="btn-primary ml-2"
            onClick={confirm}
            disabled={code.length !== 6}
          >
            Conferma
          </button>
        </div>
      ) : factorId ? (
        <button className="mt-4 min-h-[44px] text-danger" onClick={remove}>
          Disattiva
        </button>
      ) : (
        <button className="btn-primary mt-4" onClick={start}>
          Attiva
        </button>
      )}
    </section>
  );
}

function confirmRemoval() {
  return window.confirm('Vuoi disattivare la verifica in due passaggi?');
}
