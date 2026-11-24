-- Quote lines from a price list keep only the product name: "Travi IPE 120 (64 x 4,4 x
-- 6,3 x 7,0) - 10,4 kg/m (prezzo al metro)" becomes "Trave IPE 120". The full text stays
-- in the price list. A name the user typed or changed is never touched.

create or replace function public.short_item_name(full_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  s text := coalesce(full_name, '');
  first_word text;
  plural_words constant text[][] := array[
    ['Travi', 'Trave'], ['Tondi', 'Tondo'], ['Piatti', 'Piatto'], ['Tubi', 'Tubo'],
    ['Ferri', 'Ferro'], ['Esagoni', 'Esagono'], ['Quadri', 'Quadro'],
    ['Lamiere', 'Lamiera'], ['Trafilati', 'Trafilato'], ['Profilati', 'Profilato'],
    ['Angolari', 'Angolare'], ['Barre', 'Barra'],
    ['laminati', 'laminato'], ['trafilati', 'trafilato'], ['saldati', 'saldato'],
    ['ovali', 'ovale'], ['angolari', 'angolare'], ['quadrati', 'quadrato'],
    ['rettangolari', 'rettangolare'], ['tondi', 'tondo'], ['bugnate', 'bugnata'],
    ['piane', 'piana'], ['nere', 'nera'], ['lucide', 'lucida'], ['zincate', 'zincata'],
    ['decapate', 'decapata'], ['zincati', 'zincato'], ['striate', 'striata'],
    ['forate', 'forata'], ['stirate', 'stirata']
  ];
  pair text[];
begin
  -- "(prezzo al metro)", "(prezzo a foglio)" at the end.
  s := regexp_replace(s, '\s*\(prezzo[^)]*\)\s*$', '', 'i');
  -- Weight at the end: " - 10,4 kg/m", " - 212 kg".
  s := regexp_replace(s, '\s+-\s+[0-9][0-9.,]*\s*kg(\s*/\s*m)?\s*$', '', 'i');
  -- Section sizes in brackets made only of numbers: "(64 x 4,4 x 6,3 x 7,0)".
  s := regexp_replace(s, '\s*\(\s*[0-9][0-9.,x× ]*\)', '', 'g');
  s := btrim(regexp_replace(s, '\s{2,}', ' ', 'g'));

  -- One piece on the quote: "Travi" becomes "Trave", only for these trade words.
  first_word := split_part(s, ' ', 1);
  if first_word in ('Travi', 'Tondi', 'Piatti', 'Tubi', 'Ferri', 'Esagoni', 'Quadri',
                    'Lamiere', 'Trafilati', 'Profilati', 'Angolari', 'Barre') then
    foreach pair slice 1 in array plural_words loop
      s := regexp_replace(s, '\m' || pair[1] || '\M', pair[2], 'g');
    end loop;
  end if;

  return coalesce(nullif(s, ''), full_name);
end;
$$;

create or replace function public.shorten_line_from_listino()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  listino_name text;
begin
  if new.listino_item_id is null or new.description is null then
    return new;
  end if;
  select description into listino_name
    from public.listini_vettoriali
   where id = new.listino_item_id;
  -- Only the name copied from the price list; anything the user wrote stays as is.
  if listino_name is not null and btrim(new.description) = btrim(listino_name) then
    new.description := public.short_item_name(listino_name);
  end if;
  return new;
end;
$$;

drop trigger if exists shorten_line_from_listino on public.preventivi_dettaglio;
create trigger shorten_line_from_listino
  before insert on public.preventivi_dettaglio
  for each row execute function public.shorten_line_from_listino();

-- Lines already saved with the full price list text, in quotes not yet accepted.
update public.preventivi_dettaglio d
   set description = public.short_item_name(v.description)
  from public.listini_vettoriali v, public.lavori l
 where d.listino_item_id = v.id
   and l.id = d.lavoro_id
   and coalesce(l.status, '') <> 'approved'
   and btrim(d.description) = btrim(v.description)
   and public.short_item_name(v.description) <> d.description;
