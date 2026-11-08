import { startListinoJob, wantsBackgroundJob } from '../../../../lib/listinoJobs';
import { enforceAiQuota } from '../../../../lib/aiQuota';
import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnProfile,
  requireActiveSubscription,
} from '../../../../lib/apiAuth';
import path from 'path';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { LISTINO_SOURCE_BUCKET } from '../../../../lib/listinoSourceStorage';
import { processListinoImport } from '../../../../lib/listinoImportShared';
import { getListinoAccess } from '../../../../lib/listinoAccess';

const supabase = supabaseAdmin;

// PDF extraction, OCR and AI fallbacks on large files exceed the default timeout on Vercel.
export const maxDuration = 300;

export async function POST(req: Request) {
  // Only JSON uploads (PDF already in Storage) can be replayed as a background job.
  if (
    wantsBackgroundJob(req) &&
    (req.headers.get('content-type') || '').includes('application/json')
  ) {
    return startListinoJob(req, 'listino_import', POST);
  }
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const notEntitled = await requireActiveSubscription(user.id);
    if (notEntitled) return notEntitled;
    const quotaExceeded = await enforceAiQuota(user.id, 'listino_import');
    if (quotaExceeded) return quotaExceeded;
    const requestContentType = req.headers.get('content-type') || '';
    let listinoName: string | null = null;
    let profileId: string | null = null;
    let listinoId: string | null = null;
    let originalFileName: string | null = null;
    let uploadedFileName = '';
    let uploadedFileType = '';
    let arrayBuffer = new ArrayBuffer(0);
    let sourceOnly = false;

    if (requestContentType.includes('application/json')) {
      const payload = (await req.json()) as {
        fileBase64?: string;
        storagePath?: string;
        fileName?: string;
        mimeType?: string;
        listinoName?: string | null;
        profileId?: string | null;
        listinoId?: string | null;
        originalFileName?: string | null;
        sourceOnly?: boolean;
      };

      if (!isOwnProfile(user, payload.profileId)) return forbiddenResponse();
      profileId = user.id;
      listinoId = payload.listinoId || null;
      listinoName = payload.listinoName || null;
      originalFileName = payload.originalFileName || payload.fileName || null;
      uploadedFileName = String(payload.fileName || originalFileName || '').trim();
      uploadedFileType = String(payload.mimeType || '').trim();
      const storagePath = String(payload.storagePath || '').trim();
      sourceOnly = Boolean(payload.sourceOnly);

      if (!profileId || !uploadedFileName) {
        return NextResponse.json({ error: 'Missing file or profileId' }, { status: 400 });
      }

      if (listinoId) {
        const access = await getListinoAccess(user.id, listinoId);
        if (!access)
          {return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });}
        if (!access.canEdit) return forbiddenResponse();
        profileId = access.ownerProfileId;
      }

      if (storagePath) {
        // Il file sorgente deve stare nella cartella del proprietario del listino
        if (!storagePath.startsWith(`${profileId}/`) || storagePath.includes('..')) {
          return forbiddenResponse();
        }
        const sourceDownload = await supabase.storage
          .from(LISTINO_SOURCE_BUCKET)
          .download(storagePath);

        if (sourceDownload.error) {
          return NextResponse.json(
            { error: sourceDownload.error.message },
            { status: 500 }
          );
        }

        arrayBuffer = await sourceDownload.data.arrayBuffer();
        if (!uploadedFileName) {
          uploadedFileName = path.basename(storagePath);
        }
        if (!uploadedFileType) {
          uploadedFileType = 'application/pdf';
        }
      } else if (payload.fileBase64) {
        arrayBuffer = Uint8Array.from(Buffer.from(payload.fileBase64, 'base64')).buffer;
      } else {
        return NextResponse.json({ error: 'Missing file or profileId' }, { status: 400 });
      }
    } else {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      listinoName = formData.get('listinoName') as string | null;
      if (!isOwnProfile(user, formData.get('profileId'))) return forbiddenResponse();
      profileId = user.id;
      listinoId = formData.get('listinoId') as string | null;
      originalFileName = formData.get('originalFileName') as string | null;

      if (!file || !profileId) {
        return NextResponse.json({ error: 'Missing file or profileId' }, { status: 400 });
      }

      if (listinoId) {
        const access = await getListinoAccess(user.id, listinoId);
        if (!access)
          {return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });}
        if (!access.canEdit) return forbiddenResponse();
        profileId = access.ownerProfileId;
      }

      uploadedFileName = file.name;
      uploadedFileType = file.type;
      arrayBuffer = await file.arrayBuffer();
    }

    const result = await processListinoImport({
      profileId: profileId!,
      listinoId,
      listinoName,
      originalFileName,
      uploadedFileName,
      uploadedFileType,
      arrayBuffer,
      sourceOnly,
    });

    // storedSource holds the full PDF text and candidates: internal only, not for the client.
    const { status, ok, storedSource: _storedSource, ...rest } = result;
    return NextResponse.json({ ok: ok || undefined, ...rest }, { status });
  } catch (err: any) {
    console.error('Upload listini outer error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
