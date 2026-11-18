import { buildWebApiUrl, getWebApiAuthHeaders, isWebApiConfigured } from '../lib/webApi';
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Switch, StyleSheet, ScrollView, FlatList, Image, KeyboardAvoidingView, Platform } from 'react-native';
import { triggerHaptic } from '../lib/haptics';
import {
  ActionSheet,
  BottomActionBar,
  BottomTabBar,
  Chip,
  DangerButton,
  ListGroup,
  ListRow,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  TextField,
} from '../components/ui';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { DEFAULT_COUNTRY_CODE, DEFAULT_LANGUAGE } from '../lib/market';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import TwoFactorSettings from '../components/TwoFactorSettings';
import { getAnalyticsConsent, setAnalyticsConsent } from '../lib/analytics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { validateIBAN, formatIBAN } from '../lib/ibanValidation';
import { getFiscalConfig, FiscalField, US_STATE_TAX_RATES } from '../lib/fiscalSwitch';
import { getTimeSavingsStats } from '../lib/timeSavings';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles, ThemeColors } from '../lib/darkMode';
import { clearOfflineRecordings } from '../lib/offlineRecording';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors, mode, setMode, isDark } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [convertingTemplate, setConvertingTemplate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ibanError, setIbanError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [timeSavedStats, setTimeSavedStats] = useState<string>('');
  const [fiscalConfig, setFiscalConfig] = useState(getFiscalConfig('IT'));

  // Punto 25: US state picker
  const [usState, setUsState] = useState<string>('');
  const [showUsStatePicker, setShowUsStatePicker] = useState(false);

  // Punto 14: Command mappings review
  const [commandMappings, setCommandMappings] = useState<any[]>([]);
  const [showMappingsSection, setShowMappingsSection] = useState(false);

  // Punto 35: Referral
  const [referralStats, setReferralStats] = useState({ total: 0, converted: 0 });

  // Punto 41: Team management
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [teamInvitations, setTeamInvitations] = useState<any[]>([]);
  const [analyticsConsent, setAnalyticsConsentState] = useState(false);
  useEffect(() => { getAnalyticsConsent().then(setAnalyticsConsentState); }, []);
  const [showTeamSection, setShowTeamSection] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('technician');

  // Punto 43: Webhooks
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['quote_approved']);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setProfile(data);
        setFiscalConfig(getFiscalConfig(DEFAULT_COUNTRY_CODE));
        if (data.us_state) setUsState(data.us_state);
      }

      // Punto 14: Load command mappings
      const { data: mappings } = await supabase
        .from('user_command_mappings')
        .select('*')
        .eq('profile_id', user.id)
        .order('usage_count', { ascending: false })
        .limit(50);
      if (mappings) setCommandMappings(mappings);

      // Punto 35: Load referral stats
      const { data: referrals } = await supabase
        .from('affiliate_referrals')
        .select('status')
        .eq('referrer_id', user.id);
      if (referrals) {
        setReferralStats({
          total: referrals.length,
          converted: referrals.filter((r: { status?: string }) => r.status === 'converted').length,
        });
      }

      // Punto 41: Load team members
      await loadTeam();

      // Punto 43: Load webhooks
      const { data: hooks } = await supabase
        .from('webhook_endpoints')
        .select('*')
        .eq('profile_id', user.id);
      if (hooks) setWebhooks(hooks);

      setLoading(false);
    };
    load();
    // Punto 44: Load time savings for display
    getTimeSavingsStats().then((stats) => {
      if (stats.totalActions > 0) {
        setTimeSavedStats(
          `${stats.totalActions} operazioni registrate`
        );
      }
    });
  }, []);

  const handleSave = async () => {
    // Punto 26: Validazione IBAN Internazionale
    if (profile.iban) {
      const ibanResult = validateIBAN(profile.iban);
      if (!ibanResult.valid) {
        setIbanError(ibanResult.error || 'IBAN non valido: controlla le cifre');
        setSaveError('IBAN non valido: controlla le cifre nel campo IBAN.');
        return;
      }
      setIbanError(null);
    }

    setSaving(true);
    setSaveError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('messages.notAuthenticated'));
      const { data: stored } = await supabase.from('profiles').select('custom_template_html').eq('id', user.id).single();
      if ((stored?.custom_template_html ?? null) !== (profile.custom_template_html ?? null)) {
        const templateRes = await fetch(buildWebApiUrl('/api/templates/save'), {
          method: 'POST',
          headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ template: profile.custom_template_html ?? null }),
        });
        if (!templateRes.ok) throw new Error('Salvataggio del modello non riuscito');
      }
      const { error: updateError } = await supabase.from('profiles').update({
        company_name: profile.company_name,
        vat_number: profile.vat_number,
        vat_percent: profile.vat_percent ?? 22,
        material_markup: profile.material_markup_vat_percent || 0,
        material_markup_vat_percent: profile.material_markup_vat_percent || 0,
        fiscal_code: profile.fiscal_code,
        // App disponibile solo in Italia
        country_code: DEFAULT_COUNTRY_CODE,
        language: DEFAULT_LANGUAGE,
        address: profile.address,
        city: profile.city,
        postal_code: profile.postal_code,
        iban: profile.iban,
        swift_bic: profile.swift_bic,
        logo_url: profile.logo_url?.trim() || null,
        brand_color: /^#[0-9a-fA-F]{6}$/.test(profile.brand_color || '') ? profile.brand_color : '#1f2937',
        us_state: usState || null,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
      if (updateError) throw new Error('Modifiche non salvate. Controlla la connessione e riprova.');
      // The button itself says "Salvato" for 2 seconds: no alert to close.
      setSaved(true);
      triggerHaptic('aiSuccess');
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadTemplate = () => {
    Alert.alert(
      'Solo dati di prova',
      'Il file viene elaborato da OpenAI. Usa un preventivo di prova, senza nomi, indirizzi o contatti di clienti reali.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Carica un preventivo senza dati reali', onPress: pickTemplate },
      ]
    );
  };

  const pickTemplate = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/html',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/msword',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const name = (asset.name || '').toLowerCase();

      // HTML already prepared with the app's placeholders: use it as it is.
      if (name.endsWith('.html') || name.endsWith('.htm')) {
        const content = await FileSystem.readAsStringAsync(asset.uri);
        const hasItems = /\{\{#items\}\}[\s\S]*\{\{\/items\}\}|\{\{\s*(items|itemsTable)\s*\}\}/.test(content);
        if (hasItems && /\{\{\s*total\s*\}\}/.test(content)) {
          let ready = content;
          if (isWebApiConfigured()) {
            // Cleaned up and logos hosted, so mail apps like Gmail show them.
            const res = await fetch(buildWebApiUrl('/api/templates/prepare'), {
              method: 'POST',
              headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ template: content, noRealData: true }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(payload?.error || 'Caricamento non riuscito');
            ready = payload.template;
          }
          setProfile({ ...profile, custom_template_html: ready });
          Alert.alert(t('messages.success'), 'Modello caricato. Ricorda di salvare le modifiche.');
          return;
        }
      }

      if (!isWebApiConfigured()) {
        Alert.alert(t('messages.error'), 'Per convertire un file Word serve il collegamento al sito (EXPO_PUBLIC_WEB_URL).');
        return;
      }

      // Word or plain HTML: the AI turns the company's quote into a template.
      setConvertingTemplate(true);
      const response = await FileSystem.uploadAsync(buildWebApiUrl('/api/templates/convert'), asset.uri, {
        fieldName: 'file',
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        headers: await getWebApiAuthHeaders(),
        mimeType: asset.mimeType || undefined,
        parameters: { noRealData: 'true' },
      });
      let payload: { template?: string; notes?: string; missing?: string[]; warnings?: string[]; error?: string; clientNameLeft?: boolean } = {};
      try {
        payload = JSON.parse(response.body || '{}');
      } catch {
        payload = { error: 'Risposta non valida dal server' };
      }
      if (response.status < 200 || response.status >= 300 || !payload.template) {
        throw new Error(payload.error || 'Conversione non riuscita');
      }
      if (payload.clientNameLeft) {
        throw new Error('Nel modello è rimasto il nome del cliente originale. Riprova con un preventivo senza dati reali.');
      }

      setProfile({ ...profile, custom_template_html: payload.template });
      const warnings = payload.warnings?.length ? `\n\n${payload.warnings.join('\n')}` : '';
      const missing = payload.missing?.length
        ? `\n\nAttenzione, non ho trovato dove mettere: ${payload.missing.join(', ')}.`
        : '';
      Alert.alert(
        'Modello pronto',
        `${payload.notes || 'Ho preparato il modello dal tuo preventivo.'}${missing}${warnings}\n\nRicorda di salvare le modifiche. Puoi vedere l'anteprima e correggerla dal sito, nella pagina Profilo.`
      );
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setConvertingTemplate(false);
    }
  };

  const handleRemoveTemplate = () => {
    Alert.alert(
      'Rimuovere il modello?',
      'Il preventivo torna al modello standard quando salvi le modifiche.',
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Rimuovi', style: 'destructive', onPress: () => setProfile({ ...profile, custom_template_html: null }) }
      ]
    );
  };

  // Punto 27: GDPR Export data
  const handleExportMyData = async () => {
    const path = FileSystem.cacheDirectory + 'my_data_export.json';
    try {
      const download = await FileSystem.downloadAsync(buildWebApiUrl('/api/account/export'), path, {
        headers: await getWebApiAuthHeaders(),
      });
      if (download.status !== 200) throw new Error('Esportazione non riuscita. Riprova tra poco.');
      await Sharing.shareAsync(path);
    } catch (err) {
      Alert.alert('Errore', (err as Error).message);
    } finally {
      // The file holds all the account's data: it must not stay in the cache.
      await FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    }
  };

  // Punto 27: GDPR Delete account (confirmed in the action sheet).
  const handleDeleteAccount = async () => {
    try {
      const response = await fetch(buildWebApiUrl('/api/account/delete'), {
        method: 'POST',
        headers: await getWebApiAuthHeaders(),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'Non è stato possibile eliminare l\'account.');
      }
      await clearOfflineRecordings();
      await supabase.auth.signOut();
      (navigation as any).reset({ index: 0, routes: [{ name: 'Auth' }] });
      return true;
    } catch (err) {
      Alert.alert('Errore', (err as Error).message);
      return false;
    }
  };

  /** One sheet for every deletion on this screen. */
  const [pendingDelete, setPendingDelete] = useState<{
    title: string;
    label: string;
    confirmTitle: string;
    confirmMessage: string;
    confirmLabel?: string;
    onConfirm: () => Promise<boolean | void>;
  } | null>(null);
  const askDelete = (value: NonNullable<typeof pendingDelete>) => setPendingDelete(value);

  // Punto 14: Delete a command mapping
  const handleDeleteMapping = async (id: string) => {
    await supabase.from('user_command_mappings').delete().eq('id', id);
    setCommandMappings(prev => prev.filter(m => m.id !== id));
  };

  // Punto 41: Team constants
  // Users included in Team besides the owner (5 in all). Extra users are added from the website:
  // the app sells nothing.
  const TEAM_MEMBERS_INCLUDED = 4;

  const handleLogoUpload = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return;
    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const res = await fetch(buildWebApiUrl('/api/profile/logo'), {
        method: 'POST',
        headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ base64 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Caricamento non riuscito');
      setProfile({ ...profile, logo_url: body.url });
    } catch (err) {
      Alert.alert('Errore', (err as Error).message);
    }
  };

  const loadTeam = async () => {
    if (!isWebApiConfigured()) return;
    const res = await fetch(buildWebApiUrl('/api/team'), { headers: await getWebApiAuthHeaders() });
    if (!res.ok) return;
    const team = await res.json();
    setTeamMembers(team.members);
    setTeamInvitations(team.invitations);
  };

  const sendInvite = async () => {
    try {
      const res = await fetch(buildWebApiUrl('/api/team'), {
        method: 'POST',
        headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Invito non riuscito');
      setInviteEmail('');
      Alert.alert('Invito', body.message);
      await loadTeam();
    } catch (err) {
      Alert.alert('Errore', (err as Error).message);
    }
  };

  // Punto 41: Invite team member
  const handleInviteMember = () => {
    if (!inviteEmail.trim()) return;
    if (teamMembers.length < TEAM_MEMBERS_INCLUDED) {
      sendInvite();
      return;
    }
    Alert.alert('Utenti inclusi esauriti', `Il piano Team include ${TEAM_MEMBERS_INCLUDED + 1} utenti, tu compreso, e sono già tutti in uso.`);
  };

  // Punto 41: Remove team member
  const handleRemoveTeamMember = async (id: string) => {
    const res = await fetch(buildWebApiUrl(`/api/team?id=${encodeURIComponent(id)}`), {
      method: 'DELETE',
      headers: await getWebApiAuthHeaders(),
    });
    if (res.ok) await loadTeam();
    else Alert.alert('Errore', 'Operazione non riuscita');
  };

  const handleRespondInvitation = async (id: string, accept: boolean) => {
    const res = await fetch(buildWebApiUrl('/api/team/respond'), {
      method: 'POST',
      headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id, accept }),
    });
    if (res.ok) await loadTeam();
    else Alert.alert('Errore', 'Operazione non riuscita');
  };

  // Punto 43: Add webhook
  const handleAddWebhook = async () => {
    if (!newWebhookUrl.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: created, error } = await supabase.from('webhook_endpoints').insert({
        profile_id: user.id,
        url: newWebhookUrl,
        events: newWebhookEvents,
        active: true,
      }).select('*');
      if (error) throw error;
      if (created?.[0]) setWebhooks(prev => [...prev, created[0]]);
      setNewWebhookUrl('');
      setShowWebhookModal(false);
    } catch (err) {
      Alert.alert('Errore', (err as Error).message);
    }
  };

  // Punto 43: Delete webhook
  const handleDeleteWebhook = async (id: string) => {
    await supabase.from('webhook_endpoints').delete().eq('id', id);
    setWebhooks(prev => prev.filter(w => w.id !== id));
  };

  if (loading) return <View style={[styles.container, { backgroundColor: colors.background }]}><Text style={{ color: colors.text, fontSize: 18, padding: 16 }}>{t('messages.loading')}</Text></View>;

  const themeOptions = [
    { key: 'system' as const, label: 'Automatico', icon: 'contrast-outline' as const },
    { key: 'light' as const, label: 'Chiaro', icon: 'sunny-outline' as const },
    { key: 'dark' as const, label: 'Scuro', icon: 'moon-outline' as const },
  ];

  const field = (key: string, label: string, extra?: Record<string, any>) => (
    <TextField label={label} value={profile[key] ?? ''} onChangeText={(v) => setProfile({ ...profile, [key]: v })} {...extra} />
  );
  const currentColor = String(profile.brand_color || '').toLowerCase();
  const customColor = currentColor && !BRAND_SWATCHES.some((sw) => sw.value === currentColor);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <SectionHeader title="La tua azienda" first />
      {field('company_name', t('profile.company'), { placeholder: 'Es. Carpenteria Rossi s.r.l.' })}
      {field('vat_number', t('profile.vatNumber'), { autoCapitalize: 'characters' })}
      {field('fiscal_code', t('profile.fiscalCode'), { autoCapitalize: 'characters' })}
      <Text style={styles.label}>{t('profile.country')}</Text>
      <View style={[styles.input, styles.inputReadonly]} accessibilityLabel={`${t('profile.country')}: Italia`}>
        <Text style={styles.inputText}>Italia</Text>
      </View>
      <Text style={styles.help}>Per ora il servizio è solo in Italia.</Text>
      {field('address', t('messages.address'))}
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 2 }}>{field('city', t('messages.city'))}</View>
        <View style={{ flex: 1 }}>{field('postal_code', t('messages.postalCode'), { keyboardType: 'number-pad' })}</View>
      </View>

      <SectionHeader title="Sul preventivo" />
      <Text style={styles.label}>Logo</Text>
      <View style={styles.logoRow}>
        <View style={[styles.logoThumb, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
          {profile.logo_url ? (
            <Image source={{ uri: profile.logo_url }} style={styles.logoImage} resizeMode="contain" accessibilityLabel="Il tuo logo" />
          ) : (
            <Ionicons name="image-outline" size={28} color={colors.textSecondary} />
          )}
        </View>
        <SecondaryButton
          label={profile.logo_url ? 'Sostituisci il logo' : 'Carica il logo'}
          icon="image-outline"
          scale="ufficio"
          onPress={handleLogoUpload}
          style={{ flex: 1 }}
        />
      </View>

      <Text style={[styles.label, { marginTop: 16 }]}>Colore sui preventivi</Text>
      <View style={styles.swatches} accessibilityRole="radiogroup">
        {BRAND_SWATCHES.map((sw) => {
          const selected = currentColor === sw.value;
          return (
            <Pressable
              key={sw.value}
              onPress={() => setProfile({ ...profile, brand_color: sw.value })}
              accessibilityRole="radio"
              accessibilityState={{ selected, checked: selected }}
              accessibilityLabel={`Colore ${sw.name}`}
              style={styles.swatchItem}
            >
              <View style={[styles.swatchRing, { borderColor: selected ? colors.text : 'transparent' }]}>
                <View style={[styles.swatch, { backgroundColor: sw.value }]}>
                  {selected ? <Ionicons name="checkmark" size={24} color={colors.onPrimary} /> : null}
                </View>
              </View>
              <Text style={styles.swatchName} numberOfLines={1}>{sw.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {customColor ? <Text style={styles.help}>Oggi usi un colore tuo: resta finché non ne scegli uno qui.</Text> : null}

      <Text style={[styles.label, { marginTop: 8 }]}>Il tuo modello di preventivo</Text>
      <View style={styles.sectionBox}>
        {profile.custom_template_html ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.templateInfo}>Modello caricato ({(profile.custom_template_html.length / 1024).toFixed(1).replace('.', ',')} KB)</Text>
            </View>
            <View style={styles.templateButtons}>
              <SecondaryButton label="Sostituisci" scale="ufficio" onPress={handleUploadTemplate} loading={convertingTemplate} loadingLabel="Leggo…" style={{ flex: 1 }} />
              <DangerButton label="Rimuovi" onPress={handleRemoveTemplate} style={{ flex: 1 }} accessibilityLabel="Rimuovi il modello di preventivo" />
            </View>
          </View>
        ) : (
          <SecondaryButton
            label={convertingTemplate ? 'Leggo il preventivo…' : 'Carica il tuo preventivo (Word o HTML)'}
            icon="document-text-outline"
            scale="ufficio"
            onPress={handleUploadTemplate}
            loading={convertingTemplate}
          />
        )}
        <Text style={[styles.help, { marginTop: 8, marginBottom: 0 }]}>Carica il preventivo che usi già, anche uno vecchio compilato: l'app lo trasforma nel tuo modello, con cliente, voci e totali al posto giusto.</Text>
      </View>

      <SectionHeader title="Pagamenti" />
      <TextField
        label={t('profile.iban')}
        value={profile.iban || ''}
        error={ibanError}
        autoCapitalize="characters"
        onChangeText={(v) => { setProfile({ ...profile, iban: v.toUpperCase().replace(/\s/g, '') }); setIbanError(null); }}
        onBlur={() => { if (profile.iban) { const r = validateIBAN(profile.iban); if (!r.valid) setIbanError(r.error || 'IBAN non valido: controlla le cifre'); else { setIbanError(null); setProfile({ ...profile, iban: formatIBAN(profile.iban) }); } } }}
      />
      {field('swift_bic', t('profile.swiftBic'), { autoCapitalize: 'characters' })}

      <SectionHeader title="Prezzi" />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <TextField keyboardType="numeric" label={t('profile.vatPercent')} value={String(profile.vat_percent ?? 22)} onChangeText={(v) => setProfile({ ...profile, vat_percent: parseFloat(v.replace(',', '.') || '22') })} />
        </View>
        <View style={{ flex: 1 }}>
          <TextField keyboardType="numeric" label={t('profile.materialMarkupVAT')} value={String(profile.material_markup_vat_percent || 0)} onChangeText={(v) => setProfile({ ...profile, material_markup_vat_percent: parseFloat(v.replace(',', '.') || '0') })} />
        </View>
      </View>

      {/* Punto 21: Dynamic Fiscal Fields */}
      {fiscalConfig.fields.length > 0 && (
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Campi fiscali</Text>
          {fiscalConfig.fields.map((f: FiscalField) => (
            <TextField key={f.key} label={`${f.label}${f.required ? ' (obbligatorio)' : ''}`} placeholder={f.placeholder} value={profile[f.key] || ''} onChangeText={(v) => setProfile({ ...profile, [f.key]: v })} />
          ))}
          {fiscalConfig.reverseChargeApplicable && (
            <Text style={styles.help}>Reverse charge disponibile per operazioni intra-UE</Text>
          )}
          {fiscalConfig.electronicInvoicingRequired && fiscalConfig.electronicInvoicingSystem && (
            <Text style={styles.help}>Fatturazione elettronica: {fiscalConfig.electronicInvoicingSystem}</Text>
          )}
        </View>
      )}

      {/* Punto 25: US State Picker (only shown for US country) */}
      {DEFAULT_COUNTRY_CODE !== 'IT' && (profile.country_code || '').toUpperCase() === 'US' && (
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>US Sales Tax State</Text>
          <Pressable style={styles.input} onPress={() => setShowUsStatePicker(!showUsStatePicker)} accessibilityRole="button">
            <Text style={styles.inputText}>{usState ? `${usState} (${US_STATE_TAX_RATES[usState] || 0}%)` : 'Seleziona stato'}</Text>
          </Pressable>
          {showUsStatePicker && (
            <View style={{ maxHeight: 200 }}>
              <FlatList
                data={Object.entries(US_STATE_TAX_RATES).map(([code, rate]) => ({ code, rate }))}
                keyExtractor={item => item.code}
                renderItem={({ item }) => (
                  <Pressable onPress={() => { setUsState(item.code); setShowUsStatePicker(false); }} style={[styles.langItem, usState === item.code && styles.langItemSelected]} accessibilityState={{ selected: usState === item.code }}>
                    <Text style={[styles.bodyText, usState === item.code ? styles.langItemSelectedText : undefined]}>{item.code} — {item.rate}%</Text>
                  </Pressable>
                )}
              />
            </View>
          )}
        </View>
      )}

      <SectionHeader title="Dettatura" />
      <ListGroup>
        <ListRow
          first
          scale="ufficio"
          icon="chatbubble-ellipses-outline"
          title="Scorciatoie a voce"
          subtitle={commandMappings.length === 1 ? '1 scorciatoia' : `${commandMappings.length} scorciatoie`}
          onPress={() => setShowMappingsSection(!showMappingsSection)}
          hideChevron
          value={<Ionicons name={showMappingsSection ? 'chevron-up' : 'chevron-down'} size={24} color={colors.textSecondary} />}
          accessibilityHint={showMappingsSection ? 'Chiude l\'elenco' : 'Apre l\'elenco'}
        />
        {showMappingsSection ? (
          <Text style={[styles.bodyText, { paddingHorizontal: 16, paddingVertical: 12 }]}>
            Una scorciatoia collega una frase tua a un articolo preciso: quando detti esattamente quella frase, l’articolo viene aggiunto subito, senza scegliere. Le scorciatoie si creano dal sito, nella pagina Profilo.
          </Text>
        ) : null}
        {showMappingsSection && commandMappings.map(m => (
          <ListRow
            key={m.id}
            scale="ufficio"
            title={`«${m.input_text}» → ${m.mapped_text}`}
            subtitle={Number(m.usage_count) === 1 ? 'Usata 1 volta' : `Usata ${Number(m.usage_count) || 0} volte`}
            onPress={() => askDelete({
              title: `«${m.input_text}»`,
              label: 'Elimina questa scorciatoia',
              confirmTitle: `Eliminare «${m.input_text}»?`,
              confirmMessage: 'Quando detterai questa frase, l\'articolo verrà cercato nel listino come le altre voci.',
              confirmLabel: 'Sì, elimina',
              onConfirm: async () => { await handleDeleteMapping(m.id); },
            })}
            accessibilityHint="Apre le azioni della scorciatoia"
          />
        ))}
      </ListGroup>

      {/* Punto 41: Team Management - solo per abbonamento team */}
      {teamInvitations.map(invitation => (
        <View key={invitation.id} style={[styles.sectionBox, { marginTop: 16, marginBottom: 12 }]}>
          <Text style={[styles.bodyText, { marginBottom: 10 }]}>
            {invitation.owner?.company_name || 'Un titolare'} ti ha invitato nel team
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <SecondaryButton label="Rifiuta" onPress={() => handleRespondInvitation(invitation.id, false)} style={{ flex: 1 }} />
            <PrimaryButton label="Accetta" onPress={() => handleRespondInvitation(invitation.id, true)} style={{ flex: 1 }} />
          </View>
        </View>
      ))}

      {profile.team_plan === true && <>
        <SectionHeader title="Squadra" />
        <ListGroup>
          <ListRow
            first
            scale="ufficio"
            icon="people-outline"
            title={`${teamMembers.length} su ${TEAM_MEMBERS_INCLUDED} inclusi oltre a te`}
            subtitle={teamMembers.length > TEAM_MEMBERS_INCLUDED ? `${teamMembers.length - TEAM_MEMBERS_INCLUDED} in più` : null}
            onPress={() => setShowTeamSection(!showTeamSection)}
            hideChevron
            value={<Ionicons name={showTeamSection ? 'chevron-up' : 'chevron-down'} size={24} color={colors.textSecondary} />}
          />
          {showTeamSection && teamMembers.map(m => (
            <ListRow
              key={m.id}
              scale="ufficio"
              title={m.member?.email || 'N/A'}
              subtitle={`${m.role}${!m.accepted_at ? ' · in attesa di accettazione' : ''}`}
              onPress={() => askDelete({
                title: m.member?.email || 'Membro',
                label: 'Togli dalla squadra',
                confirmTitle: `Togliere ${m.member?.email || 'il membro'} dalla squadra?`,
                confirmMessage: 'Non vedrà più i tuoi lavori e listini. Puoi invitarlo di nuovo quando vuoi.',
                confirmLabel: 'Sì, togli',
                onConfirm: async () => { await handleRemoveTeamMember(m.id); },
              })}
            />
          ))}
        </ListGroup>
        {showTeamSection && (
          <View style={[styles.sectionBox, { marginTop: 12 }]}>
            <TextField label="Invita un membro (email)" placeholder="Es. marco@email.it" value={inviteEmail} onChangeText={setInviteEmail} keyboardType="email-address" autoCapitalize="none" />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {['admin', 'technician', 'readonly'].map(role => (
                <Chip key={role} label={role} selected={inviteRole === role} onPress={() => setInviteRole(role)} minHeight={48} style={{ flex: 1 }} />
              ))}
            </View>
            <SecondaryButton label="Invita" icon="person-add-outline" scale="ufficio" onPress={handleInviteMember} />
          </View>
        )}
      </>}

      <SectionHeader title="Aspetto" />
      <View style={{ flexDirection: 'row', gap: 8 }} accessibilityRole="radiogroup">
        {themeOptions.map((opt) => {
          const active = mode === opt.key;
          return (
            <Pressable
              key={opt.key}
              onPress={() => setMode(opt.key)}
              style={[styles.segment, active ? styles.segmentActive : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, checked: active }}
              accessibilityLabel={`Aspetto: ${opt.label}`}
            >
              <Ionicons name={opt.icon} size={20} color={active ? colors.surface : colors.text} />
              <Text style={[styles.segmentText, active ? { color: colors.surface, fontWeight: '700' } : null]} maxFontSizeMultiplier={1.3}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionHeader title="Account" />
      <ListGroup>
        <ListRow first scale="ufficio" icon="id-card-outline" title={t('navigation.subscription') || 'Abbonamento'} onPress={() => (navigation as any).navigate('Subscription')} />
        <ListRow scale="ufficio" icon="download-outline" title="Esporta i miei dati" onPress={handleExportMyData} hideChevron />
      </ListGroup>
      <View style={{ marginTop: 12 }}>
        <TwoFactorSettings />
      </View>
      <View style={styles.switchRow}>
        <Text style={{ color: colors.text, fontSize: 18, flex: 1, paddingRight: 12 }}>Condividi statistiche anonime di utilizzo</Text>
        <Switch
          value={analyticsConsent}
          onValueChange={(value) => { setAnalyticsConsentState(value); setAnalyticsConsent(value); }}
          accessibilityLabel="Condividi statistiche anonime di utilizzo"
        />
      </View>

      {/* Punto 27: GDPR delete, last and apart. */}
      <View style={[styles.dangerZone, { borderTopColor: colors.border }]}>
        <SectionHeader title="Eliminare l'account" first />
        <Text style={[styles.bodyText, { color: colors.textSecondary, marginBottom: 16 }]}>
          Cancella azienda, clienti, lavori e preventivi. Non si può annullare.
        </Text>
        <DangerButton
          label="Elimina l'account"
          onPress={() => askDelete({
            title: "Eliminare l'account?",
            label: "Elimina l'account",
            confirmTitle: "Eliminare l'account?",
            confirmMessage: 'Tutti i tuoi dati verranno cancellati per sempre: azienda, clienti, lavori e preventivi. Non si può annullare.',
            confirmLabel: 'Sì, elimina l\'account',
            onConfirm: handleDeleteAccount,
          })}
        />
      </View>
    </ScrollView>

    <BottomActionBar>
      {saveError ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={20} color={colors.dangerText} />
          <Text style={styles.errorText}>{saveError}</Text>
        </View>
      ) : null}
      <PrimaryButton
        label={saved ? 'Salvato' : 'Salva le modifiche'}
        icon={saved ? 'checkmark-circle' : undefined}
        onPress={handleSave}
        loading={saving}
        loadingLabel="Salvo…"
      />
    </BottomActionBar>
    </KeyboardAvoidingView>
    <BottomTabBar active="Profile" />

    <ActionSheet
      visible={Boolean(pendingDelete)}
      title={pendingDelete?.title || ''}
      destructive={pendingDelete ? { label: pendingDelete.label, confirmTitle: pendingDelete.confirmTitle, confirmMessage: pendingDelete.confirmMessage, confirmLabel: pendingDelete.confirmLabel, onConfirm: pendingDelete.onConfirm } : null}
      startOnConfirm
      onClose={() => setPendingDelete(null)}
    />
    </View>
  );
}

/** The six colours a quote header can have (stored on the profile as brand_color). */
const BRAND_SWATCHES = [
  { name: 'Inchiostro', value: '#0f172a' },
  { name: 'Grafite', value: '#374151' },
  { name: 'Arancio', value: '#c2410c' },
  { name: 'Mattone', value: '#9a3412' },
  { name: 'Verde bosco', value: '#166534' },
  { name: 'Blu notte', value: '#1e3a8a' },
];

/**
 * Stili dal tema: niente colori scritti a mano, così etichette e campi
 * restano leggibili anche al buio. Testo mai sotto 16pt, campi alti almeno 56.
 */
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 6, color: c.text },
  help: { fontSize: 16, color: c.textSecondary, marginTop: -8, marginBottom: 16, lineHeight: 22 },
  bodyText: { fontSize: 18, color: c.text, lineHeight: 24 },
  input: { backgroundColor: c.inputBg, borderWidth: 2, borderColor: c.inputBorder, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56, marginBottom: 16, fontSize: 18, color: c.text, justifyContent: 'center' },
  inputReadonly: { backgroundColor: c.surfaceSecondary, borderColor: c.border },
  inputText: { fontSize: 18, color: c.text },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { color: c.dangerText, fontSize: 16, flex: 1 },
  segment: { flex: 1, minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: 2, borderColor: c.inputBorder, backgroundColor: c.surface, paddingHorizontal: 4 },
  segmentActive: { backgroundColor: c.text, borderColor: c.text },
  segmentText: { color: c.text, fontWeight: '600', fontSize: 16 },
  langItem: { padding: 12, minHeight: 48, justifyContent: 'center', borderRadius: 8, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  langItemSelected: { backgroundColor: c.mark },
  langItemSelectedText: { color: c.primaryStrong, fontWeight: '700' },
  templateInfo: { fontSize: 16, color: c.text, fontWeight: '600', flex: 1 },
  templateButtons: { flexDirection: 'row', gap: 16 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoThumb: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: 52, height: 52 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  swatchItem: { width: '31%', alignItems: 'center', minHeight: 88, justifyContent: 'center' },
  swatchRing: { borderWidth: 3, borderRadius: 30, padding: 3 },
  swatch: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  swatchName: { fontSize: 16, color: c.text, marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 64, marginTop: 12 },
  dangerZone: { marginTop: 48, paddingTop: 8, borderTopWidth: 1 },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: c.text },
  sectionBox: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 16, marginBottom: 16 },
});
