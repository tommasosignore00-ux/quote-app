'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Download, FileText, Mail, Send } from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '@/lib/supabase';
import { normalizeCountryCode, resolveVatPercent } from '@/lib/constants';
import { generateQuoteHTML, quoteLineExtras, type QuoteData } from '@/lib/QuoteTemplate';
import { lacksPrice } from '@/lib/mobileWeb';
import { useMobileProfile } from '@/components/m/profile';
import {
  Button,
  Chip,
  Field,
  Notice,
  PageTitle,
  Sheet,
  inputClass,
} from '@/components/m/ui';

const VAT_PRESETS = ['22', '10', '5', '4', '0'];

/** Off-screen copy for the PDF: html2canvas can read it, nothing inside it can run. */
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

export default function MobileQuote() {
  const { id } = useParams<{ id: string }>();
  const profileInfo = useMobileProfile();
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [hasCustom, setHasCustom] = useState(false);
  const [template, setTemplate] = useState<'classic' | 'custom'>('classic');
  const [vat, setVat] = useState('');
  const [vatCustom, setVatCustom] = useState('');
  const [html, setHtml] = useState('');
  const [revision, setRevision] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error' } | null>(
    null
  );
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  /** Lines the client would see at 0 €. */
  const [unpriced, setUnpriced] = useState<string[]>([]);
  /** Sending held until the user confirms the lines at 0 €. */
  const [held, setHeld] = useState<'link' | 'email' | 'pdf' | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('lavori')
        .select('title, vat_percent, current_revision, clienti(name, email)')
        .eq('id', id)
        .single();
      if (!data) return;
      setTitle(data.title);
      const cliente = data.clienti as { name?: string; email?: string } | null;
      setClientName(cliente?.name || '');
      setClientEmail(cliente?.email || '');
      setEmail(cliente?.email || '');
      setRevision(data.current_revision ?? 1);
      if (data.vat_percent !== null && data.vat_percent !== undefined) {
        const rate = String(Number(data.vat_percent));
        if (VAT_PRESETS.includes(rate)) setVat(rate);
        else {
          setVat('custom');
          setVatCustom(rate.replace('.', ','));
        }
      }
      const { data: p } = await supabase
        .from('profiles')
        .select('custom_template_html')
        .eq('id', profileInfo.id)
        .single();
      setHasCustom(Boolean(p?.custom_template_html));
    };
    load();
  }, [id, profileInfo.id]);

  const chosenVat = useCallback((): number | null => {
    if (!vat) return null;
    const value = Number((vat === 'custom' ? vatCustom : vat).replace(',', '.'));
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  }, [vat, vatCustom]);

  const saveVat = async (choice: string, custom: string) => {
    const raw = choice === 'custom' ? custom : choice;
    const value = raw ? Number(raw.replace(',', '.')) : null;
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) return;
    setHtml('');
    await supabase.from('lavori').update({ vat_percent: value }).eq('id', id);
  };

  const preview = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const [{ data: dettaglio }, { data: lavoro }, { data: profile }] =
        await Promise.all([
          supabase
            .from('preventivi_dettaglio')
            .select('*')
            .eq('lavoro_id', id)
            .order('created_at'),
          supabase.from('lavori').select('*, clienti(*)').eq('id', id).single(),
          supabase.from('profiles').select('*').eq('id', profileInfo.id).single(),
        ]);
      if (!lavoro || !profile) throw new Error('Dati del preventivo non disponibili.');
      setUnpriced(
        (dettaglio || [])
          .filter((d) => lacksPrice(d as { unit_price: number; tax_rate: number }))
          .map((d) => String(d.description))
      );
      const c = (lavoro.clienti || {}) as Record<string, string | undefined>;
      const rev = lavoro.current_revision ?? 1;
      setRevision(rev);
      const data: QuoteData = {
        lavoroTitle: lavoro.title,
        clienteName: c.name || '',
        clienteEmail: c.email,
        clienteAddress: c.address,
        clienteCity: c.city,
        clientePostalCode: c.postal_code,
        clienteVat: c.vat_number,
        clienteFiscalCode: c.fiscal_code,
        clientePhone: c.phone,
        revision: rev,
        // unit_price is the purchase price: the client sees it with the markup.
        items: (dettaglio || []).map((d: Record<string, unknown>) => ({
          description: String(d.description),
          quantity: Number(d.quantity),
          unit_price: Number(d.unit_price) * (1 + (Number(d.tax_rate) || 0) / 100),
          ...quoteLineExtras(d as { description?: string }),
        })),
        vat_percent: chosenVat() ?? resolveVatPercent(profile.vat_percent),
        companyName: profile.company_name,
        vatNumber: profile.vat_number,
        fiscalCode: profile.fiscal_code,
        address: profile.address,
        city: profile.city,
        postalCode: profile.postal_code,
        country: profile.country,
        iban: profile.iban,
        swift: profile.swift,
        logoUrl: profile.logo_url,
        brandColor: profile.brand_color,
        countryCode: normalizeCountryCode(profile.country_code),
        templateType: template,
        customTemplateHtml:
          template === 'custom' ? profile.custom_template_html : undefined,
      };
      setHtml(generateQuoteHTML(data));
    } catch (err) {
      setMessage({ text: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  /** Saves this revision; the next one starts from revision + 1. */
  const saveVersion = async (extra: Record<string, unknown>) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('preventivi_versioni')
      .insert({
        lavoro_id: id,
        revision,
        html_content: html,
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
        ...extra,
      })
      .select('id, public_token')
      .single();
    if (error?.code === '42501') {
      throw new Error(
        'Serve un abbonamento attivo per inviare il preventivo. Attivalo dal sito, nella pagina Abbonamento.'
      );
    }
    if (error || !data) throw new Error('Preventivo non salvato. Riprova.');
    return data;
  };

  const nextRevision = async () => {
    await supabase
      .from('lavori')
      .update({ current_revision: revision + 1 })
      .eq('id', id);
    setRevision(revision + 1);
  };

  /** Asks first when some lines are at 0 €; otherwise goes straight on. */
  const unlessUnpriced = (action: 'link' | 'email' | 'pdf', run: () => void) => {
    if (unpriced.length) setHeld(action);
    else run();
  };

  const runHeld = () => {
    const action = held;
    setHeld(null);
    if (action === 'link') shareLink();
    else if (action === 'email') setEmailOpen(true);
    else if (action === 'pdf') downloadPdf();
  };

  const shareLink = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const version = await saveVersion({ sent_at: new Date().toISOString() });
      const link = `${window.location.origin}/q/${version.public_token}`;
      const text = `Buongiorno${clientName ? ` ${clientName}` : ''}, ecco il preventivo per «${title}». Lo può leggere e accettare qui: ${link}`;
      await nextRevision();
      if (navigator.share) {
        await navigator
          .share({ title: `Preventivo ${title}`, text })
          .catch(() => undefined);
      } else {
        window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
      }
      setMessage({
        text: 'Link creato. Quando il cliente risponde lo vedi in Preventivi.',
        tone: 'info',
      });
    } catch (err) {
      setMessage({ text: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const sendEmail = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const version = await saveVersion({ recipient_email: email.trim() });
      const { data: sent, error } = await supabase.functions.invoke('send-email', {
        body: { lavoroId: id, revision },
      });
      if (error || sent?.error) {
        await supabase.from('preventivi_versioni').delete().eq('id', version.id);
        throw new Error('Email non inviata. Riprova o manda il link su WhatsApp.');
      }
      await nextRevision();
      setEmailOpen(false);
      setMessage({ text: `Preventivo inviato a ${email.trim()}.`, tone: 'info' });
    } catch (err) {
      setMessage({ text: (err as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const frame = await renderForCapture(html);
      const body = frame.contentDocument?.body;
      if (body) {
        const canvas = await html2canvas(body, { scale: 2 });
        const pdf = new jsPDF({ format: 'a4' });
        const width = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const height = (canvas.height * width) / canvas.width;
        const image = canvas.toDataURL('image/png');
        // Long quotes continue on the next pages.
        for (let offset = 0; offset < height; offset += pageHeight) {
          if (offset > 0) pdf.addPage();
          pdf.addImage(image, 'PNG', 0, -offset, width, height);
        }
        pdf.save(`Preventivo-${title}-Rev${String(revision).padStart(2, '0')}.pdf`);
      }
      frame.remove();
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="pb-6">
      <PageTitle back={`/m/lavoro/${id}`} backLabel={title || 'Lavoro'}>
        Crea Preventivo
      </PageTitle>
      <div className="px-4 pt-2">
        <div className="mb-6 rounded-[20px] border border-mv-line bg-mv-sheet p-4">
          <p className="line-clamp-2 text-xl font-bold">
            {clientName} · {title}
          </p>
          <p className="text-base font-semibold text-mv-muted">
            Revisione {String(revision).padStart(2, '0')} · IVA esclusa
          </p>
        </div>

        <h2 className="mb-3 text-[22px] font-bold">IVA del preventivo</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          {[
            ['', 'Del profilo'],
            ...VAT_PRESETS.map((rate) => [rate, `${rate}%`]),
            ['custom', 'Altra'],
          ].map(([value, label]) => (
            <Chip
              key={value || 'profile'}
              selected={vat === value}
              onClick={() => {
                setVat(value);
                if (value !== 'custom') saveVat(value, '');
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
        {vat === 'custom' ? (
          <Field label="Aliquota in %">
            <input
              inputMode="decimal"
              value={vatCustom}
              onChange={(e) => setVatCustom(e.target.value)}
              onBlur={() => saveVat('custom', vatCustom)}
              className={inputClass}
            />
          </Field>
        ) : null}
        <p className="mb-5 text-base text-mv-muted">
          Vale per tutte le voci, tranne quelle con un&apos;IVA propria.
        </p>

        {hasCustom ? (
          <>
            <h2 className="mb-3 text-[22px] font-bold">Modello del preventivo</h2>
            <div className="mb-5 flex flex-wrap gap-2">
              {(
                [
                  ['classic', 'Standard'],
                  ['custom', 'Il tuo modello'],
                ] as const
              ).map(([value, label]) => (
                <Chip
                  key={value}
                  selected={template === value}
                  onClick={() => {
                    setTemplate(value);
                    setHtml('');
                  }}
                >
                  {label}
                </Chip>
              ))}
            </div>
          </>
        ) : null}

        {message ? (
          <div className="mb-4">
            <Notice tone={message.tone}>{message.text}</Notice>
          </div>
        ) : null}

        {!html ? (
          <Button big className="w-full" onClick={preview} disabled={busy}>
            <FileText className="h-6 w-6" />
            {busy ? 'Preparo…' : 'Prepara il preventivo'}
          </Button>
        ) : (
          <>
            <div className="mb-4 overflow-hidden rounded-2xl border-2 border-mv-line bg-white">
              <iframe
                title="Anteprima del preventivo"
                sandbox=""
                srcDoc={html}
                className="h-[70dvh] w-full"
              />
            </div>
            {unpriced.length ? (
              <div className="mb-4">
                <Notice tone="error">
                  {unpriced.length === 1
                    ? 'Questa voce è a 0 €: '
                    : `Queste ${unpriced.length} voci sono a 0 €: `}
                  <strong>{unpriced.join(', ')}</strong>.{' '}
                  <Link href={`/m/lavoro/${id}`} className="font-bold underline">
                    Torna al lavoro e metti il prezzo
                  </Link>
                  .
                </Notice>
              </div>
            ) : null}
            <div className="grid gap-3">
              <Button
                big
                onClick={() => unlessUnpriced('link', shareLink)}
                disabled={busy}
              >
                <Send className="h-6 w-6" /> Manda il link al cliente
              </Button>
              <Button
                big
                variant="secondary"
                onClick={() => unlessUnpriced('email', () => setEmailOpen(true))}
                disabled={busy}
              >
                <Mail className="h-6 w-6" /> Invia per email
              </Button>
              <Button
                big
                variant="secondary"
                onClick={() => unlessUnpriced('pdf', downloadPdf)}
                disabled={busy}
              >
                <Download className="h-6 w-6" /> Scarica PDF
              </Button>
            </div>
            <p className="mt-3 text-base text-mv-muted">
              Con il link il cliente legge il preventivo e lo accetta dal telefono.
            </p>
          </>
        )}
      </div>

      <Sheet
        open={held !== null}
        onClose={() => setHeld(null)}
        title="Ci sono voci a 0 €"
      >
        <p className="mb-2 text-lg">
          Il cliente vedrà {unpriced.length === 1 ? 'questa voce' : 'queste voci'} a 0 €:
        </p>
        <ul className="mb-5 list-disc pl-6 text-lg font-semibold">
          {unpriced.map((description, index) => (
            <li key={`${description}-${index}`}>{description}</li>
          ))}
        </ul>
        <div className="grid gap-3">
          <Link
            href={`/m/lavoro/${id}`}
            className="flex min-h-[64px] w-full items-center justify-center rounded-xl bg-primary text-xl font-bold text-white"
          >
            Metti i prezzi
          </Link>
          <Button big variant="secondary" onClick={runHeld}>
            {held === 'pdf' ? 'Scarica lo stesso' : 'Manda lo stesso'}
          </Button>
        </div>
      </Sheet>

      <Sheet open={emailOpen} onClose={() => setEmailOpen(false)} title="Invia per email">
        <Field label="Email del cliente">
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={clientEmail || 'nome@esempio.it'}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Button big variant="secondary" onClick={() => setEmailOpen(false)}>
            Annulla
          </Button>
          <Button big onClick={sendEmail} disabled={busy || !email.trim()}>
            {busy ? 'Invio…' : 'Invia'}
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
