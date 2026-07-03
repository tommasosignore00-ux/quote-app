export type VoiceAgentIntent =
  | 'create_customer'
  | 'update_customer'
  | 'create_job'
  | 'update_job'
  | 'create_quote'
  | 'update_quote'
  | 'add_quote_items'
  | 'edit_quote_items'
  | 'remove_quote_items'
  | 'translate_quote'
  | 'mixed'
  | 'clarification_needed';

export type VoiceAgentCustomerAction = 'create' | 'update' | 'none';
export type VoiceAgentJobAction = 'create' | 'update' | 'none';
export type VoiceAgentQuoteAction = 'create' | 'update' | 'none';
export type VoiceAgentMatchStrategy = 'exact' | 'probable' | 'none';

export interface VoiceAgentCompanyContext {
  name?: string | null;
  country?: string | null;
  locale?: string | null;
  currency?: string | null;
  vatMode?: string | null;
  defaultVatRate?: number | null;
}

export interface VoiceAgentCustomerRef {
  id: string;
  name?: string | null;
  companyName?: string | null;
  vatNumber?: string | null;
  taxCode?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
}

export interface VoiceAgentJobRef {
  id: string;
  customerId?: string | null;
  title?: string | null;
  description?: string | null;
  notes?: string | null;
}

export interface VoiceAgentQuoteItemRef {
  id?: string | null;
  description?: string | null;
  quantity?: number | null;
  unit?: string | null;
  unitPrice?: number | null;
  vatRate?: number | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
  type?: string | null;
}

export interface VoiceAgentQuoteRef {
  id?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  currency?: string | null;
  language?: string | null;
  items?: VoiceAgentQuoteItemRef[];
}

export interface VoiceAgentCatalogItem {
  id: string;
  label: string;
  type?: string | null;
  unit?: string | null;
  unitPrice?: number | null;
  currency?: string | null;
  vatRate?: number | null;
  aliases?: string[];
}

export interface VoiceAgentRuntimeContext {
  appLanguage?: string | null;
  selectedInputLanguage?: string | null;
  company?: VoiceAgentCompanyContext | null;
  userIntentMode?: 'voice_or_text' | 'voice' | 'text' | null;
  currentCustomer?: VoiceAgentCustomerRef | null;
  currentJob?: VoiceAgentJobRef | null;
  currentQuote?: VoiceAgentQuoteRef | null;
  existingCustomers?: VoiceAgentCustomerRef[];
  existingJobs?: VoiceAgentJobRef[];
  catalogItems?: VoiceAgentCatalogItem[];
}

export interface VoiceAgentRunInput {
  transcript: string;
  context: VoiceAgentRuntimeContext;
}

export interface LegacyVoiceActionResult {
  action: 'create_cliente' | 'create_lavoro' | 'add_costo' | 'none';
  data?: Record<string, unknown>;
}
