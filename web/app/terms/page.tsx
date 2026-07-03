'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function TermsPage() {
  const { t } = useTranslation();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDocument = async () => {
      try {
        const { data, error } = await supabase
          .from('legal_documents')
          .select('content')
          .eq('type', 'terms_of_service')
          .eq('country_code', 'IT')
          .order('effective_date', { ascending: false })
          .limit(1)
          .single();

        if (error) throw error;

        if (data) {
          setContent(data.content);
        } else {
          setContent('# Termini di Servizio\n\nContenuto di esempio...');
        }
      } catch (err) {
        console.error('Error loading terms of service:', err);
        setContent('# Termini di Servizio\n\nContenuto di esempio...');
      } finally {
        setLoading(false);
      }
    };

    loadDocument();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-12">
          <div className="prose prose-indigo prose-lg mx-auto">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
