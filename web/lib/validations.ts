import { z } from 'zod';

// ── Auth Schemas ──────────────────────────────────────────

export const registerSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(8, 'La password deve avere almeno 8 caratteri'),
  country_code: z.string().length(2).optional().nullable(),
  language: z.string().min(2).max(5).optional().nullable(),
  legalAccepted: z.array(z.object({
    id: z.string().uuid(),
    version: z.string(),
  })).optional(),
});

export const loginSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(1, 'Password richiesta'),
});

export const passwordResetSchema = z.object({
  email: z.string().email('Email non valida'),
});

// ── Stripe Schemas ──────────────────────────────────────────

export const checkoutSessionSchema = z.object({
  userId: z.string().uuid('userId non valido'),
  email: z.string().email().optional(),
  companyName: z.string().optional(),
  priceId: z.string().min(1, 'priceId è richiesto'),
});

// ── Voice Schemas ──────────────────────────────────────────

export const voiceProcessSchema = z.object({
  audio: z.instanceof(File, { message: 'File audio richiesto' }),
  clienti: z.string().optional(),
});

export const semanticMatchSchema = z.object({
  query: z.string().min(1, 'Query è richiesta'),
  profileId: z.string().uuid('profileId non valido'),
});

// ── Quote Schemas ──────────────────────────────────────────

export const sendEmailSchema = z.object({
  to: z.string().email('Email destinatario non valida'),
  subject: z.string().min(1, 'Subject è richiesto'),
  html: z.string().min(1, 'Corpo HTML richiesto'),
  lavoroId: z.string().uuid().optional(),
  revision: z.number().int().positive().optional(),
});

// ── Listini Schemas ──────────────────────────────────────────

export const listinoTextSearchSchema = z.object({
  query: z.string().min(1, 'Query è richiesta'),
  profileId: z.string().uuid('profileId non valido'),
});

// ── Client & Job Schemas ──────────────────────────────────────

export const createClienteSchema = z.object({
  name: z.string().min(1, 'Nome cliente richiesto').max(255),
  profile_id: z.string().uuid(),
});

export const createLavoroSchema = z.object({
  title: z.string().min(1, 'Titolo lavoro richiesto').max(255),
  cliente_id: z.string().uuid(),
  profile_id: z.string().uuid(),
});

export const createCostoSchema = z.object({
  lavoro_id: z.string().uuid(),
  description: z.string().min(1, 'Descrizione richiesta'),
  quantity: z.number().positive('Quantità deve essere positiva'),
  unit_price: z.number().min(0, 'Prezzo non può essere negativo'),
  tax_rate: z.number().min(0).max(100).optional(),
  listino_item_id: z.string().uuid().optional().nullable(),
});

// ── Profile Schema ──────────────────────────────────────────

export const updateProfileSchema = z.object({
  company_name: z.string().max(255).optional().nullable(),
  vat_number: z.string().max(50).optional().nullable(),
  fiscal_code: z.string().max(50).optional().nullable(),
  country_code: z.string().length(2).optional().nullable(),
  language: z.string().min(2).max(5).optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  postal_code: z.string().max(20).optional().nullable(),
  iban: z.string().max(50).optional().nullable(),
  swift_bic: z.string().max(20).optional().nullable(),
  vat_percent: z.number().min(0).max(100).optional(),
  material_markup: z.number().min(0).max(100).optional(),
});

// ── Helper ──────────────────────────────────────────

export function validateRequest<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const errorMessage = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
  return { success: false, error: errorMessage };
}
