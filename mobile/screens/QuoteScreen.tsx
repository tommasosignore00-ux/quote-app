import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, SafeAreaView, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { sendEmail } from '../lib/supabaseFunctions';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { generateQuoteHTML, QuoteData } from '../lib/QuoteTemplate';
import { validateQuote, formatValidationMessage } from '../lib/quoteValidation';
import { injectWatermark, shouldShowWatermark } from '../lib/watermark';
import { exportAsJSON, exportAsXML, exportAsCSV } from '../lib/exportFormats';
import { scheduleFollowUp } from '../lib/followUpReminder';
import { roundForCountry } from '../lib/roundingUtils';
import { useTheme } from '../lib/darkMode';
import { trackTimeSaving } from '../lib/timeSavings';
import SignaturePad from '../components/SignaturePad';

type Lavoro = { id: string; title: string; clienti?: { name?: string; email?: string } };

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
  const [hasCustomTemplate, setHasCustomTemplate] = useState(false);
  const [revision, setRevision] = useState(1);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [showSignature, setShowSignature] = useState(false);
  const [signatureSvg, setSignatureSvg] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [profileData, setProfileData] = useState<any>(null);
  // Helper: verifica se l'utente ha abbonamento attivo
  const isProOrTeam = profileData?.subscription_status === 'active' || profileData?.subscription_status === 'team';
  const isTeam = profileData?.subscription_status === 'team';
  const [dettaglioItems, setDettaglioItems] = useState<any[]>([]);

  useEffect(() => {
    if (!lavoro) navigation.goBack();
  }, [lavoro, navigation]);

  useEffect(() => {
    const loadRev = async () => {
      if (!lavoro) return;
      const { data } = await supabase.from('lavori').select('current_revision').eq('id', lavoro.id).single();
      if (data?.current_revision) setRevision(data.current_revision);
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
        Number(profile?.vat_percent || 22)
      );

      if (!validationResult.valid) {
        Alert.alert('❌ Errore Validazione', formatValidationMessage(validationResult));
        return;
      }

      if (validationResult.warnings.length > 0) {
        const proceed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            '⚠️ Attenzione',
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
      const countryCode = profile?.country_code?.toUpperCase() || 'IT';

      const quoteData: QuoteData = {
        lavoroTitle: lavoroData.title,
        clienteName: (lavoroData.clienti as { name?: string })?.name || '',
        clienteEmail: (lavoroData.clienti as { email?: string })?.email,
        revision: currentRev,
        items: (dettaglio || []).map((d: any) => ({
          description: d.description,
          quantity: Number(d.quantity),
          unit_price: roundForCountry(Number(d.unit_price), countryCode),
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

      // Punto 32: Watermark for trial/free users
      // Solo Pro/Team hanno PDF puliti
      if (shouldShowWatermark(profile?.subscription_status, profile?.trial_ends_at)) {
        html = injectWatermark(html);
      }

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
      await sendEmail(
        recipientEmail,
        `Preventivo - ${lavoro.title}`,
        preview || '<p>Quote</p>'
      );

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('preventivi_versioni').insert({
        lavoro_id: lavoro.id,
        revision,
        html_content: preview,
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
        sent_via_email: true,
        sent_at: new Date().toISOString(),
        recipient_email: recipientEmail,
        signature_svg: signatureSvg,
        signed_at: signatureSvg ? new Date().toISOString() : null,
      });
      await supabase.from('lavori').update({ current_revision: revision + 1 }).eq('id', lavoro.id);
      setRevision(revision + 1);

      // Punto 45: Schedule follow-up reminder
      await scheduleFollowUp({
        lavoroId: lavoro.id,
        lavoroTitle: lavoro.title,
        clientName: lavoro.clienti?.name || '',
        recipientEmail,
      });

      await trackTimeSaving('send_email');
      Alert.alert(t('messages.success'), t('messages.emailSent'));
      setShowEmailModal(false);
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

  if (!lavoro) return null;

  // Punto 46: Export helper
  const handleExport = async (format: 'json' | 'xml' | 'csv') => {
    if (!profileData || !dettaglioItems.length || !lavoro) return;
    const vatPercent = Number(profileData?.vat_percent || 22);
    const items = dettaglioItems.map((d: any) => {
      const qty = Number(d.quantity);
      const price = Number(d.unit_price);
      const markup = Number(d.tax_rate || 0);
      return {
        description: d.description,
        quantity: qty,
        unit_price: price,
        tax_rate: markup,
        total: qty * price * (1 + markup / 100),
      };
    });
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const vatAmount = subtotal * vatPercent / 100;
    const exportData = {
      quoteTitle: lavoro.title,
      clientName: lavoro.clienti?.name || '',
      companyName: profileData?.company_name || '',
      vatNumber: profileData?.vat_number || '',
      date: new Date().toISOString().split('T')[0],
      revision,
      items,
      subtotal,
      vatPercent,
      vatAmount,
      total: subtotal + vatAmount,
      currency: 'EUR',
    };
    try {
      if (format === 'json') await exportAsJSON(exportData);
      else if (format === 'xml') await exportAsXML(exportData);
      else await exportAsCSV(exportData);
      setShowExportMenu(false);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('main.generateQuote')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{lavoro.title}</Text>

      <View style={styles.templateSelector}>
        <Text style={[styles.templateLabel, { color: colors.textSecondary }]}>{t('quote.templateLabel') || 'Modello preventivo:'}</Text>
        <View style={styles.templateOptions}>
          {(['classic', 'minimal', 'professional', ...(hasCustomTemplate ? ['custom' as const] : [])] as const).map((template) => (
            <TouchableOpacity
              key={template}
              style={[styles.templateOption, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }, selectedTemplate === template && styles.templateOptionSelected]}
              onPress={() => {
                if (template === 'custom' && !isProOrTeam) {
                  Alert.alert('Funzione riservata', 'I template personalizzati sono disponibili solo per abbonati Pro o Team.', [
                    { text: 'Scopri i piani', style: 'default' },
                    { text: 'Annulla', style: 'cancel' },
                  ]);
                  return;
                }
                setSelectedTemplate(template);
              }}
              disabled={template === 'custom' && !isProOrTeam}
            >
              <Text style={[styles.templateOptionText, { color: colors.text }, selectedTemplate === template && styles.templateOptionTextSelected]}>
                {template === 'classic' ? (t('quote.classic') || 'Classico')
                  : template === 'minimal' ? (t('quote.minimal') || 'Minimalista')
                  : template === 'professional' ? (t('quote.professional') || 'Professionale')
                  : (t('quote.custom') || 'Personalizzato')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {!isProOrTeam && (
          <Text style={{ color: '#dc2626', fontSize: 13, marginTop: 6 }}>I template personalizzati sono disponibili solo per abbonati Pro/Team</Text>
        )}
      </View>

      {/* Punto 9: Firma Digitale - signature before approval */}
      {/* Firma digitale solo per abbonati */}
      {isProOrTeam && (
        <>
          <TouchableOpacity
            style={[styles.btn, styles.btnSignature, { backgroundColor: colors.primary }]}
            onPress={() => setShowSignature(!showSignature)}
          >
            <Text style={styles.btnText}>
              {signatureSvg ? '✅ Firma acquisita — Modifica' : '✍️ Aggiungi Firma Cliente'}
            </Text>
          </TouchableOpacity>
          {showSignature && (
            <SignaturePad
              onSignatureComplete={(svg) => {
                setSignatureSvg(svg);
                setShowSignature(false);
              }}
              onCancel={() => setShowSignature(false)}
            />
          )}
        </>
      )}
      {!isProOrTeam && (
        <TouchableOpacity style={[styles.btn, styles.btnSignature, { backgroundColor: colors.primary, opacity: 0.5 }]} disabled>
          <Text style={styles.btnText}>✍️ Firma digitale solo per abbonati</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={generatePreview} disabled={loading}>
        <Text style={styles.btnText}>{loading ? t('buttons.loading') : t('buttons.generatePreview')}</Text>
      </TouchableOpacity>

      {approved && preview && (
        <View style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#16a34a', marginBottom: 12, textAlign: 'center' }}>✓ {t('quote.approved') || 'Preventivo approvato'}</Text>
          <TouchableOpacity style={styles.btn} onPress={() => setShowEmailModal(true)}>
            <Text style={styles.btnText}>📧 {t('buttons.sendEmail') || 'Invia via email'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={shareAsFile}>
            <Text style={styles.btnText}>📤 {t('quote.share') || 'Condividi file'}</Text>
          </TouchableOpacity>

          {/* Export multi-formato solo per abbonati */}
          {isProOrTeam ? (
            <TouchableOpacity style={[styles.btn, styles.btnExport]} onPress={() => setShowExportMenu(true)}>
              <Text style={styles.btnText}>📊 Esporta (Excel/JSON/XML)</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btn, styles.btnExport, { opacity: 0.5 }]} disabled>
              <Text style={styles.btnText}>📊 Esporta (solo per abbonati)</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Modal visible={showPreviewModal} animationType="slide">
        <SafeAreaView style={[styles.previewModalContainer, { backgroundColor: colors.background }]}>
          <View style={[styles.previewModalHeader, { backgroundColor: colors.primary }]}>
            <Text style={styles.previewModalTitle}>
              {t('main.generateQuote')} - {lavoro.title}
            </Text>
            <Text style={styles.previewModalSubtitle}>
              {t('messages.reviewAndApprove') || 'Verifica e approva'} • Rev. {String(revision).padStart(2, '0')}
            </Text>
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
              <ActivityIndicator size="large" color="#dc2626" />
            </View>
          )}
          <View style={styles.previewModalFooter}>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => { setShowPreviewModal(false); setPreview(null); }}>
              <Text style={styles.btnText}>{t('buttons.cancel') || 'Annulla'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={async () => {
              setApproved(true);
              setShowPreviewModal(false);
              // Punto 33: Increment quote usage for metered billing
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  const { data: usage } = await supabase.rpc('increment_quote_usage', { p_profile_id: user.id });
                  if (usage && !usage.within_limit) {
                    Alert.alert(
                      '⚠️ Limite raggiunto',
                      `Hai generato ${usage.quotes_generated}/${usage.quotes_limit} preventivi questo mese. I preventivi extra verranno addebitati al costo di €1.50 ciascuno.`,
                      [{ text: 'OK' }]
                    );
                  }
                  // Punto 43: Dispatch webhook for quote_approved
                  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
                  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
                  if (supabaseUrl) {
                    fetch(`${supabaseUrl}/functions/v1/webhook-dispatch`, {
                      method: 'POST',
                      headers: { Authorization: `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        profile_id: user.id,
                        event_type: 'quote_approved',
                        payload: { quoteTitle: lavoro?.title, clientName: lavoro?.clienti?.name, revision },
                      }),
                    }).catch(() => {});
                  }
                }
              } catch { /* metered billing is best-effort */ }
            }} disabled={loading}>
              <Text style={styles.btnText}>✓ {t('buttons.validateApprove') || 'Valida e Approva'}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={showEmailModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('modals.confirmEmail')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              placeholder="email@example.com"
              value={recipientEmail}
              onChangeText={setRecipientEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.btn} onPress={() => setShowEmailModal(false)}>
                <Text style={styles.btnText}>{t('buttons.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btn} onPress={handleSendEmail}>
                <Text style={styles.btnText}>{t('buttons.send')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Punto 46: Export format selection modal */}
      <Modal visible={showExportMenu} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Esporta Preventivo</Text>
            <TouchableOpacity style={[styles.exportOption, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => handleExport('csv')}>
              <Text style={[styles.exportOptionText, { color: colors.text }]}>📊 CSV (Excel)</Text>
              <Text style={[styles.exportOptionDesc, { color: colors.textSecondary }]}>Compatibile con Excel, Fogli Google</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.exportOption, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => handleExport('json')}>
              <Text style={[styles.exportOptionText, { color: colors.text }]}>🔧 JSON</Text>
              <Text style={[styles.exportOptionDesc, { color: colors.textSecondary }]}>Per integrazioni software e API</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.exportOption, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => handleExport('xml')}>
              <Text style={[styles.exportOptionText, { color: colors.text }]}>📄 XML</Text>
              <Text style={[styles.exportOptionDesc, { color: colors.textSecondary }]}>Per commercialisti e software contabilità</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary, { marginTop: 12 }]} onPress={() => setShowExportMenu(false)}>
              <Text style={styles.btnText}>{t('buttons.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#64748b', marginBottom: 20 },
  templateSelector: { marginBottom: 20 },
  templateLabel: { fontSize: 14, fontWeight: '600', marginBottom: 10, color: '#374151' },
  templateOptions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  templateOption: {
    flex: 1, minWidth: 80, backgroundColor: '#e2e8f0', paddingVertical: 10, paddingHorizontal: 8,
    borderRadius: 8, alignItems: 'center', borderWidth: 2, borderColor: '#cbd5e1',
  },
  templateOptionSelected: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  templateOptionText: { fontSize: 12, fontWeight: '600', color: '#1f2937' },
  templateOptionTextSelected: { color: '#fff' },
  btn: { backgroundColor: '#dc2626', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  btnSecondary: { backgroundColor: '#64748b' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  previewModalContainer: { flex: 1, backgroundColor: '#fff' },
  previewModalHeader: { backgroundColor: '#dc2626', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  previewModalTitle: { fontSize: 17, fontWeight: 'bold', color: '#fff', marginBottom: 2 },
  previewModalSubtitle: { fontSize: 12, color: '#fecaca' },
  previewModalFooter: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 16 },
  modalBtns: { flexDirection: 'row', gap: 12 },
  btnSignature: { backgroundColor: '#0f172a' },
  btnExport: { backgroundColor: '#0891b2' },
  exportOption: { backgroundColor: '#f8fafc', padding: 16, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  exportOptionText: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  exportOptionDesc: { fontSize: 13, color: '#64748b' },
});
