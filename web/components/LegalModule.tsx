'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { LEGAL_FRAMEWORKS } from '@/lib/constants';

type LegalModuleProps = {
  countryCode: string;
  onAccept: (accepted: Record<string, boolean>) => void;
  accepted: Record<string, boolean>;
};

export default function LegalModule({ countryCode, onAccept, accepted }: LegalModuleProps) {
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<{ id: string; type: string; version: string; content: string }[]>([]);

  useEffect(() => {
    const fetchDocs = async () => {
      const { data } = await supabase
        .from('legal_documents')
        .select('id, type, version, content')
        .eq('country_code', countryCode)
        .order('type');
      if (data) setDocuments(data);
    };
    fetchDocs();
  }, [countryCode]);

  const toggle = (id: string, checked: boolean) => {
    onAccept({ ...accepted, [id]: checked });
  };

  const framework = LEGAL_FRAMEWORKS[countryCode] || 'GDPR';

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="font-medium">{t('legal.title')} ({framework})</h3>
      {documents.length === 0 ? (
        <p className="text-sm text-slate-500">
          Documenti legali per {countryCode}. In assenza di documenti nel DB, accetta genericamente:
        </p>
      ) : null}
      {documents.map((doc) => (
        <label key={doc.id} className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!accepted[doc.id]}
            onChange={(e) => toggle(doc.id, e.target.checked)}
            className="mt-1"
          />
          <div className="flex-1">
            <span className="text-sm font-medium">
              {doc.type === 'privacy_policy' && t('legal.privacy')}
              {doc.type === 'terms_of_service' && t('legal.terms')}
              {doc.type === 'security_policy' && t('legal.security')}
            </span>
            <span className="text-xs text-slate-500 ml-2">({t('legal.version')} {doc.version})</span>
            {doc.content && (
              <div className="mt-1 text-xs text-slate-600 max-h-20 overflow-y-auto border rounded p-2 bg-slate-50">
                {doc.content.slice(0, 300)}...
              </div>
            )}
          </div>
        </label>
      ))}
      {documents.length === 0 && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={!!accepted['generic']}
            onChange={(e) => onAccept({ ...accepted, generic: e.target.checked })}
          />
          <span className="text-sm">{t('legal.accept')} (placeholder)</span>
        </label>
      )}
    </div>
  );
}
