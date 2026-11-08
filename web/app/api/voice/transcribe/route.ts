import { enforceAiQuota } from '../../../../lib/aiQuota';
import { openai } from '../../../../lib/openaiServer';
import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '../../../../lib/apiAuth';
import OpenAI from 'openai';
import { Readable } from 'stream';

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const quotaExceeded = await enforceAiQuota(user.id, 'voice');
    if (quotaExceeded) return quotaExceeded;
    const body = await req.json();
    const { audioBase64 } = body;

    if (!audioBase64) {
      return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 });
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
    console.error('Transcription error:', err);
    return NextResponse.json(
      { error: err.message || 'Transcription failed' },
      { status: 500 }
    );
  }
}
