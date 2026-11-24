import { trackEvent } from '../lib/analytics';
import { enableDecisionPush, firstTime } from '../lib/nudges';
import { loadEntitlement } from '../lib/entitlement';
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Alert, SafeAreaView, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomActionBar,
  Chip,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusPill,
  TertiaryButton,
  TextField,
  cantiere,
  formatMoney,
  radius,
  space,
  ufficio,
} from '../components/ui';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { normalizeCountryCode, resolveVatPercent } from '../lib/market';
import { sendQuoteEmail, getFunctionHeaders } from '../lib/supabaseFunctions';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { WebView } from 'react-native-webview';
import { generateQuoteHTML, QuoteData, quoteLineExtras } from '../lib/QuoteTemplate';
import { validateQuote, formatValidationMessage } from '../lib/quoteValidation';
import { roundForCountry } from '../lib/roundingUtils';
import { useTheme } from '../lib/darkMode';
import { trackTimeSaving } from '../lib/timeSavings';

/** Common Italian VAT rates; any other value can be typed. */
const VAT_PRESETS = ['22', '10', '5', '4', '0'];
import SignaturePad from '../components/SignaturePad';

type Lavoro = { id: string; title: string; clienti?: { name?: string; email?: string } };

// Button added to the email only: the document itself stays the plain quote.
export default function QuoteScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const route = useRoute();
  const { colors } = useTheme();
  const lavoro = (route.params as { lavoro?: Lavoro })?.lavoro;
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [approved, setApproved] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<'classic' | 'minimal' | 'professional' | 'custom'>('classic');
  /** VAT chosen for this job's quote; '' = the profile's rate. Saved on the job. */
  const [vatChoice, setVatChoice] = useState('');
  const [customVat, setCustomVat] = useState('');
  const [hasCustomTemplate, setHasCustomTemplate] = useState(false);
  const [revision, setRevision] = useState(1);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [showSignature, setShowSignature] = useState(false);
  const [signatureSvg, setSignatureSvg] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  // Helper: verifica se l'utente ha abbonamento attivo
  const [isProOrTeam, setIsProOrTeam] = useState(false);
  useEffect(() => {
    if (profileData) loadEntitlement(profileData.subscription_status).then(setIsProOrTeam);
  }, [profileData]);
  const isTeam = profileData?.subscription_status === 'team';
  const [dettaglioItems, setDettaglioItems] = useState<any[]>([]);
  /** Lines and total for the summary card (view only, same formula as the lines). */
  const [summary, setSummary] = useState<{ count: number; total: number } | null>(null);
  useEffect(() => {
    if (!lavoro) return;
    supabase
      .from('preventivi_dettaglio')
      .select('quantity, unit_price, tax_rate')
      .eq('lavoro_id', lavoro.id)
      .then(({ data }: { data: any[] | null }) => {
        const rows = (data || []) as any[];
        const total = rows.reduce((sum, d) => sum + Number(d.quantity) * Number(d.unit_price) * (1 + (Number(d.tax_rate) || 0) / 100), 0);
        setSummary({ count: rows.length, total });
      });
  }, [lavoro?.id]);

  useEffect(() => {
    if (!lavoro) navigation.goBack();
  }, [lavoro, navigation]);

  useEffect(() => {
    const loadRev = async () => {
      if (!lavoro) return;
      const { data } = await supabase.from('lavori').select('current_revision, vat_percent').eq('id', lavoro.id).single();
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
    loadRev();
  }, [lavoro?.id]);

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
    if (!lavoro) return;
    setLoading(true);
    try {
      const { data: dettaglio, error: dettaglioErr } = await supabase.from('preventivi_dettaglio').select('*').eq('lavoro_id', lavoro.id);
      if (dettaglioErr) throw dettaglioErr;

      if (!dettaglio || dettaglio.length === 0) {
        Alert.alert(t('messages.error'), 'Aggiungi almeno una voce di costo per generare il preventivo');
        return;
      }

      setDettaglioItems(dettaglio);

      const { data: lavoroData, error: lavoroErr } = await supabase.from('lavori').select('*, clienti(*)').eq('id', lavoro.id).single();
      if (lavoroErr) throw lavoroErr;
      // The client's saved address is ready in the send dialog; it can still be changed.
      const savedEmail = (lavoroData.clienti as { email?: string } | null)?.email?.trim();
      if (savedEmail) setRecipientEmail((current) => current || savedEmail);
      
      const { data: profile, error: profileErr } = await supabase.from('profiles').select('*').eq('id', lavoroData.profile_id).single();
      if (profileErr) throw profileErr;
      setProfileData(profile);
      
      const { data: revData } = await supabase.from('lavori').select('current_revision').eq('id', lavoro.id).single();
      const currentRev = revData?.current_revision ?? 1;
      setRevision(currentRev);

      // Punto 20: Validazione AI - check items before generating
      const validationResult = validateQuote(
        (dettaglio || []).map((d: any) => ({
          description: d.description,
          quantity: Number(d.quantity),
          unit_price: Number(d.unit_price),
          tax_rate: Number(d.tax_rate || 0),
        })),
        chosenVat() ?? resolveVatPercent(profile?.vat_percent)
      );

      if (!validationResult.valid) {
        Alert.alert('Da correggere prima di preparare', formatValidationMessage(validationResult));
        return;
      }

      if (validationResult.warnings.length > 0) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Da controllare',
            formatValidationMessage(validationResult) + '\n\nVuoi continuare comunque?',
            [
              { text: 'Annulla', onPress: () => resolve(false), style: 'cancel' },
              { text: 'Continua', onPress: () => resolve(true) },
            ]
          );
        });
        if (!proceed) return;
      }

      // Punto 30: Arrotondamento Intelligente
      const countryCode = normalizeCountryCode(profile?.country_code);

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
          unit_price: roundForCountry(Number(d.unit_price), countryCode),
          // tax_rate is the line's own markup; 0 means the price is already final.
          material_markup: Number(d.tax_rate) || 0,
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
        countryCode,
        templateType: selectedTemplate,
        customTemplateHtml: selectedTemplate === 'custom' ? profile?.custom_template_html : undefined,
        // Punto 22: Client country for reverse charge
        clientCountryCode: (lavoroData.clienti as any)?.country_code || undefined,
        // Punto 23: Client language for PDF labels
        language: (lavoroData.clienti as any)?.preferred_language || undefined,
        // Punto 24: Currency override from lavoro
        currency: lavoroData.original_currency || undefined,
      };

      let html = generateQuoteHTML(quoteData);


      // Punto 9: If signature exists, inject it SOLO se abbonato
      if (signatureSvg && isProOrTeam) {
        const sigHtml = `<div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:16px"><p style="font-size:12px;color:#64748b;margin-bottom:8px">Firma del cliente / Client signature:</p>${signatureSvg}</div>`;
        html = html.replace('</body>', `${sigHtml}</body>`);
      }

      setPreview(html);
      setApproved(false);
      setShowPreviewModal(true);
      await trackTimeSaving('generate_quote');
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmail = async () => {
    if (!approved || !recipientEmail || !lavoro) return;
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Saved first: its secret link goes in the email. Marked as sent only after sending.
      const { data: version, error: saveError } = await supabase
        .from('preventivi_versioni')
        .insert({
          lavoro_id: lavoro.id,
          revision,
          html_content: preview,
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
          recipient_email: recipientEmail,
          signature_svg: signatureSvg,
          signed_at: signatureSvg ? new Date().toISOString() : null,
        })
        .select('id, public_token')
        .single();
      if (saveError) throw saveError;

      try {
        await sendQuoteEmail(lavoro.id, revision);
      } catch (sendError) {
        await supabase.from('preventivi_versioni').delete().eq('id', version.id);
        throw sendError;
      }

      await supabase.from('lavori').update({ current_revision: revision + 1 }).eq('id', lavoro.id);
      setRevision(revision + 1);

      await trackTimeSaving('send_email');
      trackEvent('quote_sent');
      Alert.alert(t('messages.success'), t('messages.emailSent'));
      setShowEmailModal(false);
      if (user && await firstTime('decision-push-offer')) {
        Alert.alert(
          'Vuoi sapere quando il cliente risponde?',
          'Ti mandiamo un avviso quando accetta o rifiuta il preventivo.',
          [
            { text: 'Non ora', style: 'cancel' },
            { text: 'Sì, avvisami', onPress: () => { enableDecisionPush(user.id).catch(() => {}); } },
          ]
        );
      }
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const shareAsFile = async () => {
    if (!preview || !lavoro) return;
    try {
      const filename = `preventivo_${lavoro.title.replace(/\s+/g, '_')}_rev${revision}.html`;
      const path = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(path, preview, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/html', dialogTitle: `Preventivo - ${lavoro.title}` });
      } else {
        Alert.alert(t('messages.error'), 'Condivisione non disponibile su questo dispositivo');
      }
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const shareAsPdf = async () => {
    if (!preview || !lavoro) return;
    try {
      const { uri } = await Print.printToFileAsync({
        html: preview,
        base64: false,
      });

      const filename = `preventivo_${lavoro.title.replace(/\s+/g, '_')}_rev${revision}.pdf`;
      const newPath = FileSystem.cacheDirectory + filename;
      await FileSystem.copyAsync({ from: uri, to: newPath });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(newPath, { mimeType: 'application/pdf', dialogTitle: `Preventivo - ${lavoro.title}` });
      } else {
        Alert.alert(t('messages.error'), 'Condivisione non disponibile su questo dispositivo');
      }
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const chosenVat = (): number | null => {
    if (!vatChoice) return null;
    const value = Number((vatChoice === 'custom' ? customVat : vatChoice).replace(',', '.'));
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
  };

  const saveVat = async (choice: string, custom: string) => {
    if (!lavoro) return;
    const raw = choice === 'custom' ? custom : choice;
    const value = raw ? Number(raw.replace(',', '.')) : null;
    if (value !== null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      Alert.alert('Aliquota non valida', 'Scrivi un numero da 0 a 100.');
      return;
    }
    const { error } = await supabase.from('lavori').update({ vat_percent: value }).eq('id', lavoro.id);
    if (error) Alert.alert(t('messages.error'), 'Aliquota IVA non salvata');
  };

  if (!lavoro) return null;

  const templates = (['classic', 'minimal', 'professional', 'custom'] as const).filter((tpl) => tpl !== 'custom' || hasCustomTemplate);
  const templateInfo: Record<(typeof templates)[number], { name: string; desc: string }> = {
    classic: { name: 'Classico', desc: 'Intestazione in alto, righe con bordi' },
    minimal: { name: 'Minimalista', desc: 'Poche linee, molto bianco' },
    professional: { name: 'Professionale', desc: 'Intestazione scura, totali in evidenza' },
    custom: { name: 'Personalizzato', desc: 'Il tuo modello caricato' },
  };
  const vatOptions: [string, string][] = [['', 'Del profilo'], ...VAT_PRESETS.map((rate) => [rate, `${rate}%`] as [string, string]), ['custom', 'Altra']];
  const clientName = lavoro.clienti?.name || '';
  const revLabel = `Rev. ${String(revision).padStart(2, '0')}`;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {approved && preview ? <StatusPill kind="accepted" label={`Approvato · ${revLabel}`} icon="checkmark-circle-outline" /> : null}
          <View style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={[cantiere.titleSm, { color: colors.text }]} numberOfLines={2}>
                {[clientName, lavoro.title].filter(Boolean).join(' · ')}
              </Text>
              {summary ? (
                <Text style={[cantiere.meta, { color: colors.textSecondary }]}>{summary.count === 1 ? '1 voce' : `${summary.count} voci`} · IVA esclusa</Text>
              ) : null}
            </View>
            {summary ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[cantiere.meta, { color: colors.textSecondary }]}>Totale</Text>
                <Text style={[cantiere.price, { color: colors.text }]}>{formatMoney(summary.total)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <SectionHeader title="Modello del preventivo" />
        <View style={{ gap: space.s3 }}>
          {templates.map((template) => {
            const selected = selectedTemplate === template;
            const locked = template === 'custom' && !isProOrTeam;
            return (
              <Pressable
                key={template}
                onPress={() => !locked && setSelectedTemplate(template)}
                disabled={locked}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: locked }}
                accessibilityLabel={`${templateInfo[template].name}. ${locked ? "Disponibile con l'abbonamento" : templateInfo[template].desc}`}
                style={({ pressed }) => [
                  styles.templateRow,
                  {
                    backgroundColor: selected ? colors.mark : pressed ? colors.surfaceSecondary : colors.surface,
                    borderColor: selected ? colors.primary : colors.border,
                    borderWidth: selected ? 2 : 1,
                    opacity: locked ? 0.45 : 1,
                  },
                ]}
              >
                <TemplateThumb kind={template} />
                <View style={{ flex: 1 }}>
                  <Text style={[ufficio.row, { color: colors.text }]}>{templateInfo[template].name}</Text>
                  <Text style={[cantiere.meta, { color: colors.textSecondary }]}>
                    {locked ? "Disponibile con l'abbonamento" : templateInfo[template].desc}
                  </Text>
                </View>
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={28} color={selected ? colors.primaryText : colors.textSecondary} />
              </Pressable>
            );
          })}
        </View>

        <SectionHeader title="IVA del preventivo" />
        <View style={styles.chips}>
          {vatOptions.map(([value, label]) => (
            <Chip
              key={value || 'profile'}
              label={label}
              selected={vatChoice === value}
              minHeight={56}
              onPress={() => {
                setVatChoice(value);
                if (value !== 'custom') saveVat(value, '');
              }}
              accessibilityLabel={value === 'custom' ? 'Altra aliquota IVA' : value ? `IVA ${label}` : 'IVA del profilo'}
            />
          ))}
        </View>
        {vatChoice === 'custom' ? (
          <TextField
            label="Aliquota IVA personalizzata (%)"
            value={customVat}
            onChangeText={setCustomVat}
            onEndEditing={() => saveVat('custom', customVat)}
            keyboardType="decimal-pad"
            placeholder="Es. 8"
            containerStyle={{ marginTop: space.s3 }}
          />
        ) : null}

        {/* Firma digitale solo per abbonati */}
        {isProOrTeam && (
          <View style={{ marginTop: space.s5, gap: space.s3 }}>
            {signatureSvg ? (
              <>
                <StatusPill kind="accepted" label="Firma presa" icon="pencil-outline" />
                <TertiaryButton label="Rifai la firma" icon="pencil-outline" onPress={() => setShowSignature(!showSignature)} />
              </>
            ) : (
              <SecondaryButton label="Aggiungi la firma del cliente" icon="pencil-outline" onPress={() => setShowSignature(!showSignature)} />
            )}
            {showSignature && (
              <SignaturePad
                onSignatureComplete={(svg) => {
                  setSignatureSvg(svg);
                  setShowSignature(false);
                }}
                onCancel={() => setShowSignature(false)}
              />
            )}
          </View>
        )}
      </ScrollView>

      <BottomActionBar>
        {approved && preview ? (
          <>
            <SecondaryButton label="Condividi PDF" icon="share-outline" onPress={shareAsPdf} />
            <PrimaryButton label={t('buttons.sendEmail') || 'Invia per email'} icon="mail-outline" onPress={() => setShowEmailModal(true)} />
          </>
        ) : (
          <PrimaryButton label="Prepara il preventivo" icon="document-text-outline" onPress={generatePreview} loading={loading} loadingLabel="Preparo…" />
        )}
      </BottomActionBar>

      <Modal visible={showPreviewModal} animationType="slide" onRequestClose={() => { setShowPreviewModal(false); setPreview(null); }}>
        <SafeAreaView style={[styles.previewModalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.previewModalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Text style={[cantiere.titleSm, { color: colors.text }]} numberOfLines={1}>{lavoro.title}</Text>
            <Text style={[cantiere.meta, { color: colors.textSecondary }]}>Controlla e approva · {revLabel}</Text>
          </View>
          {preview ? (
            <WebView
              originWhitelist={['*']}
              source={{ html: preview }}
              style={{ flex: 1 }}
              scalesPageToFit={true}
              javaScriptEnabled={false}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          )}
          <View style={[styles.previewModalFooter, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            <SecondaryButton label={t('buttons.cancel') || 'Annulla'} style={{ flex: 1 }} onPress={() => { setShowPreviewModal(false); setPreview(null); }} />
            <PrimaryButton label="Valida e approva" icon="checkmark" style={{ flex: 1 }} disabled={loading} onPress={async () => {
              setApproved(true);
              setShowPreviewModal(false);
              // Quote usage is counted by the database when the revision is sent.
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  // Punto 43: Dispatch webhook for quote_approved
                  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
                  if (supabaseUrl) {
                    fetch(`${supabaseUrl}/functions/v1/webhook-dispatch`, {
                      method: 'POST',
                      headers: await getFunctionHeaders({ 'Content-Type': 'application/json' }),
                      body: JSON.stringify({
                        profile_id: user.id,
                        event_type: 'quote_approved',
                        payload: { quoteTitle: lavoro?.title, clientName: lavoro?.clienti?.name, revision },
                      }),
                    }).catch(() => {});
                  }
                }
              } catch { /* the webhook is best-effort */ }
            }} />
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={showEmailModal} transparent animationType="fade" onRequestClose={() => setShowEmailModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[cantiere.title, styles.modalTitle, { color: colors.text }]}>{t('modals.confirmEmail')}</Text>
            <TextField
              label="Email del cliente"
              scale="cantiere"
              placeholder="Es. mario.rossi@email.it"
              value={recipientEmail}
              onChangeText={setRecipientEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.modalBtns}>
              <SecondaryButton label={t('buttons.cancel')} style={{ flex: 1 }} onPress={() => setShowEmailModal(false)} />
              <PrimaryButton label={t('buttons.send')} style={{ flex: 1 }} onPress={handleSendEmail} loading={loading} loadingLabel="Invio…" disabled={!recipientEmail.trim()} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

/** Small drawn sheet: a header bar and four grey lines, laid out per template. */
function TemplateThumb({ kind }: { kind: 'classic' | 'minimal' | 'professional' | 'custom' }) {
  const { colors } = useTheme();
  const line = (width: string, key: number, bordered = false) => (
    <View
      key={key}
      style={{
        height: 4,
        width: width as any,
        backgroundColor: colors.border,
        borderRadius: 2,
        marginTop: 5,
        ...(bordered ? { borderWidth: 1, borderColor: colors.textTertiary, height: 6 } : null),
      }}
    />
  );
  return (
    <View style={[styles.thumb, { backgroundColor: colors.surface, borderColor: colors.inputBorder }]}>
      {kind === 'custom' ? (
        <Ionicons name="document-attach-outline" size={28} color={colors.textSecondary} />
      ) : (
        <>
          <View
            style={{
              height: kind === 'professional' ? 14 : kind === 'minimal' ? 3 : 8,
              backgroundColor: kind === 'minimal' ? colors.textTertiary : colors.text,
              borderRadius: 2,
            }}
          />
          {[0, 1, 2, 3].map((i) => line(kind === 'minimal' ? '70%' : '100%', i, kind === 'classic'))}
          {kind === 'professional' ? <View style={{ height: 6, width: '50%', alignSelf: 'flex-end', backgroundColor: colors.text, borderRadius: 2, marginTop: 6 }} /> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: space.s4, paddingBottom: space.s5 },
  summary: { borderWidth: 1, borderRadius: radius.control, padding: space.s4, gap: space.s3 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.s3 },
  templateRow: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: space.s3, borderRadius: radius.control, paddingHorizontal: space.s4, paddingVertical: space.s2 },
  thumb: { width: 56, height: 72, borderRadius: radius.control, borderWidth: 1, padding: 6, justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: space.s2, flexWrap: 'wrap' },
  previewModalContainer: { flex: 1 },
  previewModalHeader: { paddingHorizontal: space.s4, paddingVertical: space.s3, borderBottomWidth: 1 },
  previewModalFooter: { flexDirection: 'row', gap: space.s3, padding: space.s4, borderTopWidth: 1 },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: space.s4 },
  modal: { borderRadius: radius.sheet, padding: space.s5 },
  modalTitle: { marginBottom: space.s4 },
  modalBtns: { flexDirection: 'row', gap: space.s3 },
});
