import { z } from 'zod';
import type { LegacyVoiceActionResult } from './types';

const nullableString = z.string().trim().nullable().optional().default(null);
const nullableNumber = z.number().nullable().optional().default(null);

export const voiceAgentCatalogMatchSchema = z.object({
  matched: z.boolean().default(false),
  matchType: z.enum(['exact', 'probable', 'none']).default('none'),
  catalogId: nullableString,
  catalogLabel: nullableString,
  confidence: z.number().min(0).max(1).default(0),
});

export const voiceAgentCustomerSchema = z.object({
  action: z.enum(['create', 'update', 'none']).default('none'),
  matchStrategy: z.enum(['exact', 'probable', 'none']).default('none'),
  matchedCustomerId: nullableString,
  data: z.object({
    name: nullableString,
    companyName: nullableString,
    vatNumber: nullableString,
    taxCode: nullableString,
    address: nullableString,
    city: nullableString,
    postalCode: nullableString,
    country: nullableString,
    email: nullableString,
    phone: nullableString,
    notes: nullableString,
  }).default({}),
}).default({});

export const voiceAgentJobSchema = z.object({
  action: z.enum(['create', 'update', 'none']).default('none'),
  jobId: nullableString,
  customerId: nullableString,
  title: nullableString,
  description: nullableString,
  notes: nullableString,
}).default({});

export const voiceAgentQuoteItemSchema = z.object({
  action: z.enum(['add', 'update', 'remove']).default('add'),
  type: z.enum(['material', 'labor', 'travel', 'discount', 'note', 'other']).default('other'),
  sourceText: z.string().trim().default(''),
  catalogMatch: voiceAgentCatalogMatchSchema.default({}),
  quoteItemId: nullableString,
  description: nullableString,
  quantity: nullableNumber,
  unit: nullableString,
  unitPrice: nullableNumber,
  vatRate: nullableNumber,
  discountPercent: nullableNumber,
  discountAmount: nullableNumber,
  notes: nullableString,
});

export const voiceAgentQuoteSchema = z.object({
  action: z.enum(['create', 'update', 'none']).default('none'),
  quoteId: nullableString,
  jobId: nullableString,
  customerId: nullableString,
  description: nullableString,
  currency: nullableString,
  companyCountry: nullableString,
  items: z.array(voiceAgentQuoteItemSchema).default([]),
  notes: z.array(z.string()).default([]),
  translation: z.object({
    requested: z.boolean().default(false),
    sourceLanguage: nullableString,
    targetLanguage: nullableString,
  }).default({}),
}).default({});

export const voiceAgentClarificationSchema = z.object({
  field: z.string().trim().default(''),
  question: z.string().trim().default(''),
});

export const voiceAgentResultSchema = z.object({
  languageDetected: z.string().trim().default('auto'),
  targetLanguage: nullableString,
  intent: z.enum([
    'create_customer',
    'update_customer',
    'create_job',
    'update_job',
    'create_quote',
    'update_quote',
    'add_quote_items',
    'edit_quote_items',
    'remove_quote_items',
    'translate_quote',
    'mixed',
    'clarification_needed',
  ]).default('clarification_needed'),
  confidence: z.number().min(0).max(1).default(0),
  summary: z.string().trim().default(''),
  customer: voiceAgentCustomerSchema,
  job: voiceAgentJobSchema,
  quote: voiceAgentQuoteSchema,
  clarifications: z.array(voiceAgentClarificationSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type VoiceAgentResult = z.infer<typeof voiceAgentResultSchema>;

export function parseVoiceAgentResult(value: unknown): VoiceAgentResult {
  return voiceAgentResultSchema.parse(value);
}

export function toLegacyVoiceAction(result: VoiceAgentResult): LegacyVoiceActionResult {
  if (
    (result.intent === 'create_customer' || result.customer.action === 'create') &&
    (result.customer.data.companyName || result.customer.data.name)
  ) {
    return {
      action: 'create_cliente',
      data: {
        name: result.customer.data.companyName || result.customer.data.name,
        email: result.customer.data.email,
        phone: result.customer.data.phone,
        vatNumber: result.customer.data.vatNumber,
      },
    };
  }

  if (
    (result.intent === 'create_job' || result.intent === 'create_quote' || result.job.action === 'create' || result.quote.action === 'create') &&
    (result.job.title || result.quote.description) &&
    (result.job.customerId || result.quote.customerId || result.customer.matchedCustomerId || result.customer.data.companyName || result.customer.data.name)
  ) {
    return {
      action: 'create_lavoro',
      data: {
        title: result.job.title || result.quote.description,
        cliente_id: result.job.customerId || result.quote.customerId || result.customer.matchedCustomerId,
        cliente_name: result.customer.data.companyName || result.customer.data.name,
      },
    };
  }

  const firstItem = result.quote.items[0];
  if (
    firstItem &&
    ['add_quote_items', 'edit_quote_items', 'mixed'].includes(result.intent) &&
    firstItem.description
  ) {
    return {
      action: 'add_costo',
      data: {
        description: firstItem.description,
        quantity: firstItem.quantity ?? 1,
        unit: firstItem.unit,
        unit_price: firstItem.unitPrice,
        type: firstItem.type,
      },
    };
  }

  return { action: 'none', data: {} };
}
