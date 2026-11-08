-- La cache conservava in chiaro il testo delle dettature ed era condivisa tra tutti gli
-- utenti. Nessun codice la legge più: si elimina insieme al suo contenuto.
DROP FUNCTION IF EXISTS public.cleanup_embedding_cache();
DROP TABLE IF EXISTS public.embedding_cache;
