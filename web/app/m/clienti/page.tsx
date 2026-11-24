'use client';

/** All clients with a search, like the app's "Tutti i clienti"; tap one to see its jobs. */

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { clientUnitPrice, type Cliente, type Lavoro } from '@/lib/mobileWeb';
import { useMobileProfile } from '@/components/m/profile';
import JobRow from '@/components/m/JobRow';
import { ListGroup, Notice, PageTitle, inputClass } from '@/components/m/ui';

type Job = Lavoro & { total: number };

export default function MobileClients() {
  const profile = useMobileProfile();
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [lavori, setLavori] = useState<Job[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Cliente | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([
      supabase
        .from('clienti')
        .select('id, name, email, phone')
        .eq('profile_id', profile.id)
        .order('name'),
      supabase
        .from('lavori')
        .select(
          'id, title, cliente_id, status, updated_at, vat_percent, preventivi_dettaglio(quantity, unit_price, tax_rate)'
        )
        .eq('profile_id', profile.id)
        .order('updated_at', { ascending: false }),
    ]).then(([{ data: c }, { data: l }]) => {
      setClienti((c || []) as Cliente[]);
      setLavori(
        (
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
          }))
      );
      setLoaded(true);
    });
  }, [profile.id]);

  const jobsOf = (id: string) => lavori.filter((job) => job.cliente_id === id);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clienti.filter((c) => !q || c.name.toLowerCase().includes(q));
  }, [clienti, search]);

  if (open) {
    const jobs = jobsOf(open.id);
    return (
      <main>
        <PageTitle onBack={() => setOpen(null)} backLabel="Clienti">
          {open.name}
        </PageTitle>
        <div className="px-4 pt-2">
          <p className="mb-4 text-base font-semibold text-mv-muted">
            {jobs.length === 1 ? '1 lavoro aperto' : `${jobs.length} lavori aperti`}
          </p>
          {jobs.length ? (
            <ListGroup>
              {jobs.map((job) => (
                <li key={job.id}>
                  <JobRow job={job} clientName={open.name} />
                </li>
              ))}
            </ListGroup>
          ) : (
            <Notice>
              Nessun lavoro aperto per questo cliente. Detta una voce col microfono dalla
              pagina Lavori.
            </Notice>
          )}
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageTitle back="/m" backLabel="Lavori">
        Clienti
      </PageTitle>
      <div className="px-4 pt-2">
        <label className="mb-4 block">
          <span className="mb-1.5 block text-base font-semibold">Cerca cliente</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-mv-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Es. Rossi"
              className={`${inputClass} pl-12`}
            />
          </span>
        </label>
        {loaded && !visible.length ? (
          <Notice>
            {search.trim()
              ? `Nessun cliente con «${search.trim()}».`
              : 'Ancora nessun cliente. Lo crei quando detti la prima voce.'}
          </Notice>
        ) : (
          <ListGroup>
            {visible.map((cliente) => {
              const count = jobsOf(cliente.id).length;
              return (
                <li key={cliente.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(cliente)}
                    className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left active:bg-mv-soft"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-semibold">
                        {cliente.name}
                      </span>
                      <span className="block text-base font-semibold text-mv-muted">
                        {count === 1 ? '1 lavoro' : `${count} lavori`}
                      </span>
                    </span>
                    <ChevronRight className="h-6 w-6 shrink-0 text-mv-muted" />
                  </button>
                </li>
              );
            })}
          </ListGroup>
        )}
      </div>
    </main>
  );
}
