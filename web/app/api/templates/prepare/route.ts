import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '../../../../lib/apiAuth';
import { sanitizeTemplateMarkup } from '../../../../lib/QuoteTemplate';
import { hostTemplateImages } from '../../../../lib/templateAssets';
import { missingTemplatePlaceholders } from '../../../../lib/templateConversion';

const MAX_TEMPLATE_CHARS = 3_000_000;

/**
 * Readies an HTML template written for the app (no AI): removes unsafe markup,
 * hosts its images so mail apps show them, and reports missing placeholders.
 */
export async function POST(req: Request) {
  try {
    const user = await getRequestUser(req);
    if (!user) return unauthorizedResponse();
    const { template, noRealData } = (await req.json()) as {
      template?: string;
      noRealData?: boolean;
    };
    if (noRealData !== true) {
      return NextResponse.json(
        { error: 'Conferma di caricare un preventivo senza dati reali' },
        { status: 400 }
      );
    }
    if (!template || !template.trim()) {
      return NextResponse.json({ error: 'Template vuoto' }, { status: 400 });
    }
    if (template.length > MAX_TEMPLATE_CHARS) {
      return NextResponse.json({ error: 'Template troppo grande' }, { status: 413 });
    }

    const ready = await hostTemplateImages(user.id, sanitizeTemplateMarkup(template));
    return NextResponse.json({
      ok: true,
      template: ready,
      missing: missingTemplatePlaceholders(ready),
    });
  } catch (err) {
    console.error('Template prepare error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Preparazione non riuscita' },
      { status: 500 }
    );
  }
}
