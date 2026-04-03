'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { generateQuoteHTML, QuoteData } from '@/lib/QuoteTemplate';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

type Lavoro = { id: string; title: string; cliente_id: string; clienti?: { name: string; email?: string } };

type QuotePreviewProps = {
  lavoroId: string;
  lavoro: Lavoro;
};

export default function QuotePreview({ lavoroId, lavoro }: QuotePreviewProps) {
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const [approved, setApproved] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [revision, setRevision] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<'classic' | 'minimal' | 'professional' | 'custom'>('classic');
  const [hasCustomTemplate, setHasCustomTemplate] = useState(false);

  useEffect(() => {
    const loadRevision = async () => {
      const { data } = await supabase.from('lavori').select('current_revision').eq('id', lavoroId).single();
      if (data?.current_revision) setRevision(data.current_revision);
    };
    loadRevision();
  }, [lavoroId]);

  useEffect(() => {
    const checkCustomTemplate = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('custom_template_html').eq('id', user.id).single();
      setHasCustomTemplate(!!(profile?.custom_template_html));
    };
    checkCustomTemplate();
  }, []);

  const generatePreview = async () => {
    setLoading(true);
    try {
      const { data: dettaglio, error: dettaglioErr } = await supabase.from('preventivi_dettaglio').select('*').eq('lavoro_id', lavoroId);
      if (dettaglioErr) throw dettaglioErr;
      
      const { data: lavoroData, error: lavoroErr } = await supabase.from('lavori').select('*, clienti(*)').eq('id', lavoroId).single();
      if (lavoroErr) throw lavoroErr;
      
      const { data: profile, error: profileErr } = await supabase.from('profiles').select('*').eq('id', lavoroData.profile_id).single();
      if (profileErr) throw profileErr;
      
      const { data: revData } = await supabase.from('lavori').select('current_revision').eq('id', lavoroId).single();
      const currentRev = revData?.current_revision ?? 1;
      setRevision(currentRev);

      const quoteData: QuoteData = {
        lavoroTitle: lavoroData.title,
        clienteName: (lavoroData.clienti as { name?: string })?.name || '',
        clienteEmail: (lavoroData.clienti as { email?: string })?.email,
        revision: currentRev,
        items: (dettaglio || []).map((d: any) => ({
          description: d.description,
          quantity: Number(d.quantity),
          unit_price: Number(d.unit_price),
          material_markup: Number(d.tax_rate || profile?.material_markup || 0),
        })),
        vat_percent: Number(profile?.vat_percent || 22),
        companyName: profile?.company_name,
        vatNumber: profile?.vat_number,
        fiscalCode: profile?.fiscal_code,
        address: profile?.address,
        city: profile?.city,
        postalCode: profile?.postal_code,
        country: profile?.country,
        iban: profile?.iban,
        swift: profile?.swift,
        countryCode: profile?.country_code?.toUpperCase(),
        templateType: selectedTemplate,
        customTemplateHtml: selectedTemplate === 'custom' ? profile?.custom_template_html : undefined,
      };

      const html = generateQuoteHTML(quoteData);
      setHtmlContent(html);
      setShowPreview(true);
      setApproved(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = () => {
    setApproved(true);
    toast.success(t('quote.approved'));
  };

  const handleDownload = async (asPdf = false) => {
    if (!approved) { toast.error(t('quote.approveBefore')); return; }
    const rev = String(revision).padStart(2, '0');

    if (asPdf) {
      const el = document.getElementById('quote-preview-content');
      if (el) {
        const canvas = await html2canvas(el, { scale: 2 });
        const pdf = new jsPDF({ format: 'a4' });
        const imgData = canvas.toDataURL('image/png');
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = (canvas.height * pdfW) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, Math.min(pdfH, 297));
        pdf.save(`Preventivo-${lavoro.title}-Rev${rev}.pdf`);
      }
    } else {
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Preventivo-${lavoro.title}-Rev${rev}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('preventivi_versioni').insert({
      lavoro_id: lavoroId,
      revision,
      html_content: htmlContent,
      approved_at: new Date().toISOString(),
      approved_by: user?.id,
    });
    await supabase.from('lavori').update({ current_revision: revision + 1 }).eq('id', lavoroId);
    setRevision(revision + 1);
    toast.success('Preventivo salvato nella cronologia');
  };

  const handleSendEmail = async () => {
    if (!approved || !recipientEmail) { toast.error('Approva e inserisci email destinatario'); return; }
    try {
      const res = await fetch('/api/quote/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail,
          subject: `Preventivo - ${lavoro.title}`,
          html: htmlContent,
          lavoroId,
          revision,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('preventivi_versioni').insert({
        lavoro_id: lavoroId,
        revision,
        html_content: htmlContent,
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
        sent_via_email: true,
        sent_at: new Date().toISOString(),
        recipient_email: recipientEmail,
      });
      await supabase.from('lavori').update({ current_revision: revision + 1 }).eq('id', lavoroId);
      setRevision(revision + 1);
      toast.success(t('quote.emailSent'));
      setShowEmailModal(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex gap-2 items-center">
      <select 
        value={selectedTemplate} 
        onChange={(e) => setSelectedTemplate(e.target.value as 'classic' | 'minimal' | 'professional' | 'custom')}
        className="px-3 py-2 border rounded-lg text-sm"
      >
        <option value="classic">Template: Classico</option>
        <option value="minimal">Template: Minimalista</option>
        <option value="professional">Template: Professionale</option>
        {hasCustomTemplate && <option value="custom">Template: Personalizzato</option>}
      </select>
      <button onClick={generatePreview} disabled={loading} className="btn-primary">
        {loading ? '...' : t('main.generateQuote')}
      </button>

      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between">
              <span>{t('quote.preview')} {String(revision).padStart(2, '0')}</span>
              <button onClick={() => setShowPreview(false)} className="text-slate-500 hover:text-black">✕</button>
            </div>
            <div id="quote-preview-content" className="flex-1 overflow-auto p-4" dangerouslySetInnerHTML={{ __html: htmlContent }} />
            <div className="p-4 border-t flex gap-2 flex-wrap">
              {!approved ? (
                <button onClick={handleApprove} className="btn-primary">{t('quote.validateApprove')}</button>
              ) : (
                <>
                  <button onClick={() => handleDownload(true)} className="btn-primary">{t('quote.downloadPdf')}</button>
                  <button onClick={() => handleDownload(false)} className="btn-primary">{t('quote.downloadHtml')}</button>
                  <button onClick={() => { setShowEmailModal(true); setRecipientEmail((lavoro.clienti as { email?: string })?.email || ''); }} className="btn-primary">
                    {t('quote.sendEmail')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="font-bold mb-4">{t('quote.confirmEmail')}</h3>
            <p className="text-sm text-slate-600 mb-2">{t('quote.recipient')}</p>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-4"
              placeholder="email@example.com"
            />
            <p className="text-xs text-slate-500 mb-4">Subject: Preventivo - {lavoro.title} (Rev. {String(revision).padStart(2, '0')})</p>
            <div className="flex gap-2">
              <button onClick={() => setShowEmailModal(false)} className="flex-1 py-2 border rounded-lg">{t('quote.cancel')}</button>
              <button onClick={handleSendEmail} className="flex-1 btn-primary">{t('quote.send')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
