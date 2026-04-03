-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Countries and locales reference
CREATE TABLE public.countries (
  code VARCHAR(2) PRIMARY KEY,
  name_en VARCHAR(100),
  currency VARCHAR(3),
  vat_default DECIMAL(5,2),
  legal_framework VARCHAR(50)  -- GDPR, CCPA, etc.
);

-- Legal documents versions (privacy, terms, security)
CREATE TABLE public.legal_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type VARCHAR(50) NOT NULL,  -- privacy_policy, terms_of_service, security_policy
  country_code VARCHAR(2) REFERENCES public.countries(code),
  version VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Legal acceptances (user consent tracking)
CREATE TABLE public.legal_acceptances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL,
  document_id UUID REFERENCES public.legal_documents(id),
  document_version VARCHAR(20) NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Profiles: company data + Stripe status
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  vat_number VARCHAR(50),           -- Partita IVA / EIN / Tax ID
  fiscal_code VARCHAR(50),          -- Codice Fiscale / SSN
  country_code VARCHAR(2) REFERENCES public.countries(code),
  language VARCHAR(5) DEFAULT 'it',
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  iban VARCHAR(50),
  swift_bic VARCHAR(20),
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  subscription_status VARCHAR(50),  -- trialing, active, canceled, past_due
  subscription_plan VARCHAR(50),    -- monthly, yearly
  trial_ends_at TIMESTAMPTZ,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clients
CREATE TABLE public.clienti (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  postal_code VARCHAR(20),
  country_code VARCHAR(2),
  vat_number VARCHAR(50),
  fiscal_code VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Jobs (quote headers) - Master
CREATE TABLE public.lavori (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clienti(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'draft',  -- draft, pending, approved, rejected
  total_amount DECIMAL(12,2) DEFAULT 0,
  total_tax DECIMAL(12,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'EUR',
  current_revision INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quote detail lines - Detail (prices frozen at insert)
CREATE TABLE public.preventivi_dettaglio (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lavoro_id UUID NOT NULL REFERENCES public.lavori(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL,    -- Frozen price at insert
  discount_percent DECIMAL(5,2) DEFAULT 0,
  tax_rate DECIMAL(5,2) NOT NULL,
  listino_item_id UUID,                 -- Reference to source price list
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Price lists with vector embeddings for semantic search
CREATE TABLE public.listini (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EUR',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.listini_vettoriali (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  listino_id UUID NOT NULL REFERENCES public.listini(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  embedding vector(1536),               -- OpenAI ada-002 dimension
  unit_price DECIMAL(12,2) NOT NULL,
  markup_percent DECIMAL(5,2) DEFAULT 0,
  sku VARCHAR(100),
  category VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quote document versions (full history)
CREATE TABLE public.preventivi_versioni (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lavoro_id UUID NOT NULL REFERENCES public.lavori(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  html_content TEXT,
  pdf_path TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id),
  sent_via_email BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  recipient_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_clienti_profile ON public.clienti(profile_id);
CREATE INDEX idx_lavori_profile ON public.lavori(profile_id);
CREATE INDEX idx_lavori_cliente ON public.lavori(cliente_id);
CREATE INDEX idx_preventivi_dettaglio_lavoro ON public.preventivi_dettaglio(lavoro_id);
CREATE INDEX idx_listini_profile ON public.listini(profile_id);
CREATE INDEX idx_listini_vettoriali_profile ON public.listini_vettoriali(profile_id);
CREATE INDEX idx_listini_vettoriali_listino ON public.listini_vettoriali(listino_id);

-- Vector similarity search index
CREATE INDEX idx_listini_vettoriali_embedding ON public.listini_vettoriali 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clienti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lavori ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventivi_dettaglio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listini ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listini_vettoriali ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventivi_versioni ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_acceptances ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users see only their data
CREATE POLICY "profiles_own" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "clienti_own" ON public.clienti FOR ALL USING (
  profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "lavori_own" ON public.lavori FOR ALL USING (
  profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "preventivi_dettaglio_own" ON public.preventivi_dettaglio FOR ALL USING (
  lavoro_id IN (SELECT id FROM public.lavori WHERE profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid()))
);
CREATE POLICY "listini_own" ON public.listini FOR ALL USING (
  profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "listini_vettoriali_own" ON public.listini_vettoriali FOR ALL USING (
  profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "preventivi_versioni_own" ON public.preventivi_versioni FOR ALL USING (
  lavoro_id IN (SELECT id FROM public.lavori WHERE profile_id IN (SELECT id FROM public.profiles WHERE id = auth.uid()))
);
CREATE POLICY "legal_acceptances_own" ON public.legal_acceptances FOR ALL USING (auth.uid() = user_id);

-- Countries readable by all authenticated
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "countries_read" ON public.countries FOR SELECT TO authenticated USING (true);
CREATE POLICY "legal_docs_read" ON public.legal_documents FOR SELECT TO authenticated USING (true);

-- Subscription check function for RLS (optional: restrict features)
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
    AND (subscription_status IN ('trialing', 'active')
         OR trial_ends_at > NOW())
  );
$$ LANGUAGE sql SECURITY DEFINER;
