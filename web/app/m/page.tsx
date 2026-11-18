'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  clientUnitPrice,
  euro,
  rememberJob,
  rememberedJob,
  type Cliente,
  type Lavoro,
} from '@/lib/mobileWeb';
import { useMobileProfile } from '@/components/m/profile';
import Dictation from '@/components/m/Dictation';
import { Button, Field, Notice, Sheet, inputClass } from '@/components/m/ui';

type JobWithTotal = Lavoro & { total: number };

export default function MobileHome() {
  const profile = useMobileProfile();
  const router = useRouter();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [lavori, setLavori] = useState<JobWithTotal[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [pickHint, setPickHint] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: c }, { data: l }] = await Promise.all([
      supabase
        .from('clienti')
        .select('id, name, email, phone')
        .eq('profile_id', profile.id)
        .order('name'),
      supabase
        .from('lavori')
        .select(
          'id, title, cliente_id, status, updated_at, vat_percent, clienti(name), preventivi_dettaglio(quantity, unit_price, tax_rate)'
        )
        .eq('profile_id', profile.id)
        .order('updated_at', { ascending: false }),
    ]);
    setClienti((c || []) as Cliente[]);
    // Accepted quotes are final: they live only in Preventivi.
    const jobs = (
      (l || []) as unknown as (Lavoro & {
        preventivi_dettaglio?: {
          quantity: number;
          unit_price: number;
          tax_rate: number;
        }[];
      })[]
    )
      .filter((job) => job.status !== 'approved')
      .map((job) => ({
        ...job,
        total: (job.preventivi_dettaglio || []).reduce(
          (sum, line) => sum + Number(line.quantity) * clientUnitPrice(line),
          0
        ),
      }));
    setLavori(jobs);
    const remembered = rememberedJob();
    setCurrentId(jobs.some((job) => job.id === remembered) ? remembered : null);
    setLoaded(true);
  }, [profile.id]);

  useEffect(() => {
    load();
  }, [load]);

  const current = useMemo(
    () => lavori.find((job) => job.id === currentId) || null,
    [lavori, currentId]
  );
  const clientName = (job: Lavoro | null) =>
    (job?.clienti as { name?: string } | null)?.name ||
    clienti.find((c) => c.id === job?.cliente_id)?.name ||
    '';

  const choose = (id: string | null) => {
    rememberJob(id);
    setCurrentId(id);
    setPickHint(false);
  };

  return (
    <main className="px-4 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Lavori</h1>
        <span className="truncate text-base text-mv-muted">{profile.companyName}</span>
      </header>

      {current ? (
        <section
          className="mb-6 rounded-2xl border-2 border-mv-ink bg-mv-sheet p-4"
          aria-label="Lavoro attivo"
        >
          <p className="text-base text-mv-muted">Stai aggiungendo a</p>
          <p className="text-xl font-bold">
            {clientName(current)} · {current.title}
          </p>
          {lastAdded ? (
            <p className="mt-1 text-base font-semibold text-green-800">✓ {lastAdded}</p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              onClick={() => router.push(`/m/lavoro/${current.id}`)}
            >
              Apri il lavoro
            </Button>
            <Button variant="secondary" onClick={() => choose(null)}>
              Cambia
            </Button>
          </div>
        </section>
      ) : null}

      <section className="mb-8 flex flex-col items-center">
        <Dictation
          job={current}
          clientName={clientName(current)}
          onNeedJob={() => setPickHint(true)}
          onSaved={(rows) => {
            setLastAdded(
              rows.length === 1
                ? `Aggiunta: ${rows[0].description}`
                : `Aggiunte ${rows.length} voci`
            );
            load();
          }}
        />
        {pickHint ? (
          <div className="mt-4 w-full">
            <Notice>
              Prima scegli il lavoro qui sotto, oppure crea un nuovo lavoro.
            </Notice>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="recenti">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recenti" className="text-xl font-bold">
            Lavori recenti
          </h2>
        </div>
        {loaded && !lavori.length ? (
          <Notice>Non hai ancora lavori. Crea il primo per iniziare a dettare.</Notice>
        ) : null}
        <ul className="divide-y divide-mv-line overflow-hidden rounded-2xl border-2 border-mv-line bg-mv-sheet">
          {lavori.slice(0, 8).map((job) => (
            <li key={job.id} className="flex items-stretch">
              <button
                type="button"
                onClick={() => choose(job.id)}
                aria-pressed={job.id === currentId}
                className={`flex min-h-[72px] flex-1 flex-col justify-center px-4 text-left ${job.id === currentId ? 'bg-mv-mark' : ''}`}
              >
                <span className="text-lg font-bold">{job.title}</span>
                <span className="text-base text-mv-muted">
                  {clientName(job)} · {euro(job.total)}
                </span>
              </button>
              <Link
                href={`/m/lavoro/${job.id}`}
                onClick={() => rememberJob(job.id)}
                aria-label={`Apri ${job.title}`}
                className="flex w-16 items-center justify-center border-l border-mv-line"
              >
                <ChevronRight className="h-7 w-7" />
              </Link>
            </li>
          ))}
        </ul>
        <Button
          big
          variant="secondary"
          className="mt-4 w-full"
          onClick={() => setNewJobOpen(true)}
        >
          <Plus className="h-6 w-6" /> Nuovo lavoro
        </Button>
      </section>

      <NewJobSheet
        open={newJobOpen}
        clienti={clienti}
        profileId={profile.id}
        onClose={() => setNewJobOpen(false)}
        onCreated={(id) => {
          setNewJobOpen(false);
          choose(id);
          load();
        }}
      />
    </main>
  );
}

function NewJobSheet({
  open,
  clienti,
  profileId,
  onClose,
  onCreated,
}: {
  open: boolean;
  clienti: Cliente[];
  profileId: string;
  onClose: () => void;
  onCreated: (jobId: string) => void;
}) {
  const [clienteId, setClienteId] = useState('');
  const [newClient, setNewClient] = useState('');
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    if (!title.trim()) return setError('Scrivi il nome del lavoro.');
    if (!clienteId && !newClient.trim())
      {return setError('Scegli un cliente o scrivine uno nuovo.');}
    setSaving(true);
    let id = clienteId;
    if (!id) {
      const { data, error: clientError } = await supabase
        .from('clienti')
        .insert({
          profile_id: profileId,
          name: newClient.trim(),
          country_code: 'IT',
          preferred_language: 'it',
        })
        .select('id')
        .single();
      if (clientError || !data) {
        setSaving(false);
        return setError('Cliente non creato. Riprova.');
      }
      id = data.id;
    }
    const { data: job, error: jobError } = await supabase
      .from('lavori')
      .insert({
        profile_id: profileId,
        cliente_id: id,
        title: title.trim(),
        original_currency: 'EUR',
        exchange_rate: 1,
      })
      .select('id')
      .single();
    setSaving(false);
    if (jobError || !job) return setError('Lavoro non creato. Riprova.');
    setTitle('');
    setNewClient('');
    setClienteId('');
    onCreated(job.id);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Nuovo lavoro">
      <Field label="Cliente">
        <select
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          className={inputClass}
        >
          <option value="">Nuovo cliente…</option>
          {clienti.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      {!clienteId ? (
        <Field label="Nome del nuovo cliente">
          <input
            value={newClient}
            onChange={(e) => setNewClient(e.target.value)}
            className={inputClass}
          />
        </Field>
      ) : null}
      <Field label="Nome del lavoro">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Es. Pensilina ingresso"
          className={inputClass}
        />
      </Field>
      {error ? (
        <p className="mb-3 text-lg font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <Button big variant="secondary" onClick={onClose}>
          Annulla
        </Button>
        <Button big onClick={create} disabled={saving}>
          {saving ? 'Creo…' : 'Crea'}
        </Button>
      </div>
    </Sheet>
  );
}
