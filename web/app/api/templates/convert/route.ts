import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '../../../../lib/apiAuth';
import { supabaseAdmin } from '../../../../lib/supabase-server';
import { enforceAiQuota } from '../../../../lib/aiQuota';
import { hostTemplateImages } from '../../../../lib/templateAssets';
import {
  convertToTemplate,
  previewTemplate,
  readTemplateSource,
} from '../../../../lib/templateConversion';

// Reading a PDF/Word file and the AI conversion take a few seconds each.
export const maxDuration = 120;

const MAX_FILE_BYTES = 4 * 1024 * 1024;

/**
 * Converts the quote a company already uses (Word, PDF or HTML) into a template with
 * placeholders, or applies a correction to a converted template. Nothing is saved:
 * the page shows the preview and the user decides.
 */
export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const quotaExceeded = await enforceAiQuota(user.id, 'template');
    if (quotaExceeded) return quotaExceeded;

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('company_name, email, vat_number, fiscal_code, iban')
      .eq('id', user.id)
      .maybeSingle();
    const keepValues = [
      profile?.email,
      profile?.vat_number,
      profile?.fiscal_code,
      profile?.iban,
    ];

    let result;
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = (await req.json()) as {
        previousTemplate?: string;
        instructions?: string;
        sourceClientName?: string | null;
      };
      if (!body.previousTemplate || !String(body.instructions || '').trim()) {
        return NextResponse.json({ error: 'Scrivi cosa correggere' }, { status: 400 });
      }
      result = await convertToTemplate({
        previousTemplate: body.previousTemplate,
        instructions: String(body.instructions).slice(0, 1000),
        keepValues,
        sourceClientName: body.sourceClientName,
      });
    } else {
      const form = await req.formData();
      const file = form.get('file') as File | null;
      if (!file) {
        return NextResponse.json({ error: 'Nessun file caricato' }, { status: 400 });
      }
      if (form.get('noRealData') !== 'true') {
        return NextResponse.json(
          { error: 'Conferma di caricare un preventivo senza dati reali' },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: 'File troppo grande (massimo 4 MB)' },
          { status: 413 }
        );
      }
      const source = await readTemplateSource({
        buffer: Buffer.from(await file.arrayBuffer()),
        fileName: file.name,
      });
      result = await convertToTemplate({
        source,
        instructions: String(form.get('instructions') || '').slice(0, 1000) || undefined,
        keepValues,
      });
    }

    // Logos as hosted files: mail apps like Gmail do not show inline images.
    const template = await hostTemplateImages(user.id, result.template);

    return NextResponse.json({
      ok: true,
      template,
      preview: previewTemplate(template, profile?.company_name),
      notes: result.notes,
      missing: result.missing,
      warnings: result.warnings,
      sourceClientName: result.sourceClientName,
      clientNameLeft: result.clientNameLeft,
    });
  } catch (err) {
    console.error('Template conversion error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Conversione non riuscita' },
      { status: 500 }
    );
  }
}
