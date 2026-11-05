import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '../../../../lib/apiAuth';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const { description } = await req.json();
    if (!description) return NextResponse.json({ error: 'Missing description' }, { status: 400 });

    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: String(description),
    });
    const embedding = res.data[0].embedding;

    return NextResponse.json({ embedding });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
