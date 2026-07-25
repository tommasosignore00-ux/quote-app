import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { getListinoSourceMetadata, getListinoSourceSignedUrl } from '../../../../lib/listinoSourceStorage';

const supabase = supabaseAdmin;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const listinoId = searchParams.get('listinoId');
    const profileId = searchParams.get('profileId');

    if (!listinoId || !profileId) {
      return NextResponse.json({ error: 'listinoId e profileId sono obbligatori' }, { status: 400 });
    }

    const { data: listino, error: listinoError } = await supabase
      .from('listini')
      .select('id')
      .eq('id', listinoId)
      .eq('profile_id', profileId)
      .maybeSingle();

    if (listinoError) return NextResponse.json({ error: listinoError.message }, { status: 500 });
    if (!listino) return NextResponse.json({ error: 'Listino non trovato' }, { status: 404 });

    const metadata = await getListinoSourceMetadata({ profileId, listinoId });
    if (!metadata) {
      return NextResponse.json({ ok: true, sourceInfo: null });
    }

    const downloadUrl = await getListinoSourceSignedUrl(metadata.storagePath, 3600);

    return NextResponse.json({
      ok: true,
      sourceInfo: {
        fileName: metadata.fileName,
        mimeType: metadata.mimeType,
        uploadedAt: metadata.uploadedAt,
        aiFeedback: metadata.aiFeedback || null,
        parsedSummary: metadata.parsedSummary || null,
        pricingDiagnostics: metadata.pricingDiagnostics || null,
        sourceDiagnostics: metadata.sourceDiagnostics || [],
        requiresPricingRules: Boolean(metadata.requiresPricingRules),
        downloadUrl,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || 'Source read failed' }, { status: 500 });
  }
}
