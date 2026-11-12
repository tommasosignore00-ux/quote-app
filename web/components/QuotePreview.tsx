'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { normalizeCountryCode, resolveVatPercent } from '@/lib/constants';
import { generateQuoteHTML, QuoteData, quoteLineExtras } from '@/lib/QuoteTemplate';
import toast from 'react-hot-toast';
import { analytics } from '@/lib/analytics';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

type Lavoro = {
  id: string;
  title: string;
  cliente_id: string;
  clienti?: { name: string; email?: string };
};

type QuotePreviewProps = {
  lavoroId: string;
  lavoro: Lavoro;
};

/**
 * Off-screen copy for the PDF. allow-same-origin lets html2canvas read the document;
 * without allow-scripts nothing inside it can run.
 */
function renderForCapture(html: string): Promise<HTMLIFrameElement> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.style.cssText =
      'position:fixed;left:-10000px;top:0;width:800px;height:1200px;border:0';
    frame.onload = () => resolve(frame);
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/** Common Italian VAT rates; any other value can be typed. */
const VAT_PRESETS = ['22', '10', '5', '4', '0'];

export default function QuotePreview({ lavoroId, lavoro }: QuotePreviewProps) {
  const { t } = useTranslation();
  const [showPreview, setShowPreview] = useState(false);
  const [approved, setApproved] = useState(false);
  const [htmlContent, setHtmlContent] = useState('');
  const [revision, setRevision] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<
    'classic' | 'minimal' | 'professional' | 'custom'
  >('classic');
  const [hasCustomTemplate, setHasCustomTemplate] = useState(false);
  /** VAT chosen for this job's quote; '' = the profile's rate. */
  const [vatChoice, setVatChoice] = useState('');
  const [customVat, setCustomVat] = useState('');

  useEffect(() => {
    const loadRevision = async () => {
      const { data } = await supabase
        .from('lavori')
        .select('current_revision, vat_percent')
        .eq('id', lavoroId)
        .single();
      if (data?.current_revision) setRevision(data.current_revision);
      if (data?.vat_percent !== null && data?.vat_percent !== undefined) {
        const rate = String(Number(data.vat_percent));
        if (VAT_PRESETS.includes(rate)) setVatChoice(rate);
        else {
          setVatChoice('custom');
          setCustomVat(rate);
        }
      }
    };
    loadRevision();
  }, [lavoroId]);

  useEffect(() => {
    const checkCustomTemplate = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('custom_template_html')
        .eq('id', user.id)
        .single();
      setHasCustomTemplate(!!profile?.custom_template_html);
    };
    checkCustomTemplate();
  }, []);

  /** The VAT rate chosen for this quote, or null for the profile's. */
  const chosenVat = (): number | null => {
    if (!vatChoice) return null;
    const value = Number(
      (vatChoice === 'custom' ? customVat : vatChoice).replace(',', '.')
    );
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  };

  /** Saved on the job, so the next revision keeps the same rate. */
  const saveVat = async (choice: string, custom: string) => {
    const raw = choice === 'custom' ? custom : choice;
    const value = raw ? Number(raw.replace(',', '.')) : null;
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) return;
    const { error } = await supabase
      .from('lavori')
      .update({ vat_percent: value })
      .eq('id', lavoroId);
    if (error) toast.error('Aliquota IVA non salvata');
  };

  const generatePreview = async () => {
    setLoading(true);
    try {
      const { data: dettaglio, error: dettaglioErr } = await supabase
        .from('preventivi_dettaglio')
        .select('*')
        .eq('lavoro_id', lavoroId);
      if (dettaglioErr) throw dettaglioErr;

      const { data: lavoroData, error: lavoroErr } = await supabase
        .from('lavori')
        .select('*, clienti(*)')
        .eq('id', lavoroId)
        .single();
      if (lavoroErr) throw lavoroErr;

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', lavoroData.profile_id)
        .single();
      if (profileErr) throw profileErr;

      const { data: revData } = await supabase
        .from('lavori')
        .select('current_revision')
        .eq('id', lavoroId)
        .single();
      const currentRev = revData?.current_revision ?? 1;
      setRevision(currentRev);

      const quoteData: QuoteData = {
        lavoroTitle: lavoroData.title,
        clienteName: (lavoroData.clienti as { name?: string })?.name || '',
        clienteEmail: (lavoroData.clienti as { email?: string })?.email,
        clienteAddress: (lavoroData.clienti as { address?: string })?.address,
        clienteCity: (lavoroData.clienti as { city?: string })?.city,
        clientePostalCode: (lavoroData.clienti as { postal_code?: string })?.postal_code,
        clienteVat: (lavoroData.clienti as { vat_number?: string })?.vat_number,
        clienteFiscalCode: (lavoroData.clienti as { fiscal_code?: string })?.fiscal_code,
        clientePhone: (lavoroData.clienti as { phone?: string })?.phone,
        revision: currentRev,
        items: (dettaglio || []).map((d: any) => ({
          description: d.description,
          quantity: Number(d.quantity),
          // unit_price is the purchase price; the client sees it with the markup.
          unit_price: Number(d.unit_price) * (1 + (Number(d.tax_rate) || 0) / 100),
          ...quoteLineExtras(d),
        })),
        vat_percent: chosenVat() ?? resolveVatPercent(profile?.vat_percent),
        companyName: profile?.company_name,
        vatNumber: profile?.vat_number,
        fiscalCode: profile?.fiscal_code,
        address: profile?.address,
        city: profile?.city,
        postalCode: profile?.postal_code,
        country: profile?.country,
        iban: profile?.iban,
        swift: profile?.swift,
        logoUrl: profile?.logo_url,
        brandColor: profile?.brand_color,
        countryCode: normalizeCountryCode(profile?.country_code),
        templateType: selectedTemplate,
        customTemplateHtml:
          selectedTemplate === 'custom' ? profile?.custom_template_html : undefined,
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
    if (!approved) {
      toast.error(t('quote.approveBefore'));
      return;
    }
    const rev = String(revision).padStart(2, '0');

    if (asPdf) {
      const frame = await renderForCapture(htmlContent);
      const el = frame.contentDocument?.body;
      if (el) {
        const canvas = await html2canvas(el, { scale: 2 });
        const pdf = new jsPDF({ format: 'a4' });
        const imgData = canvas.toDataURL('image/png');
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = (canvas.height * pdfW) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfW, Math.min(pdfH, 297));
        pdf.save(`Preventivo-${lavoro.title}-Rev${rev}.pdf`);
      }
      frame.remove();
    } else {
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Preventivo-${lavoro.title}-Rev${rev}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from('preventivi_versioni').insert({
      lavoro_id: lavoroId,
      revision,
      html_content: htmlContent,
      approved_at: new Date().toISOString(),
      approved_by: user?.id,
    });
    await supabase
      .from('lavori')
      .update({ current_revision: revision + 1 })
      .eq('id', lavoroId);
    setRevision(revision + 1);
    toast.success('Preventivo salvato nella cronologia');
  };

  const handleSendEmail = async () => {
    if (!approved || !recipientEmail) {
      toast.error('Approva e inserisci email destinatario');
      return;
    }
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // Saved first: its secret link goes in the email. Marked as sent only after sending.
      const { data: version, error: saveError } = await supabase
        .from('preventivi_versioni')
        .insert({
          lavoro_id: lavoroId,
          revision,
          html_content: htmlContent,
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
          recipient_email: recipientEmail,
        })
        .select('id, public_token')
        .single();
      if (saveError) throw saveError;

      const { data: sent, error: sendError } = await supabase.functions.invoke(
        'send-email',
        {
          body: { lavoroId, revision },
        }
      );
      if (sendError || sent?.error) {
        await supabase.from('preventivi_versioni').delete().eq('id', version.id);
        // On a non-2xx answer supabase-js keeps the function's body in error.context.
        let reason: string | undefined = sent?.error;
        const context = (sendError as { context?: Response } | null)?.context;
        if (!reason && context && typeof context.json === 'function') {
          reason = await context
            .json()
            .then((body: { error?: string }) => body?.error)
            .catch(() => undefined);
        }
        throw new Error(
          reason ? `Invio email non riuscito: ${reason}` : 'Invio email non riuscito'
        );
      }

      await supabase
        .from('lavori')
        .update({ current_revision: revision + 1 })
        .eq('id', lavoroId);
      setRevision(revision + 1);
      analytics.trackQuoteCreated(selectedTemplate);
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
        onChange={(e) =>
          setSelectedTemplate(
            e.target.value as 'classic' | 'minimal' | 'professional' | 'custom'
          )
        }
        className="px-3 py-2 border rounded-lg text-sm"
      >
        <option value="classic">Template: Classico</option>
        <option value="minimal">Template: Minimalista</option>
        <option value="professional">Template: Professionale</option>
        {hasCustomTemplate && <option value="custom">Template: Personalizzato</option>}
      </select>
      <label className="flex items-center gap-2 text-sm">
        <span>IVA</span>
        <select
          value={vatChoice}
          onChange={(e) => {
            setVatChoice(e.target.value);
            if (e.target.value !== 'custom') saveVat(e.target.value, '');
          }}
          className="px-3 py-2 border rounded-lg text-sm"
          aria-label="Aliquota IVA del preventivo"
        >
          <option value="">Del profilo</option>
          {VAT_PRESETS.map((rate) => (
            <option key={rate} value={rate}>
              {rate}%
            </option>
          ))}
          <option value="custom">Altra…</option>
        </select>
        {vatChoice === 'custom' ? (
          <input
            inputMode="decimal"
            value={customVat}
            onChange={(e) => setCustomVat(e.target.value)}
            onBlur={() => saveVat('custom', customVat)}
            placeholder="%"
            aria-label="Aliquota IVA personalizzata"
            className="w-16 px-2 py-2 border rounded-lg text-sm"
          />
        ) : null}
      </label>
      <button onClick={generatePreview} disabled={loading} className="btn-primary">
        {loading ? '...' : t('main.generateQuote')}
      </button>

      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between">
              <span>
                {t('quote.preview')} {String(revision).padStart(2, '0')}
              </span>
              <button
                onClick={() => setShowPreview(false)}
                className="text-slate-500 hover:text-black"
              >
                ✕
              </button>
            </div>
            <iframe
              title={t('quote.preview')}
              sandbox=""
              srcDoc={htmlContent}
              className="flex-1 w-full border-0"
              style={{ minHeight: '60vh' }}
            />
            <div className="p-4 border-t flex gap-2 flex-wrap">
              {!approved ? (
                <button onClick={handleApprove} className="btn-primary">
                  {t('quote.validateApprove')}
                </button>
              ) : (
                <>
                  <button onClick={() => handleDownload(true)} className="btn-primary">
                    {t('quote.downloadPdf')}
                  </button>
                  <button onClick={() => handleDownload(false)} className="btn-primary">
                    {t('quote.downloadHtml')}
                  </button>
                  <button
                    onClick={() => {
                      setShowEmailModal(true);
                      setRecipientEmail(
                        (lavoro.clienti as { email?: string })?.email || ''
                      );
                    }}
                    className="btn-primary"
                  >
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
            <p className="text-xs text-slate-500 mb-4">
              Oggetto: Preventivo - {lavoro.title} (Rev.{' '}
              {String(revision).padStart(2, '0')})
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowEmailModal(false)}
                className="flex-1 py-2 border rounded-lg"
              >
                {t('quote.cancel')}
              </button>
              <button onClick={handleSendEmail} className="flex-1 btn-primary">
                {t('quote.send')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
