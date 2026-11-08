import { enforceAiQuota } from '../../../../lib/aiQuota';
import { rateLimitVoice } from '../../../../lib/rate-limit';
import { openai } from '../../../../lib/openaiServer';
import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  requireActiveSubscription,
} from '../../../../lib/apiAuth';
import OpenAI from 'openai';
import { Readable } from 'stream';

// OpenAI accepts 25 MB of audio, about 34 MB once base64 encoded.
const MAX_AUDIO_BASE64 = 34_000_000;

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const notEntitled = await requireActiveSubscription(user.id);
    if (notEntitled) return notEntitled;
    const limited = await rateLimitVoice(user.id);
    if (!limited.success) {
      return NextResponse.json(
        { error: 'Troppe richieste. Riprova tra poco.' },
        { status: 429, headers: limited.headers }
      );
    }
    const quotaExceeded = await enforceAiQuota(user.id, 'voice');
    if (quotaExceeded) return quotaExceeded;
    const body = await req.json();
    const { audioBase64 } = body;

    if (
      typeof audioBase64 !== 'string' ||
      !audioBase64 ||
      audioBase64.length > MAX_AUDIO_BASE64
    ) {
      return NextResponse.json(
        { error: 'Registrazione non valida o troppo lunga' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(audioBase64, 'base64');
    const stream = Readable.from(buffer);

    // Call OpenAI transcription
    const transcription = await openai.audio.transcriptions.create({
      file: stream as any,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
      language: 'it',
    } as any);

    const text = transcription.text || '';

    return NextResponse.json({ text });
  } catch (err: any) {
    console.error('Transcription error:', err?.status ?? 'unknown');
    return NextResponse.json({ error: 'Trascrizione non riuscita' }, { status: 500 });
  }
}
