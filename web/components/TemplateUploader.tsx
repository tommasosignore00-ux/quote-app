'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function TemplateUploader() {
  const [hasTemplate, setHasTemplate] = useState(false);
  const [templateSize, setTemplateSize] = useState(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadTemplate();
  }, []);

  const loadTemplate = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('custom_template_html')
      .eq('id', user.id)
      .single();

    if (profile?.custom_template_html) {
      setHasTemplate(true);
      setTemplateSize(new Blob([profile.custom_template_html]).size);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      toast.error('Solo file HTML sono supportati');
      return;
    }

    setUploading(true);
    try {
      const content = await file.text();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await supabase
        .from('profiles')
        .update({ custom_template_html: content })
        .eq('id', user.id);

      setHasTemplate(true);
      setTemplateSize(new Blob([content]).size);
      toast.success(
        'Template caricato con successo!\n\nPlaceholder disponibili: {{lavoroTitle}}, {{clienteName}}, {{revision}}, {{items}}, {{subtotal}}, {{taxes}}, {{total}}, {{companyName}}, {{vatNumber}}, {{iban}}, {{swift}}, {{currency}}, {{taxLabel}}, {{date}}, {{dateTime}}'
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Vuoi rimuovere il template personalizzato?')) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

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

  return (
    <div className="bg-white rounded-xl shadow p-6 mb-6">
      <h2 className="text-xl font-bold mb-4">Template Preventivo Personalizzato</h2>
      
      {hasTemplate ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <p className="text-green-800 font-semibold">✓ Template caricato ({(templateSize / 1024).toFixed(1)} KB)</p>
          </div>
          
          <div className="flex gap-3">
            <label className="flex-1 cursor-pointer">
              <input
                type="file"
                accept=".html,.htm"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
              <div className="btn-secondary text-center">
                {uploading ? 'Caricamento...' : 'Sostituisci Template'}
              </div>
            </label>
            <button onClick={handleRemove} className="btn-danger">
              Rimuovi
            </button>
          </div>
        </div>
      ) : (
        <label className="block cursor-pointer">
          <input
            type="file"
            accept=".html,.htm"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
          <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-primary transition-colors">
            <div className="text-4xl mb-2">📄</div>
            <p className="font-semibold text-slate-700">
              {uploading ? 'Caricamento...' : 'Clicca per caricare HTML'}
            </p>
          </div>
        </label>
      )}
    </div>
  );
}
