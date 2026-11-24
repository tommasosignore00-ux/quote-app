'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FileText, Pencil, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  clientUnitPrice,
  euro,
  lacksPrice,
  qty,
  rememberJob,
  type Costo,
  type Lavoro,
} from '@/lib/mobileWeb';
import { useMobileProfile } from '@/components/m/profile';
import Dictation from '@/components/m/Dictation';
import LineSheet from '@/components/m/LineSheet';
import {
  Button,
  Field,
  Notice,
  PageTitle,
  Sheet,
  TextAction,
  inputClass,
} from '@/components/m/ui';

export default function MobileJob() {
  const { id } = useParams<{ id: string }>();
  const profile = useMobileProfile();
  const [job, setJob] = useState<Lavoro | null>(null);
  const [clientName, setClientName] = useState('');
  const [lines, setLines] = useState<Costo[]>([]);
  const [editing, setEditing] = useState<Costo | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const { data: lavoro } = await supabase
      .from('lavori')
      .select('id, title, cliente_id, status, vat_percent, clienti(name)')
      .eq('id', id)
      .eq('profile_id', profile.id)
      .maybeSingle();
    if (!lavoro) {
      setMissing(true);
      return;
    }
    setJob(lavoro as unknown as Lavoro);
    setClientName((lavoro.clienti as { name?: string } | null)?.name || '');
    const { data: righe } = await supabase
      .from('preventivi_dettaglio')
      .select(
        'id, description, quantity, unit_price, tax_rate, unit, vat_percent, created_at'
      )
      .eq('lavoro_id', id)
      .order('created_at', { ascending: true });
    setLines((righe || []) as Costo[]);
  }, [id, profile.id]);

  useEffect(() => {
    rememberJob(id);
    load();
  }, [id, load]);

  if (missing) {
    return (
      <main>
        <PageTitle back="/m" backLabel="Lavori">
          Lavoro
        </PageTitle>
        <div className="p-4">
          <Notice>Questo lavoro non c&apos;è più o non è tuo.</Notice>
        </div>
      </main>
    );
  }

  const total = lines.reduce(
    (sum, line) => sum + Number(line.quantity) * clientUnitPrice(line),
    0
  );
  const locked = job?.status === 'approved';
  const unpriced = lines.filter(lacksPrice).length;

  return (
    <main className="pb-[200px]">
      <PageTitle back="/m" backLabel="Lavori">
        {job?.title || 'Lavoro'}
      </PageTitle>

      <section className="px-4 pt-2">
        <div className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-xl font-bold">{clientName}</p>
            <p className="text-base font-semibold text-mv-muted">
              {locked
                ? 'Preventivo accettato: le voci restano così'
                : 'Le voci dettate qui vanno in questo lavoro'}
            </p>
          </div>
          {job && !locked ? (
            <Button
              variant="secondary"
              className="min-h-[48px] shrink-0 px-4"
              onClick={() => setRenaming(true)}
              aria-label={`Modifica il lavoro ${job.title}`}
            >
              <Pencil className="h-5 w-5" /> Modifica
            </Button>
          ) : null}
        </div>
        {locked ? (
          <div className="mb-4">
            <Notice>
              Preventivo accettato dal cliente: le voci non si possono più cambiare.
            </Notice>
          </div>
        ) : null}
        {unpriced && !locked ? (
          <div className="mb-4">
            <Notice tone="error">
              {unpriced === 1
                ? '1 voce è senza prezzo: toccala per metterlo, o il cliente la vedrà a 0 €.'
                : `${unpriced} voci sono senza prezzo: toccale per metterlo, o il cliente le vedrà a 0 €.`}
            </Notice>
          </div>
        ) : null}
        {!lines.length && job ? (
          <Notice>Ancora nessuna voce. Detta col microfono qui sotto.</Notice>
        ) : null}
        <ul
          className={`divide-y divide-mv-line overflow-hidden rounded-[20px] bg-mv-sheet ${
            lines.length ? 'border border-mv-line' : ''
          }`}
        >
          {lines.map((line) => (
            <li
              key={line.id}
              className={lacksPrice(line) ? 'border-l-8 border-danger' : undefined}
            >
              <button
                type="button"
                disabled={locked}
                onClick={() => setEditing(line)}
                aria-label={`Modifica ${line.description}`}
                className={`flex min-h-[80px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-mv-soft ${
                  highlight.includes(line.id) ? 'bg-mv-mark' : ''
                }`}
              >
                <span className="min-w-0">
                  <span className="line-clamp-2 block text-xl leading-[26px]">
                    {line.description}
                  </span>
                  <span className="block text-base font-semibold tabular-nums text-mv-muted">
                    {qty(line.quantity)}
                    {line.unit ? ` ${line.unit}` : ''} × {euro(clientUnitPrice(line))}
                    {line.vat_percent !== null && line.vat_percent !== undefined
                      ? ` · IVA ${qty(line.vat_percent)}%`
                      : ''}
                  </span>
                </span>
                {lacksPrice(line) ? (
                  <span className="whitespace-nowrap text-lg font-bold text-danger">
                    Prezzo da inserire
                  </span>
                ) : (
                  <span className="whitespace-nowrap text-xl font-bold tabular-nums">
                    {euro(Number(line.quantity) * clientUnitPrice(line))}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>

        {lines.length ? (
          <div className="mt-4 flex items-baseline justify-between border-t-2 border-mv-ink pt-3">
            <span className="text-xl font-bold">Totale</span>
            <span className="text-3xl font-bold tabular-nums">{euro(total)}</span>
          </div>
        ) : null}
        {lines.length ? (
          <p className="mt-1 text-base text-mv-muted">
            IVA esclusa: si aggiunge nel preventivo.
          </p>
        ) : null}

        {!locked ? (
          <TextAction className="mt-2" onClick={() => setAddOpen(true)}>
            <Plus className="h-5 w-5" /> Aggiungi una voce a mano
          </TextAction>
        ) : null}
      </section>

      {!locked && job ? (
        <div className="fixed bottom-[calc(100px+env(safe-area-inset-bottom))] right-4 z-20">
          <Dictation
            job={job}
            clientName={clientName}
            size="small"
            onSaved={(rows) => {
              setHighlight(rows.map((row) => row.id));
              window.setTimeout(() => setHighlight([]), 2500);
              load();
            }}
          />
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-mv-line bg-mv-paper px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        {lines.length ? (
          <Link
            href={`/m/lavoro/${id}/preventivo`}
            className="flex min-h-[64px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-xl font-bold text-white active:bg-primary-dark"
          >
            <FileText className="h-6 w-6" /> Prepara il preventivo
          </Link>
        ) : (
          <Button big disabled className="w-full">
            <FileText className="h-6 w-6" /> Prepara il preventivo
          </Button>
        )}
      </div>

      {job ? (
        <RenameSheet
          open={renaming}
          job={job}
          onClose={() => setRenaming(false)}
          onSaved={(title) => {
            setJob({ ...job, title });
            setRenaming(false);
          }}
        />
      ) : null}

      <LineSheet
        line={editing}
        onClose={() => setEditing(null)}
        onSaved={(line) => {
          setLines((current) => current.map((l) => (l.id === line.id ? line : l)));
          setEditing(null);
        }}
        onDeleted={(lineId) => {
          setLines((current) => current.filter((l) => l.id !== lineId));
          setEditing(null);
        }}
      />

      <AddLineSheet
        open={addOpen}
        lavoroId={id}
        onClose={() => setAddOpen(false)}
        onAdded={(line) => {
          setAddOpen(false);
          setLines((current) => [...current, line]);
        }}
      />
    </main>
  );
}

function AddLineSheet({
  open,
  lavoroId,
  onClose,
  onAdded,
}: {
  open: boolean;
  lavoroId: string;
  onClose: () => void;
  onAdded: (line: Costo) => void;
}) {
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const num = (value: string) => {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const add = async () => {
    if (!description.trim()) return setError('Scrivi la descrizione.');
    setSaving(true);
    // A typed price is the final one: no markup on top.
    const { data, error: insertError } = await supabase
      .from('preventivi_dettaglio')
      .insert({
        lavoro_id: lavoroId,
        description: description.trim(),
        quantity: num(quantity) || 1,
        unit: unit.trim() || null,
        unit_price: num(price),
        tax_rate: 0,
      })
      .select('*')
      .single();
    setSaving(false);
    if (insertError || !data) return setError('Voce non salvata. Riprova.');
    setDescription('');
    setQuantity('1');
    setUnit('');
    setPrice('');
    setError(null);
    onAdded(data as Costo);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Aggiungi una voce">
      <Field label="Descrizione">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantità">
          <input
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Unità">
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="pz, m, h…"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Prezzo al cliente (€)">
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
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
        <Button big onClick={add} disabled={saving}>
          {saving ? 'Salvo…' : 'Aggiungi'}
        </Button>
      </div>
    </Sheet>
  );
}

function RenameSheet({
  open,
  job,
  onClose,
  onSaved,
}: {
  open: boolean;
  job: Lavoro;
  onClose: () => void;
  onSaved: (title: string) => void;
}) {
  const [title, setTitle] = useState(job.title);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setTitle(job.title);
  }, [open, job.title]);
  const save = async () => {
    if (!title.trim()) return setError('Scrivi il nome del lavoro.');
    setSaving(true);
    const { error: updateError } = await supabase
      .from('lavori')
      .update({ title: title.trim() })
      .eq('id', job.id);
    setSaving(false);
    if (updateError) return setError('Non salvato. Riprova.');
    setError(null);
    onSaved(title.trim());
  };
  return (
    <Sheet open={open} onClose={onClose} title="Modifica il lavoro">
      <Field label="Nome del lavoro">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
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
        <Button big onClick={save} disabled={saving}>
          {saving ? 'Salvo…' : 'Salva'}
        </Button>
      </div>
    </Sheet>
  );
}
