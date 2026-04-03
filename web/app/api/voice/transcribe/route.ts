import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { Readable } from 'stream';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { audioBase64, filename = 'audio.wav', mimeType = 'audio/wav', userId } = body;

    if (!audioBase64) {
      return NextResponse.json({ error: 'audioBase64 is required' }, { status: 400 });
    }

    const buffer = Buffer.from(audioBase64, 'base64');
    const stream = Readable.from(buffer);

    // Call OpenAI transcription
    const transcription = await openai.audio.transcriptions.create({
      file: stream as any,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1',
    } as any);

    const text = transcription.text || '';

    // Optional: persist transcription
    try {
      await supabase.from('transcriptions').insert({
        user_id: userId || null,
        filename,
        mime_type: mimeType,
        text,
        created_at: new Date(),
      });
    } catch (e) {
      // table may not exist; don't fail hard
      console.warn('Could not persist transcription:', e);
    }

    return NextResponse.json({ text });
  } catch (err: any) {
    console.error('Transcription error:', err);
    return NextResponse.json({ error: err.message || 'Transcription failed' }, { status: 500 });
  }
}
