import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse, forbiddenResponse, isOwnProfile } from '../../../../lib/apiAuth';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { getListinoAccess } from '../../../../lib/listinoAccess';
import {
  buildListinoSourcePaths,
  ensureListinoSourceBucket,
  LISTINO_SOURCE_BUCKET,
} from '../../../../lib/listinoSourceStorage';

const supabase = supabaseAdmin;

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const payload = await req.json() as {
      profileId?: string | null;
      listinoId?: string | null;
      fileName?: string | null;
    };

    if (!isOwnProfile(user, payload.profileId?.trim())) return forbiddenResponse();
    const listinoId = payload.listinoId?.trim();
    const fileName = payload.fileName?.trim();

    if (!listinoId || !fileName) {
      return NextResponse.json({ error: 'profileId, listinoId e fileName sono obbligatori' }, { status: 400 });
    }

    const access = await getListinoAccess(user.id, listinoId);
    if (!access) return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });
    if (!access.canEdit) return forbiddenResponse();
    const profileId = access.ownerProfileId;

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
