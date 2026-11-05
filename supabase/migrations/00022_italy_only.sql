-- App disponibile solo in Italia (per ora).
-- La tabella countries resta intatta (è referenziata da legal_documents),
-- ma profili e clienti vengono portati e mantenuti su IT / it.

ALTER TABLE public.profiles ALTER COLUMN country_code SET DEFAULT 'IT';
ALTER TABLE public.profiles ALTER COLUMN language SET DEFAULT 'it';

UPDATE public.profiles
SET country_code = 'IT'
WHERE country_code IS DISTINCT FROM 'IT';

UPDATE public.profiles
SET language = 'it'
WHERE language IS DISTINCT FROM 'it';

UPDATE public.clienti
SET country_code = 'IT'
WHERE country_code IS DISTINCT FROM 'IT';

UPDATE public.clienti
SET preferred_language = 'it'
WHERE preferred_language IS DISTINCT FROM 'it';
