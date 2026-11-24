'use client';

import Link from 'next/link';
import { LogOut, Monitor, Share, SquarePlus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useMobileProfile } from '@/components/m/profile';
import { Button, PageTitle } from '@/components/m/ui';

export default function MobileProfile() {
  const profile = useMobileProfile();

  const logout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/auth/login';
  };

  return (
    <main>
      <PageTitle back="/m" backLabel="Lavori">
        Profilo
      </PageTitle>
      <div className="space-y-6 px-4 pt-4">
        <section className="rounded-[20px] border border-mv-line bg-mv-sheet p-4">
          <p className="text-base text-mv-muted">La tua azienda</p>
          <p className="text-xl font-bold">{profile.companyName || '—'}</p>
          <p className="mt-2 text-base text-mv-muted">
            IVA predefinita {profile.vatPercent}% · ricarico {profile.materialMarkup}%
          </p>
          <p className="mt-2 text-base">
            Dati azienda, listini e modello si cambiano dal computer.
          </p>
        </section>

        <section className="rounded-[20px] border border-mv-line bg-mv-sheet p-4">
          <h2 className="mb-3 text-xl font-bold">Mettila sulla schermata Home</h2>
          <ol className="space-y-3 text-lg">
            <li className="flex gap-3">
              <span className="font-bold">1.</span>
              <span>
                Apri questa pagina con <strong>Safari</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold">2.</span>
              <span className="flex flex-wrap items-center gap-1">
                Tocca <Share className="inline h-5 w-5" aria-label="Condividi" />{' '}
                <strong>Condividi</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold">3.</span>
              <span className="flex flex-wrap items-center gap-1">
                Scegli <SquarePlus className="inline h-5 w-5" aria-hidden="true" />
                <strong>Aggiungi alla schermata Home</strong>, poi{' '}
                <strong>Aggiungi</strong>.
              </span>
            </li>
          </ol>
          <p className="mt-3 text-base text-mv-muted">
            Su Android: menu ⋮ di Chrome → <strong>Aggiungi a schermata Home</strong>.
          </p>
        </section>

        <Link
          href="/dashboard?versione=computer"
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-xl border-2 border-mv-ink text-lg font-bold"
        >
          <Monitor className="h-5 w-5" /> Versione completa
        </Link>
        <Button variant="danger" className="w-full" onClick={logout}>
          <LogOut className="h-5 w-5" /> Esci
        </Button>
      </div>
    </main>
  );
}
