-- Fatture
CREATE TABLE public.fatture (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lavoro_id UUID REFERENCES public.lavori(id) ON DELETE SET NULL,
  cliente_id UUID NOT NULL REFERENCES public.clienti(id) ON DELETE CASCADE,
  
  numero_fattura VARCHAR(50) NOT NULL,
  data_emissione DATE NOT NULL DEFAULT CURRENT_DATE,
  data_scadenza DATE,
  tipo_fattura VARCHAR(20) NOT NULL DEFAULT 'fattura', -- fattura, nota_di_credito
  
  imponibile DECIMAL(12,2) NOT NULL,
  imposta DECIMAL(12,2) NOT NULL,
  totale DECIMAL(12,2) NOT NULL,
  valuta VARCHAR(3) DEFAULT 'EUR',
  
  stato VARCHAR(20) NOT NULL DEFAULT 'bozza', -- bozza, inviata, pagata, parzialmente_pagata, scaduta, annullata
  note TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Righe fatture
CREATE TABLE public.fatture_righe (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fattura_id UUID NOT NULL REFERENCES public.fatture(id) ON DELETE CASCADE,
  descrizione TEXT NOT NULL,
  quantita DECIMAL(10,2) DEFAULT 1,
  prezzo_unitario DECIMAL(12,2) NOT NULL,
  aliquota_iva DECIMAL(5,2) NOT NULL,
  imponibile_riga DECIMAL(12,2) NOT NULL,
  imposta_riga DECIMAL(12,2) NOT NULL,
  totale_riga DECIMAL(12,2) NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- Pagamenti
CREATE TABLE public.pagamenti (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fattura_id UUID REFERENCES public.fatture(id) ON DELETE SET NULL,
  lavoro_id UUID REFERENCES public.lavori(id) ON DELETE SET NULL,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clienti(id) ON DELETE SET NULL,
  
  importo DECIMAL(12,2) NOT NULL,
  valuta VARCHAR(3) DEFAULT 'EUR',
  metodo_pagamento VARCHAR(50), -- bonifico, contanti, assegno, etc.
  stato VARCHAR(20) NOT NULL DEFAULT 'in_attesa', -- in_attesa, completato, fallito, rimborsato
  
  data_pagamento TIMESTAMPTZ,
  note TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Aggiorniamo la tabella lavori per aggiungere un riferimento alla fattura finale (opzionale)
ALTER TABLE public.lavori ADD COLUMN IF NOT EXISTS fattura_id UUID REFERENCES public.fatture(id) ON DELETE SET NULL;

-- Indici
CREATE INDEX idx_fatture_profile ON public.fatture(profile_id);
CREATE INDEX idx_fatture_cliente ON public.fatture(cliente_id);
CREATE INDEX idx_fatture_lavoro ON public.fatture(lavoro_id);
CREATE INDEX idx_fatture_righe_fattura ON public.fatture_righe(fattura_id);
CREATE INDEX idx_pagamenti_fattura ON public.pagamenti(fattura_id);
CREATE INDEX idx_pagamenti_lavoro ON public.pagamenti(lavoro_id);
CREATE INDEX idx_pagamenti_profile ON public.pagamenti(profile_id);
CREATE INDEX idx_pagamenti_cliente ON public.pagamenti(cliente_id);

-- RLS
ALTER TABLE public.fatture ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatture_righe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamenti ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fatture_own" ON public.fatture FOR ALL USING (
  profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "fatture_righe_own" ON public.fatture_righe FOR ALL USING (
  fattura_id IN (SELECT id FROM public.fatture WHERE profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid()))
);
CREATE POLICY "pagamenti_own" ON public.pagamenti FOR ALL USING (
  profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
);

-- Funzione per generare numero fattura automatico
CREATE OR REPLACE FUNCTION public.genera_numero_fattura(p_profile_id UUID, p_anno INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER)
RETURNS VARCHAR(50) AS $$
DECLARE
  v_ultimo_num INTEGER;
  v_numero VARCHAR(50);
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(numero_fattura FROM '^[0-9]+') AS INTEGER)
  ), 0) INTO v_ultimo_num
  FROM public.fatture
  WHERE profile_id = p_profile_id
    AND EXTRACT(YEAR FROM data_emissione) = p_anno;
  
  v_numero := LPAD((v_ultimo_num + 1)::TEXT, 6, '0') || '/' || p_anno::TEXT;
  
  RETURN v_numero;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Tabella Integrazioni
CREATE TABLE public.integrazioni (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- xero, quickbooks, fortnox, pipedrive, hubspot, google_calendar, apple_calendar
  is_active BOOLEAN DEFAULT FALSE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  last_sync TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, provider)
);

ALTER TABLE public.integrazioni ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrazioni_own" ON public.integrazioni FOR ALL USING (
  profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
);
