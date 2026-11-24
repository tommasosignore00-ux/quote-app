'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  clientUnitPrice,
  rememberJob,
  rememberedJob,
  type Cliente,
  type Lavoro,
} from '@/lib/mobileWeb';
import { useMobileProfile } from '@/components/m/profile';
import Dictation from '@/components/m/Dictation';
import JobRow from '@/components/m/JobRow';
import {
  Button,
  Field,
  ListGroup,
  Notice,
  PageTitle,
  SectionHeader,
  Sheet,
  TextAction,
  inputClass,
} from '@/components/m/ui';

type JobWithTotal = Lavoro & { total: number };

export default function MobileHome() {
  const profile = useMobileProfile();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [lavori, setLavori] = useState<JobWithTotal[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  /** Open while dictated lines wait for their job. */
  const [picking, setPicking] = useState<
    ((choice: { job: Lavoro; clientName: string } | null) => void) | null
  >(null);

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
  };

  const chooseJob = () =>
    new Promise<{ job: Lavoro; clientName: string } | null>((resolve) => {
      setPicking(() => resolve);
    });

  const picked = (job: Lavoro | null) => {
    picking?.(job ? { job, clientName: clientName(job) } : null);
    setPicking(null);
  };

  return (
    <main>
      <PageTitle brand>Lavori</PageTitle>
      <div className="px-4">
        {current ? (
          <section
            className="mt-2 flex items-center gap-3 rounded-[20px] border-2 border-mv-ink bg-mv-sheet p-4"
            aria-label="Lavoro attivo"
          >
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-mv-muted">Stai aggiungendo a</p>
              <p className="line-clamp-2 text-xl font-bold">
                {clientName(current) || '—'} · {current.title}
              </p>
              {lastAdded ? (
                <p className="mt-1 flex items-center gap-1.5 truncate text-base font-semibold">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-green-800" /> {lastAdded}
                </p>
              ) : null}
            </div>
            <Button
              variant="secondary"
              className="min-h-[64px] shrink-0"
              onClick={() => {
                choose(null);
                setLastAdded(null);
              }}
              aria-label="Chiudi: le prossime voci chiederanno cliente e lavoro"
            >
              <X className="h-5 w-5" /> Chiudi
            </Button>
          </section>
        ) : (
          <p className="mt-2 text-center text-base font-semibold text-mv-muted">
            Detta: ti chiedo dopo per quale cliente e lavoro.
          </p>
        )}

        <section className="mt-8 flex flex-col items-center">
          <Dictation
            job={current}
            clientName={clientName(current)}
            chooseJob={chooseJob}
            onSaved={(rows, job) => {
              choose(job.id);
              setLastAdded(
                rows.length === 1
                  ? `Aggiunta: ${rows[0].description}`
                  : `Aggiunte ${rows.length} voci`
              );
              load();
            }}
          />
        </section>

        <SectionHeader
          title="Lavori recenti"
          action={<TextAction href="/m/clienti">Tutti i clienti</TextAction>}
        />
        {loaded && !lavori.length ? (
          <Notice>
            Tocca il microfono e detta la prima voce, per esempio: «sei metri di trave IPE
            120».
          </Notice>
        ) : (
          <ListGroup>
            {lavori.slice(0, 8).map((job) => (
              <li key={job.id}>
                <JobRow job={job} clientName={clientName(job)} />
              </li>
            ))}
          </ListGroup>
        )}
        <TextAction className="mt-2" onClick={() => setNewJobOpen(true)}>
          <Plus className="h-5 w-5" /> Nuovo lavoro
        </TextAction>
      </div>

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

      <PickJobSheet
        open={picking !== null}
        lavori={lavori}
        clienti={clienti}
        profileId={profile.id}
        clientName={clientName}
        onPicked={picked}
      />
    </main>
  );
}

/** After dictating with no job: pick where the lines go, or make a new job. */
function PickJobSheet({
  open,
  lavori,
  clienti,
  profileId,
  clientName,
  onPicked,
}: {
  open: boolean;
  lavori: JobWithTotal[];
  clienti: Cliente[];
  profileId: string;
  clientName: (job: Lavoro) => string;
  onPicked: (job: Lavoro | null) => void;
}) {
  const [creating, setCreating] = useState(false);
  if (creating) {
    return (
      <NewJobSheet
        open={open}
        clienti={clienti}
        profileId={profileId}
        onClose={() => setCreating(false)}
        onCreated={async (id) => {
          setCreating(false);
          const { data } = await supabase
            .from('lavori')
            .select(
              'id, title, cliente_id, status, updated_at, vat_percent, clienti(name)'
            )
            .eq('id', id)
            .single();
          onPicked((data as unknown as Lavoro) || null);
        }}
      />
    );
  }
  return (
    <Sheet open={open} onClose={() => onPicked(null)} title="In quale lavoro?">
      {lavori.length ? (
        <ul className="mb-4 divide-y divide-mv-line overflow-hidden rounded-[20px] border border-mv-line bg-mv-sheet">
          {lavori.slice(0, 12).map((job) => (
            <li key={job.id}>
              <button
                type="button"
                onClick={() => onPicked(job)}
                className="flex min-h-[72px] w-full flex-col justify-center px-4 py-3 text-left active:bg-mv-soft"
              >
                <span className="text-xl font-bold">{job.title}</span>
                <span className="text-base font-semibold text-mv-muted">
                  {clientName(job)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-3">
        <Button big onClick={() => setCreating(true)}>
          <Plus className="h-6 w-6" /> Nuovo lavoro
        </Button>
        <Button big variant="secondary" onClick={() => onPicked(null)}>
          Annulla
        </Button>
      </div>
    </Sheet>
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
    if (!clienteId && !newClient.trim()) {
      return setError('Scegli un cliente o scrivine uno nuovo.');
    }
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
