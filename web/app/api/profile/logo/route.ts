import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '../../../../lib/apiAuth';
import { hostTemplateImages } from '../../../../lib/templateAssets';
import { supabaseAdmin } from '../../../../lib/supabase-server';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/** SVG is excluded on purpose: it can carry scripts. */
function imageType(data: Buffer): 'png' | 'jpeg' | 'webp' | null {
  if (data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'png';
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpeg';
  if (
    data.subarray(0, 4).toString() === 'RIFF' &&
    data.subarray(8, 12).toString() === 'WEBP'
  )
    {return 'webp';}
  return null;
}

export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();

  const { base64 } = (await req.json().catch(() => ({}))) as { base64?: unknown };
  if (
    typeof base64 !== 'string' ||
    base64.length > Math.ceil((MAX_LOGO_BYTES * 4) / 3) + 4
  ) {
    return NextResponse.json(
      { error: 'Immagine mancante o più grande di 2 MB' },
      { status: 413 }
    );
  }
  const data = Buffer.from(base64, 'base64');
  const type = imageType(data);
  if (!type)
    {return NextResponse.json({ error: 'Usa un file PNG, JPEG o WebP' }, { status: 400 });}

  const hosted = await hostTemplateImages(
    user.id,
    `<img src="data:image/${type};base64,${base64}">`
  );
  const url = hosted.match(/src="(https:[^"]+)"/)?.[1];
  if (!url)
    {return NextResponse.json({ error: 'Caricamento non riuscito' }, { status: 500 });}

  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ logo_url: url })
    .eq('id', user.id);
  if (error)
    {return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 });}
  return NextResponse.json({ url });
}
