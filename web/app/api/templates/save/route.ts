import { NextResponse } from 'next/server';
import { getRequestUser, unauthorizedResponse } from '../../../../lib/apiAuth';
import { sanitizeTemplateMarkup } from '../../../../lib/QuoteTemplate';
import { supabaseAdmin } from '../../../../lib/supabase-server';

const MAX_TEMPLATE_CHARS = 3_000_000;

/** The only way to store a custom template: the markup is sanitized before saving. */
export async function POST(req: Request) {
  const user = await getRequestUser(req);
  if (!user) return unauthorizedResponse();

  const { template } = (await req.json().catch(() => ({}))) as { template?: unknown };
  if (template !== null && typeof template !== 'string') {
    return NextResponse.json({ error: 'Template non valido' }, { status: 400 });
  }
  if (typeof template === 'string' && template.length > MAX_TEMPLATE_CHARS) {
    return NextResponse.json({ error: 'Template troppo grande' }, { status: 413 });
  }

  const clean = template === null ? null : sanitizeTemplateMarkup(template);
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ custom_template_html: clean })
    .eq('id', user.id);
  if (error) {
    console.error('Template save failed:', error.code);
    return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, template: clean });
}
