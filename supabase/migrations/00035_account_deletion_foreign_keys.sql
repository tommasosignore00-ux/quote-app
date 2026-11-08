-- Cancellazione account: i riferimenti che bloccavano la DELETE su auth.users.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_referred_by_fkey;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_referred_by_fkey
  FOREIGN KEY (referred_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.stripe_webhook_events DROP CONSTRAINT IF EXISTS stripe_webhook_events_user_id_fkey;
ALTER TABLE public.stripe_webhook_events
  ADD CONSTRAINT stripe_webhook_events_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.preventivi_versioni DROP CONSTRAINT IF EXISTS preventivi_versioni_approved_by_fkey;
ALTER TABLE public.preventivi_versioni
  ADD CONSTRAINT preventivi_versioni_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Eliminando il profilo, clienti e lavori partono da due cascate indipendenti.
-- ON DELETE RESTRICT falliva appena un cliente veniva cancellato prima dei suoi lavori;
-- NO ACTION non differito controllerebbe alla fine della stessa cascata e fallirebbe
-- uguale. Differito, il controllo avviene al COMMIT, quando i lavori non ci sono più.
-- Cancellare un solo cliente con lavori resta vietato: l'errore arriva al COMMIT
-- dell'istruzione, sempre con codice 23503.
ALTER TABLE public.lavori DROP CONSTRAINT IF EXISTS lavori_cliente_id_fkey;
ALTER TABLE public.lavori
  ADD CONSTRAINT lavori_cliente_id_fkey
  FOREIGN KEY (cliente_id) REFERENCES public.clienti(id)
  ON DELETE NO ACTION
  DEFERRABLE INITIALLY DEFERRED;
