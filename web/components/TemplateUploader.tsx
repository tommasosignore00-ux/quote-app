'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

type TemplateDraft = {
  template: string;
  preview: string;
  notes: string;
  missing: string[];
};

const ACCEPTED_EXTENSIONS = ['.docx', '.html', '.htm'];

/** An HTML file written for the app already has the item and total placeholders. */
function isReadyTemplate(html: string): boolean {
  return (
    /\{\{#items\}\}[\s\S]*\{\{\/items\}\}|\{\{\s*(items|itemsTable)\s*\}\}/.test(html) &&
    /\{\{\s*total\s*\}\}/.test(html)
  );
}

export default function TemplateUploader() {
  const [hasTemplate, setHasTemplate] = useState(false);
  const [templateSize, setTemplateSize] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [correction, setCorrection] = useState('');
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    loadTemplate();
  }, []);

  const loadTemplate = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('custom_template_html')
      .eq('id', user.id)
      .single();

    setHasTemplate(Boolean(profile?.custom_template_html));
    setTemplateSize(
      profile?.custom_template_html ? new Blob([profile.custom_template_html]).size : 0
    );
  };

  const saveTemplate = async (content: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Non autenticato');

    const { error } = await supabase
      .from('profiles')
      .update({ custom_template_html: content })
      .eq('id', user.id);
    if (error) throw error;

    setHasTemplate(true);
    setTemplateSize(new Blob([content]).size);
  };

  const requestConversion = async (
    body: FormData | { previousTemplate: string; instructions: string }
  ) => {
    const res = await fetch('/api/templates/convert', {
      method: 'POST',
      ...(body instanceof FormData
        ? { body }
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || 'Conversione non riuscita');
    return payload as TemplateDraft;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
      toast.error('Carica il preventivo in formato Word (.docx) o HTML');
      return;
    }

    setUploading(true);
    try {
      // HTML already prepared with the app's placeholders: save it as it is.
      if (name.endsWith('.html') || name.endsWith('.htm')) {
        const content = await file.text();
        if (isReadyTemplate(content)) {
          await saveTemplate(content);
          toast.success('Template caricato');
          return;
        }
      }

      // Anything else: the AI recognises the parts of the quote and builds the template.
      setConverting(true);
      const form = new FormData();
      form.append('file', file);
      setDraft(await requestConversion(form));
      setCorrection('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConverting(false);
      setUploading(false);
    }
  };

  const handleCorrection = async () => {
    if (!draft || !correction.trim()) return;
    setConverting(true);
    try {
      setDraft(
        await requestConversion({
          previousTemplate: draft.template,
          instructions: correction.trim(),
        })
      );
      setCorrection('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConverting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draft) return;
    if (
      draft.missing.length &&
      !confirm(
        `In questo template mancano: ${draft.missing.join(', ')}.\nI preventivi potrebbero uscire incompleti. Salvarlo comunque?`
      )
    ) {
      return;
    }
    try {
      await saveTemplate(draft.template);
      setDraft(null);
      toast.success('Template salvato: i prossimi preventivi useranno il tuo formato');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Vuoi rimuovere il template personalizzato?')) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Non autenticato');

      await supabase
        .from('profiles')
        .update({ custom_template_html: null })
        .eq('id', user.id);

      setHasTemplate(false);
      setTemplateSize(0);
      toast.success('Template rimosso');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const fileInput = (
    <input
      type="file"
      accept={ACCEPTED_EXTENSIONS.join(',')}
      onChange={handleUpload}
      disabled={uploading}
      className="hidden"
    />
  );

  return (
    <div className="bg-white rounded-xl shadow p-6 mb-6">
      <h2 className="text-xl font-bold mb-2">Template Preventivo Personalizzato</h2>
      <p className="text-sm text-slate-600 mb-4">
        Carica il preventivo che usi già (Word o HTML, anche uno vecchio già compilato):
        l&apos;app lo trasforma nel tuo modello, con cliente, voci e totali al posto
        giusto.
      </p>

      {draft ? (
        <div className="space-y-4">
          <div
            className={`rounded-lg border p-4 text-sm ${draft.missing.length ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}
            role="status"
          >
            {draft.missing.length
              ? `Attenzione: non ho trovato dove mettere ${draft.missing.join(', ')}. Scrivi sotto cosa correggere.`
              : 'Anteprima con dati di esempio: controlla che cliente, voci e totali siano al posto giusto.'}
            {draft.notes ? <p className="mt-1 text-slate-700">{draft.notes}</p> : null}
          </div>

          {/* sandbox with no permissions: the template can neither run scripts nor navigate. */}
          <iframe
            title="Anteprima del template con dati di esempio"
            sandbox=""
            srcDoc={draft.preview}
            className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white"
          />

          <label className="block text-sm text-slate-700">
            Cosa correggere? (facoltativo)
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="Es.: il totale va in basso a destra, togli la riga del telefono, intestazione blu"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSaveDraft}
              className="btn-primary"
              disabled={converting}
            >
              Salva template
            </button>
            <button
              onClick={handleCorrection}
              className="btn-secondary"
              disabled={converting || !correction.trim()}
            >
              {converting ? 'Correggo...' : 'Correggi'}
            </button>
            <button
              onClick={() => setDraft(null)}
              className="btn-secondary"
              disabled={converting}
            >
              Annulla
            </button>
          </div>
        </div>
      ) : hasTemplate ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-semibold">
              ✓ Template caricato ({(templateSize / 1024).toFixed(1)} KB)
            </p>
          </div>

          <div className="flex gap-3">
            <label className="flex-1 cursor-pointer">
              {fileInput}
              <div className="btn-secondary text-center">
                {converting
                  ? 'Leggo il preventivo...'
                  : uploading
                    ? 'Caricamento...'
                    : 'Sostituisci Template'}
              </div>
            </label>
            <button onClick={handleRemove} className="btn-danger">
              Rimuovi
            </button>
          </div>
        </div>
      ) : (
        <label className="block cursor-pointer">
          {fileInput}
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-primary transition-colors">
            <div className="text-4xl mb-2">📄</div>
            <p className="font-semibold text-slate-700">
              {converting
                ? 'Leggo il preventivo e preparo il modello...'
                : uploading
                  ? 'Caricamento...'
                  : 'Clicca per caricare il tuo preventivo (Word o HTML)'}
            </p>
          </div>
        </label>
      )}
    </div>
  );
}
