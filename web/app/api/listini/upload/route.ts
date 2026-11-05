import { NextResponse } from 'next/server';
import {
  getRequestUser,
  unauthorizedResponse,
  forbiddenResponse,
  isOwnProfile,
} from '../../../../lib/apiAuth';
import path from 'path';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { LISTINO_SOURCE_BUCKET } from '../../../../lib/listinoSourceStorage';
import {
  getActiveDebugRunId,
  reportDebugEvent,
} from '../../../../lib/listinoDebugShared';
import { processListinoImport } from '../../../../lib/listinoImportShared';

const supabase = supabaseAdmin;

// PDF extraction, OCR and AI fallbacks on large files exceed the default timeout on Vercel.
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
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

      if (storagePath) {
        // Il file sorgente deve stare nella cartella dell'utente
        if (!storagePath.startsWith(`${user.id}/`) || storagePath.includes('..')) {
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
    const runId = getActiveDebugRunId('upload-post');
    await reportDebugEvent({
      runId,
      hypothesisId: 'C',
      location: 'web/app/api/listini/upload/route.ts:POST:outer-catch',
      msg: '[DEBUG] Upload POST outer catch',
      data: {
        error: err?.message || String(err),
        stack: err?.stack?.slice?.(0, 1000) || null,
      },
    });
    console.error('Upload listini outer error:', err);
    return NextResponse.json({ error: err.message || 'Upload failed' }, { status: 500 });
  }
}
