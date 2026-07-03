'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

const LEGAL_DOCUMENT_TYPES = ['privacy_policy', 'terms_of_service'] as const;
type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

export default function LegalConsentPopup() {
  const [showPopup, setShowPopup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<Array<{ id: string; type: string; version: string; content: string }>>([]);
  const [consent, setConsent] = useState<Record<string, boolean>>({});

  useEffect(() => {
    checkForNewDocuments();
  }, []);

  const checkForNewDocuments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('country_code')
        .eq('id', user.id)
        .single();

      const countryCode = profile?.country_code || 'IT';

      const latestDocs = await Promise.all(
        LEGAL_DOCUMENT_TYPES.map(async (type) => {
          const { data } = await supabase
            .from('legal_documents')
            .select('id, type, version, content')
            .eq('type', type)
            .eq('country_code', countryCode)
            .order('effective_date', { ascending: false })
            .limit(1)
            .single();
          return data;
        })
      );

      const validDocs = latestDocs.filter(Boolean) as Array<{ id: string; type: string; version: string; content: string }>;

      if (validDocs.length === 0) {
        console.log('No legal documents found');
        return;
      }

      const acceptedVersions = await Promise.all(
        validDocs.map(async (doc) => {
          const { data } = await supabase
            .from('legal_acceptances')
            .select('document_version')
            .eq('user_id', user.id)
            .eq('document_id', doc.id)
            .order('accepted_at', { ascending: false })
            .limit(1)
            .single();
          return data?.document_version;
        })
      );

      const hasOutdatedConsent = validDocs.some((doc, idx) => acceptedVersions[idx] !== doc.version);

      if (hasOutdatedConsent) {
        setDocuments(validDocs);
        const initialConsent = validDocs.reduce((acc, doc) => ({ ...acc, [doc.type]: false }), {});
        setConsent(initialConsent);
        setShowPopup(true);
      }
    } catch (err) {
      console.error('Error checking legal documents:', err);
    }
  };

  const handleAccept = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const acceptances = documents.map((doc) => ({
        user_id: user.id,
        document_id: doc.id,
        document_version: doc.version,
      }));

      await supabase.from('legal_acceptances').insert(acceptances);

      setShowPopup(false);
      toast.success('Consensi salvati con successo');
    } catch (err) {
      console.error('Error saving consent:', err);
      toast.error('Errore nel salvataggio dei consensi');
    } finally {
      setLoading(false);
    }
  };

  if (!showPopup) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold mb-4">Aggiornamento Documenti Legali</h2>
          <p className="text-gray-600 mb-6">
            Abbiamo aggiornato i nostri documenti legali. Per continuare, devi accettare le nuove versioni.
          </p>

          <div className="space-y-4 mb-6">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={consent[doc.type]}
                  onChange={(e) => setConsent({ ...consent, [doc.type]: e.target.checked })}
                  className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm">
                  Ho letto e accetto la nuova versione del{' '}
                  <span className="font-medium">
                    {doc.type === 'privacy_policy' ? 'Informativa sulla Privacy' : 'Termini di Servizio'}
                  </span>{' '}
                  (v{doc.version})
                  <br />
                  <a
                    href={`/${doc.type === 'privacy_policy' ? 'privacy' : 'terms'}`}
                    target="_blank"
                    className="text-blue-600 underline text-xs"
                  >
                    Leggi il documento
                  </a>
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleAccept}
              disabled={loading || !documents.every((doc) => consent[doc.type])}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg"
            >
              {loading ? 'Salvataggio...' : 'Accetta e Continua'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
