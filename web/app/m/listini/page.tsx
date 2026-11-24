'use client';

/** Price lists, read-only on the phone: find an item and see its price to the client. */

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { euro } from '@/lib/mobileWeb';
import { useMobileProfile } from '@/components/m/profile';
import { ListGroup, Notice, PageTitle, inputClass } from '@/components/m/ui';

type Listino = { id: string; name: string; profile_id: string };
type Item = {
  id: string;
  description: string;
  unit_price: number;
  markup_percent: number | null;
  category: string | null;
};

export default function MobileListini() {
  const profile = useMobileProfile();
  const [listini, setListini] = useState<Listino[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<Listino | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase
      .from('listini')
      .select('id, name, profile_id')
      .order('name')
      .then(({ data }) => {
        setListini((data || []) as Listino[]);
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!open) return;
    setItems([]);
    supabase
      .from('listini_vettoriali')
      .select('id, description, unit_price, markup_percent, category')
      .eq('listino_id', open.id)
      .order('description')
      .then(({ data }) => setItems((data || []) as Item[]));
  }, [open]);

  const visible = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items
      .filter((item) => words.every((w) => item.description.toLowerCase().includes(w)))
      .slice(0, 100);
  }, [items, search]);

  const markup = (item: Item) => Number(item.markup_percent) || profile.materialMarkup;

  if (open) {
    return (
      <main>
        <PageTitle onBack={() => setOpen(null)} backLabel="Listini">
          {open.name}
        </PageTitle>
        <div className="px-4 pt-2">
          <label className="mb-4 block">
            <span className="mb-1.5 block text-base font-semibold">
              Cerca nel listino
            </span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-mv-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Es. IPE 120"
                className={`${inputClass} pl-12`}
              />
            </span>
          </label>
          {!visible.length ? (
            <Notice>
              {search.trim()
                ? `Nessuna voce con «${search.trim()}».`
                : 'Nessuna voce in questo listino.'}
            </Notice>
          ) : (
            <ListGroup>
              {visible.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  <p className="text-lg font-semibold">{item.description}</p>
                  <p className="text-base font-semibold text-mv-muted">
                    {euro(Number(item.unit_price))} · ricarico{' '}
                    {String(Math.round(markup(item) * 10) / 10).replace('.', ',')}%
                    {item.category ? ` · ${item.category}` : ''}
                  </p>
                  <p className="text-base font-bold">
                    Al cliente {euro(Number(item.unit_price) * (1 + markup(item) / 100))}
                  </p>
                </li>
              ))}
            </ListGroup>
          )}
          <p className="mt-4 text-base text-mv-muted">
            Per caricare o cambiare un listino usa il sito dal computer o l&apos;app.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageTitle back="/m" backLabel="Lavori">
        Listini
      </PageTitle>
      <div className="px-4 pt-2">
        {loaded && !listini.length ? (
          <Notice>
            Carica il listino del tuo grossista dal sito dal computer: quando detti, il
            prezzo arriva da solo.
          </Notice>
        ) : (
          <ListGroup>
            {listini.map((listino) => (
              <li key={listino.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setOpen(listino);
                  }}
                  className="flex min-h-[72px] w-full items-center gap-3 px-4 py-3 text-left active:bg-mv-soft"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-semibold">
                      {listino.name}
                    </span>
                    <span className="block text-base font-semibold text-mv-muted">
                      {listino.profile_id === profile.id
                        ? 'Tuo'
                        : 'Condiviso · sola lettura'}
                    </span>
                  </span>
                  <ChevronRight className="h-6 w-6 shrink-0 text-mv-muted" />
                </button>
              </li>
            ))}
          </ListGroup>
        )}
      </div>
    </main>
  );
}
