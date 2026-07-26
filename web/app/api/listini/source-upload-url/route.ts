import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import {
  buildListinoSourcePaths,
  ensureListinoSourceBucket,
  LISTINO_SOURCE_BUCKET,
} from '../../../../lib/listinoSourceStorage';

const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const payload = await req.json() as {
      profileId?: string | null;
      listinoId?: string | null;
      fileName?: string | null;
    };

    const profileId = payload.profileId?.trim();
    const listinoId = payload.listinoId?.trim();
    const fileName = payload.fileName?.trim();

    if (!profileId || !listinoId || !fileName) {
      return NextResponse.json({ error: 'profileId, listinoId e fileName sono obbligatori' }, { status: 400 });
    }

    const { data: listino, error: listinoError } = await supabase
      .from('listini')
      .select('id')
      .eq('id', listinoId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (listinoError) return NextResponse.json({ error: listinoError.message }, { status: 500 });
    if (!listino) return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });

    await ensureListinoSourceBucket();

    const { filePath } = buildListinoSourcePaths({
      profileId,
      listinoId,
      fileName,
    });

    const signedUpload = await supabase.storage
      .from(LISTINO_SOURCE_BUCKET)
      .createSignedUploadUrl(filePath, { upsert: true });

    if (signedUpload.error) {
      return NextResponse.json({ error: signedUpload.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      bucket: LISTINO_SOURCE_BUCKET,
      storagePath: signedUpload.data.path,
      token: signedUpload.data.token,
      signedUrl: signedUpload.data.signedUrl,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Signed upload URL creation failed' }, { status: 500 });
  }
}
