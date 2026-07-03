import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { rateLimitVoice } from '../../../../lib/rate-limit';
import { runVoiceAgent } from '../../../../lib/voice-agent/orchestrator';
import type {
  VoiceAgentCatalogItem,
  VoiceAgentCustomerRef,
  VoiceAgentJobRef,
  VoiceAgentQuoteRef,
  VoiceAgentRuntimeContext,
} from '../../../../lib/voice-agent/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = rateLimitVoice(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Troppe richieste vocali. Riprova tra poco.' },
        { status: 429, headers: rl.headers }
      );
    }

    const formData = await req.formData();
    const audio = formData.get('audio') as File | null;
    if (!audio) return NextResponse.json({ error: 'No audio' }, { status: 400 });

    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
    });

    const text = transcription.text?.trim() || '';
    if (!text) {
      return NextResponse.json({
        action: 'none',
        data: {},
        text: '',
        agent: null,
      });
    }

    const context = buildVoiceAgentContext(formData);
    const agentResult = await runVoiceAgent({
      openai,
      input: {
        transcript: text,
        context,
      },
    });

    return NextResponse.json({
      action: agentResult.legacy.action,
      data: agentResult.legacy.data,
      text,
      agent: agentResult.agent,
      raw: agentResult.raw,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function buildVoiceAgentContext(formData: FormData): VoiceAgentRuntimeContext {
  const contextFromClient = parseJsonField<VoiceAgentRuntimeContext>(formData, 'context');
  if (contextFromClient) {
    return {
      appLanguage: contextFromClient.appLanguage ?? null,
      selectedInputLanguage: contextFromClient.selectedInputLanguage ?? null,
      company: contextFromClient.company ?? null,
      userIntentMode: contextFromClient.userIntentMode ?? 'voice_or_text',
      currentCustomer: contextFromClient.currentCustomer ?? null,
      currentJob: contextFromClient.currentJob ?? null,
      currentQuote: contextFromClient.currentQuote ?? null,
      existingCustomers: contextFromClient.existingCustomers ?? [],
      existingJobs: contextFromClient.existingJobs ?? [],
      catalogItems: contextFromClient.catalogItems ?? [],
    };
  }

  const legacyCustomers = parseJsonField<Array<{ id: string; name: string }>>(formData, 'clienti') || [];
  const existingJobs = parseJsonField<VoiceAgentJobRef[]>(formData, 'lavori') || [];
  const catalogItems = parseJsonField<VoiceAgentCatalogItem[]>(formData, 'catalogItems') || [];
  const currentCustomer = parseJsonField<VoiceAgentCustomerRef>(formData, 'currentCustomer');
  const currentJob = parseJsonField<VoiceAgentJobRef>(formData, 'currentJob');
  const currentQuote = parseJsonField<VoiceAgentQuoteRef>(formData, 'currentQuote');

  return {
    appLanguage: getStringField(formData, 'appLanguage') || getStringField(formData, 'selectedLanguage') || null,
    selectedInputLanguage: getStringField(formData, 'inputLanguage') || getStringField(formData, 'selectedLanguage') || null,
    userIntentMode: 'voice_or_text',
    company: {
      name: getStringField(formData, 'companyName') || null,
      country: getStringField(formData, 'companyCountry') || null,
      locale: getStringField(formData, 'companyLocale') || null,
      currency: getStringField(formData, 'companyCurrency') || null,
      vatMode: getStringField(formData, 'vatMode') || null,
      defaultVatRate: getNumberField(formData, 'defaultVatRate'),
    },
    currentCustomer: currentCustomer || null,
    currentJob: currentJob || null,
    currentQuote: currentQuote || null,
    existingCustomers: legacyCustomers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      companyName: customer.name,
    })),
    existingJobs,
    catalogItems,
  };
}

function parseJsonField<T>(formData: FormData, key: string): T | null {
  const raw = formData.get(key);
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function getStringField(formData: FormData, key: string): string | null {
  const raw = formData.get(key);
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function getNumberField(formData: FormData, key: string): number | null {
  const value = getStringField(formData, key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
