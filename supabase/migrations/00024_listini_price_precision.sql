-- Prezzi unitari dei listini con 4 decimali.
-- Con DECIMAL(12,2) i prezzi normalizzati per unità (es. viti a 0,004 €/pz o
-- cavo a 0,0045 €/m ricavato da "rotolo da 100 m") venivano arrotondati a 0,00.
-- Nessuna view dipende dalla colonna; le funzioni di ricerca restituiscono "numeric".

ALTER TABLE public.listini_vettoriali
  ALTER COLUMN unit_price TYPE NUMERIC(14,4);
