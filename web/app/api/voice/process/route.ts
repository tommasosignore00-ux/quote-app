import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { rateLimitVoice } from '../../../../lib/rate-limit';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    // Rate limit voice processing
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const rl = rateLimitVoice(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Troppe richieste vocali. Riprova tra poco.' },
        { status: 429, headers: rl.headers }
      );
    }

    const formData = await req.formData();
    const audio = formData.get('audio') as File;
    if (!audio) return NextResponse.json({ error: 'No audio' }, { status: 400 });

    const transcription = await openai.audio.transcriptions.create({
      file: audio,
      model: 'whisper-1',
    });

    const text = transcription.text;
    if (!text) return NextResponse.json({ action: 'none', text: '' });

    const clientiStr = formData.get('clienti') as string | null;
    const clienti: { id: string; name: string }[] = clientiStr ? JSON.parse(clientiStr) : [];
    const clientiList = clienti.map(c => `- ${c.name} (id: ${c.id})`).join('\n');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: `Sei un assistente per un'app di preventivi. Interpreta il comando vocale e restituisci JSON con:
- action: "create_cliente" | "create_lavoro" | "add_costo"
- data: oggetto con i campi necessari

Clienti disponibili:
${clientiList || '(nessuno)'}

Per create_lavoro: usa cliente_id se il nome corrisponde a un cliente nella lista, altrimenti cliente_name con il nome completo.
Esempi:
- "Crea cliente Mario Rossi" → {"action":"create_cliente","data":{"name":"Mario Rossi"}}
- "Nuovo lavoro Ristrutturazione bagno per Mario Rossi" → {"action":"create_lavoro","data":{"title":"Ristrutturazione bagno","cliente_id":"UUID_MARIO_ROSSI"}} oppure {"action":"create_lavoro","data":{"title":"Ristrutturazione bagno","cliente_name":"Mario Rossi"}}
- "Aggiungi rubinetto moderno" → {"action":"add_costo","data":{"description":"rubinetto moderno"}}
- "Inserisci 2 piastrelle bianche" → {"action":"add_costo","data":{"description":"piastrelle bianche","quantity":2}}
Rispondi SOLO con JSON valido.`,
        },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    return NextResponse.json({ ...parsed, text });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
