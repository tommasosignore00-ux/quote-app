import { buildWebApiUrl, getWebApiAuthHeaders, isWebApiConfigured } from '../lib/webApi';
import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ScrollView, FlatList, Modal } from 'react-native';
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
        setIbanError(ibanResult.error || 'IBAN non valido');
        Alert.alert('⚠️ IBAN non valido', ibanResult.error || 'Controlla il formato IBAN');
        return;
      }
      setIbanError(null);
    }

    setSaving(true);
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
        if (!templateRes.ok) throw new Error('Salvataggio del template non riuscito');
      }
      await supabase.from('profiles').update({
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
      Alert.alert(t('messages.success'), t('messages.saved'));
    } catch (err: unknown) {
      Alert.alert(t('messages.error'), (err as Error).message);
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
          Alert.alert(t('messages.success'), 'Template caricato. Ricorda di salvare le modifiche.');
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
        'Template pronto',
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
      'Rimuovi Template',
      'Vuoi rimuovere il template personalizzato?',
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

  // Punto 27: GDPR Delete account
  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Elimina Account',
      'Tutti i tuoi dati verranno cancellati permanentemente. Questa azione è irreversibile.',
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina',
          style: 'destructive',
          onPress: async () => {
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
            } catch (err) {
              Alert.alert('Errore', (err as Error).message);
            }
          },
        },
      ]
    );
  };

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

  if (loading) return <View style={[styles.container, { backgroundColor: colors.background }]}><Text style={{ color: colors.text, fontSize: 18 }}>{t('messages.loading')}</Text></View>;

  const themeOptions = [
    { key: 'system' as const, label: 'Automatico', icon: 'contrast-outline' as const },
    { key: 'light' as const, label: 'Chiaro', icon: 'sunny-outline' as const },
    { key: 'dark' as const, label: 'Scuro', icon: 'moon-outline' as const },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">{t('main.profile')}</Text>

      {/* Punto 7: Aspetto (tema) */}
      <Text style={styles.label}>Aspetto</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }} accessibilityRole="radiogroup">
        {themeOptions.map((opt) => {
          const active = mode === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setMode(opt.key)}
              style={[styles.segment, active ? styles.segmentActive : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active, checked: active }}
              accessibilityLabel={`Aspetto: ${opt.label}`}
            >
              <Ionicons name={opt.icon} size={20} color={active ? colors.surface : colors.text} />
              <Text style={[styles.segmentText, active ? { color: colors.surface, fontWeight: '700' } : null]} maxFontSizeMultiplier={1.3}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>{t('profile.company')}</Text>
      <TextInput style={styles.input} accessibilityLabel={t('profile.company')} placeholder={t('profile.company')} value={profile.company_name || ''} onChangeText={(v) => setProfile({ ...profile, company_name: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={styles.label}>{t('profile.vatNumber')}</Text>
      <TextInput style={styles.input} accessibilityLabel={t('profile.vatNumber')} placeholder={t('profile.vatNumber')} value={profile.vat_number || ''} onChangeText={(v) => setProfile({ ...profile, vat_number: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={styles.label}>{t('profile.fiscalCode')}</Text>
      <TextInput style={styles.input} accessibilityLabel={t('profile.fiscalCode')} placeholder={t('profile.fiscalCode')} value={profile.fiscal_code || ''} onChangeText={(v) => setProfile({ ...profile, fiscal_code: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={styles.label}>{t('profile.country')}</Text>
      <View style={[styles.input, styles.inputReadonly]}>
        <Text style={styles.inputText}>Italia</Text>
      </View>
      <Text style={styles.help}>Per ora il servizio è solo in Italia.</Text>
      <Text style={styles.label}>{t('profile.iban')}</Text>
      <TextInput style={[styles.input, ibanError ? styles.inputError : null]} accessibilityLabel={t('profile.iban')} accessibilityHint={ibanError || undefined} placeholder={t('profile.iban')} value={profile.iban || ''} onChangeText={(v) => { setProfile({ ...profile, iban: v.toUpperCase().replace(/\s/g, '') }); setIbanError(null); }} onBlur={() => { if (profile.iban) { const r = validateIBAN(profile.iban); if (!r.valid) setIbanError(r.error || 'IBAN non valido'); else { setIbanError(null); setProfile({ ...profile, iban: formatIBAN(profile.iban) }); } } }} autoCapitalize="characters" placeholderTextColor={colors.textTertiary} />
      {ibanError && (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle-outline" size={20} color={colors.dangerText} />
          <Text style={styles.errorText}>{ibanError}</Text>
        </View>
      )}
      <Text style={styles.label}>{t('profile.swiftBic')}</Text>
      <TextInput style={styles.input} accessibilityLabel={t('profile.swiftBic')} placeholder={t('profile.swiftBic')} value={profile.swift_bic || ''} onChangeText={(v) => setProfile({ ...profile, swift_bic: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={styles.label}>Logo aziendale</Text>
      <TouchableOpacity style={[styles.btnSecondaryOutline, { marginBottom: 16 }]} onPress={handleLogoUpload} accessibilityRole="button">
        <Ionicons name="image-outline" size={24} color={colors.text} />
        <Text style={styles.btnSecondaryOutlineText}>{profile.logo_url ? 'Sostituisci il logo' : 'Carica il logo'}</Text>
      </TouchableOpacity>
      <Text style={styles.label}>Colore sui preventivi (es. #1f2937)</Text>
      <TextInput style={styles.input} accessibilityLabel="Colore sui preventivi" placeholder="#1f2937" autoCapitalize="none" value={profile.brand_color || ''} onChangeText={(v) => setProfile({ ...profile, brand_color: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={styles.label}>{t('messages.address')}</Text>
      <TextInput style={styles.input} accessibilityLabel={t('messages.address')} placeholder={t('messages.address')} value={profile.address || ''} onChangeText={(v) => setProfile({ ...profile, address: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={styles.label}>{t('messages.city')}</Text>
      <TextInput style={styles.input} accessibilityLabel={t('messages.city')} placeholder={t('messages.city')} value={profile.city || ''} onChangeText={(v) => setProfile({ ...profile, city: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={styles.label}>{t('messages.postalCode')}</Text>
      <TextInput style={styles.input} accessibilityLabel={t('messages.postalCode')} placeholder={t('messages.postalCode')} value={profile.postal_code || ''} onChangeText={(v) => setProfile({ ...profile, postal_code: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={styles.label}>{t('profile.vatPercent')}</Text>
      <TextInput keyboardType="numeric" style={styles.input} accessibilityLabel={t('profile.vatPercent')} placeholder={t('profile.vatPercent')} value={String(profile.vat_percent ?? 22)} onChangeText={(v) => setProfile({ ...profile, vat_percent: parseFloat(v || '22') })} placeholderTextColor={colors.textTertiary} />
      <Text style={styles.label}>{t('profile.materialMarkupVAT')}</Text>
      <TextInput keyboardType="numeric" style={styles.input} accessibilityLabel={t('profile.materialMarkupVAT')} placeholder={t('profile.materialMarkupVAT')} value={String(profile.material_markup_vat_percent || 0)} onChangeText={(v) => setProfile({ ...profile, material_markup_vat_percent: parseFloat(v || '0') })} placeholderTextColor={colors.textTertiary} />
      
      {/* Punto 21: Dynamic Fiscal Fields */}
      {fiscalConfig.fields.length > 0 && (
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Campi fiscali ({fiscalConfig.countryCode})</Text>
          {fiscalConfig.fields.map((field: FiscalField) => (
            <View key={field.key}>
              <Text style={styles.label}>{field.label}{field.required ? ' *' : ''}</Text>
              <TextInput style={styles.input} accessibilityLabel={field.label} placeholder={field.placeholder || field.label} value={profile[field.key] || ''} onChangeText={(v) => setProfile({ ...profile, [field.key]: v })} placeholderTextColor={colors.textTertiary} />
            </View>
          ))}
          {fiscalConfig.reverseChargeApplicable && (
            <Text style={styles.help}>Reverse charge disponibile per operazioni intra-UE</Text>
          )}
          {fiscalConfig.electronicInvoicingRequired && fiscalConfig.electronicInvoicingSystem && (
            <Text style={styles.help}>Fatturazione elettronica: {fiscalConfig.electronicInvoicingSystem}</Text>
          )}
        </View>
      )}

      <TwoFactorSettings />

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 64, marginBottom: 12 }}>
        <Text style={{ color: colors.text, fontSize: 18, flex: 1, paddingRight: 12 }}>Condividi statistiche anonime di utilizzo</Text>
        <Switch
          value={analyticsConsent}
          onValueChange={(value) => { setAnalyticsConsentState(value); setAnalyticsConsent(value); }}
          accessibilityLabel="Condividi statistiche anonime di utilizzo"
        />
      </View>

      {/* Punto 44: Time Savings Widget */}
      {timeSavedStats ? (
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>La tua attività</Text>
          <Text style={styles.bodyText}>{timeSavedStats}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Il tuo modello di preventivo</Text>
      <View style={styles.sectionBox}>
        {profile.custom_template_html ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <Text style={styles.templateInfo}>Modello caricato ({(profile.custom_template_html.length / 1024).toFixed(1)} KB)</Text>
            </View>
            <View style={styles.templateButtons}>
              <TouchableOpacity style={[styles.btnSecondaryOutline, { flex: 1 }]} onPress={handleUploadTemplate} disabled={convertingTemplate} accessibilityRole="button">
                <Text style={styles.btnSecondaryOutlineText}>{convertingTemplate ? 'Leggo il preventivo...' : 'Sostituisci'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btnDangerOutline, { flex: 1 }]} onPress={handleRemoveTemplate} accessibilityRole="button" accessibilityLabel="Rimuovi il modello di preventivo">
                <Ionicons name="trash-outline" size={24} color={colors.dangerText} />
                <Text style={styles.btnDangerOutlineText}>Rimuovi</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.btnSecondaryOutline} onPress={handleUploadTemplate} disabled={convertingTemplate} accessibilityRole="button">
            <Ionicons name="document-text-outline" size={24} color={colors.text} />
            <Text style={styles.btnSecondaryOutlineText}>{convertingTemplate ? 'Leggo il preventivo...' : 'Carica il tuo preventivo (Word o HTML)'}</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.help}>Carica il preventivo che usi già, anche uno vecchio compilato: l'app lo trasforma nel tuo modello, con cliente, voci e totali al posto giusto.</Text>
      </View>

      {/* Punto 25: US State Picker (only shown for US country) */}
      {DEFAULT_COUNTRY_CODE !== 'IT' && (profile.country_code || '').toUpperCase() === 'US' && (
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>US Sales Tax State</Text>
          <TouchableOpacity style={styles.input} onPress={() => setShowUsStatePicker(!showUsStatePicker)} accessibilityRole="button">
            <Text style={styles.inputText}>{usState ? `${usState} (${US_STATE_TAX_RATES[usState] || 0}%)` : 'Seleziona stato'}</Text>
          </TouchableOpacity>
          {showUsStatePicker && (
            <View style={{ maxHeight: 200 }}>
              <FlatList
                data={Object.entries(US_STATE_TAX_RATES).map(([code, rate]) => ({ code, rate }))}
                keyExtractor={item => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => { setUsState(item.code); setShowUsStatePicker(false); }} style={[styles.langItem, usState === item.code && styles.langItemSelected]} accessibilityState={{ selected: usState === item.code }}>
                    <Text style={[styles.bodyText, usState === item.code ? styles.langItemSelectedText : undefined]}>{item.code} — {item.rate}%</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
      )}

      {/* Punto 35: Referral Program */}
      {profile.referral_code && (
        <View style={styles.sectionBox}>
          <Text style={styles.sectionTitle}>Programma Referral</Text>
          <Text style={styles.bodyText}>Il tuo codice: <Text style={{ fontWeight: '700' }}>{profile.referral_code}</Text></Text>
          <TouchableOpacity style={styles.linkBtn} accessibilityRole="button" onPress={() => {
            const link = `https://quoteapp.it/register?ref=${profile.referral_code}`;
            Alert.alert('Link Referral', link);
          }}>
            <Ionicons name="link-outline" size={20} color={colors.primaryText} />
            <Text style={styles.linkText}>Mostra link invito</Text>
          </TouchableOpacity>
          <Text style={styles.help}>
            Guadagna il 20% su ogni abbonamento tramite il tuo link.
          </Text>
          {referralStats.total > 0 && (
            <Text style={styles.help}>
              {referralStats.total} invitati · {referralStats.converted} convertiti
            </Text>
          )}
        </View>
      )}

      {/* Punto 14: Command Mappings Review */}
      <TouchableOpacity onPress={() => setShowMappingsSection(!showMappingsSection)} style={styles.sectionHeader} accessibilityRole="button" accessibilityState={{ expanded: showMappingsSection }}>
        <Ionicons name="chatbubble-ellipses-outline" size={24} color={colors.text} />
        <Text style={styles.sectionHeaderText}>Parole che ho imparato ({commandMappings.length})</Text>
        <Ionicons name={showMappingsSection ? 'chevron-up' : 'chevron-down'} size={24} color={colors.textSecondary} />
      </TouchableOpacity>
      {showMappingsSection && commandMappings.length > 0 && (
        <View style={[styles.sectionBox, { marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
          {commandMappings.map(m => (
            <View key={m.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bodyText}>"{m.raw_text}" → {m.mapped_description}</Text>
                <Text style={styles.help}>Usato {m.usage_count} volte</Text>
              </View>
              <TouchableOpacity onPress={() => handleDeleteMapping(m.id)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={`Elimina la parola «${m.raw_text}»`}>
                <Ionicons name="trash-outline" size={24} color={colors.dangerText} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Punto 41: Team Management - solo per abbonamento team */}
      {teamInvitations.map(invitation => (
        <View key={invitation.id} style={[styles.sectionBox, { marginTop: 16, marginBottom: 12 }]}>
          <Text style={[styles.bodyText, { marginBottom: 10 }]}>
            {invitation.owner?.company_name || 'Un titolare'} ti ha invitato nel team
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={[styles.btnSecondaryOutline, { flex: 1, minHeight: 64 }]} onPress={() => handleRespondInvitation(invitation.id, false)} accessibilityRole="button">
              <Text style={styles.btnSecondaryOutlineText}>Rifiuta</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { flex: 1, minHeight: 64 }]} onPress={() => handleRespondInvitation(invitation.id, true)} accessibilityRole="button">
              <Text style={styles.btnText}>Accetta</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {profile.team_plan === true && <>
      <TouchableOpacity onPress={() => setShowTeamSection(!showTeamSection)} style={styles.sectionHeader} accessibilityRole="button" accessibilityState={{ expanded: showTeamSection }}>
        <Ionicons name="people-outline" size={24} color={colors.text} />
        <Text style={styles.sectionHeaderText}>Squadra ({teamMembers.length}/{TEAM_MEMBERS_INCLUDED} inclusi oltre a te{teamMembers.length > TEAM_MEMBERS_INCLUDED ? ` + ${teamMembers.length - TEAM_MEMBERS_INCLUDED} extra` : ''})</Text>
        <Ionicons name={showTeamSection ? 'chevron-up' : 'chevron-down'} size={24} color={colors.textSecondary} />
      </TouchableOpacity>
      {showTeamSection && (
        <View style={[styles.sectionBox, { marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
          {teamMembers.map(m => (
            <View key={m.id} style={styles.listRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bodyText}>{m.member?.email || 'N/A'}</Text>
                <Text style={styles.help}>{m.role}{!m.accepted_at ? ' · in attesa di accettazione' : ''}</Text>
              </View>
              <TouchableOpacity onPress={() => handleRemoveTeamMember(m.id)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={`Togli ${m.member?.email || 'il membro'} dalla squadra`}>
                <Ionicons name="close-outline" size={28} color={colors.dangerText} />
              </TouchableOpacity>
            </View>
          ))}
          <Text style={[styles.label, { marginTop: 12 }]}>Invita membro</Text>
          <TextInput style={styles.input} accessibilityLabel="Email del membro da invitare" placeholder="email@example.com" value={inviteEmail} onChangeText={setInviteEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.textTertiary} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {['admin', 'technician', 'readonly'].map(role => (
              <TouchableOpacity key={role} onPress={() => setInviteRole(role)} style={[styles.chip, inviteRole === role ? styles.chipActive : null]} accessibilityRole="radio" accessibilityState={{ selected: inviteRole === role, checked: inviteRole === role }}>
                <Text style={[styles.chipText, inviteRole === role ? { color: colors.surface } : null]}>{role}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.btn, { marginBottom: 0 }]} onPress={handleInviteMember} accessibilityRole="button">
            <Text style={styles.btnText}>Invita</Text>
          </TouchableOpacity>
        </View>
      )}
      </>}

      {/* Punto 43: Webhooks - solo per abbonamento pro/team */}
      {(profile.subscription_status === 'active' || profile.subscription_status === 'team') && <View style={[styles.sectionBox, { marginTop: 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>Integrazioni</Text>
          <TouchableOpacity onPress={() => setShowWebhookModal(true)} style={styles.linkBtn} accessibilityRole="button" accessibilityLabel="Aggiungi un'integrazione">
            <Ionicons name="add-outline" size={24} color={colors.primaryText} />
            <Text style={styles.linkText}>Aggiungi</Text>
          </TouchableOpacity>
        </View>
        {webhooks.map(w => (
          <View key={w.id} style={styles.listRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bodyText} numberOfLines={1}>{w.url}</Text>
              <Text style={styles.help}>{(w.events || []).join(', ')}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteWebhook(w.id)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Elimina l'integrazione">
              <Ionicons name="trash-outline" size={24} color={colors.dangerText} />
            </TouchableOpacity>
          </View>
        ))}
        {webhooks.length === 0 && <Text style={styles.help}>Nessuna integrazione configurata</Text>}
      </View>}

      {/* Punto 43: Add Webhook Modal */}
      <Modal visible={showWebhookModal} transparent animationType="fade" onRequestClose={() => setShowWebhookModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Nuova integrazione</Text>
            <Text style={styles.label}>Indirizzo</Text>
            <TextInput style={styles.input} accessibilityLabel="Indirizzo dell'integrazione" placeholder="https://hooks.zapier.com/..." value={newWebhookUrl} onChangeText={setNewWebhookUrl} autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.textTertiary} />
            <Text style={styles.label}>Eventi</Text>
            {['quote_approved', 'quote_sent', 'client_created'].map(evt => {
              const checked = newWebhookEvents.includes(evt);
              return (
                <TouchableOpacity key={evt} onPress={() => {
                  setNewWebhookEvents(prev => prev.includes(evt) ? prev.filter(e => e !== evt) : [...prev, evt]);
                }} style={styles.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked }}>
                  <View style={[styles.checkBox, checked ? styles.checkBoxOn : null]}>
                    {checked ? <Ionicons name="checkmark" size={20} color={colors.onPrimary} /> : null}
                  </View>
                  <Text style={styles.bodyText}>{evt}</Text>
                </TouchableOpacity>
              );
            })}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={[styles.btnSecondaryOutline, { flex: 1 }]} onPress={() => setShowWebhookModal(false)} accessibilityRole="button">
                <Text style={styles.btnSecondaryOutlineText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={handleAddWebhook} accessibilityRole="button">
                <Text style={styles.btnText}>Salva</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Punto 27: GDPR Data Export & Delete */}
      <View style={[styles.sectionBox, { marginTop: 16 }]}>
        <Text style={styles.sectionTitle}>Privacy e dati personali</Text>
        <TouchableOpacity style={[styles.btnSecondaryOutline, { marginBottom: 24 }]} onPress={handleExportMyData} accessibilityRole="button">
          <Ionicons name="download-outline" size={24} color={colors.text} />
          <Text style={styles.btnSecondaryOutlineText}>Esporta i miei dati</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnDangerOutline} onPress={handleDeleteAccount} accessibilityRole="button">
          <Ionicons name="trash-outline" size={24} color={colors.dangerText} />
          <Text style={styles.btnDangerOutlineText}>Elimina l'account</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.btnSecondaryOutline, { marginBottom: 12 }]} onPress={() => (navigation as any).navigate('Subscription')} accessibilityRole="button">
        <Ionicons name="id-card-outline" size={24} color={colors.text} />
        <Text style={styles.btnSecondaryOutlineText}>{t('navigation.subscription') || 'Abbonamento'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, { minHeight: 64 }, saving && styles.disabled]} onPress={handleSave} disabled={saving} accessibilityRole="button" accessibilityState={{ disabled: saving, busy: saving }}>
        <Text style={styles.btnText}>{saving ? t('buttons.loading') : t('buttons.save')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/**
 * Stili dal tema (lotto 2): niente colori scritti a mano, così etichette e campi
 * restano leggibili anche al buio. Testo mai sotto 16pt, campi alti almeno 56.
 */
const makeStyles = (c: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 24, color: c.text },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 6, color: c.text },
  help: { fontSize: 16, color: c.textSecondary, marginTop: -8, marginBottom: 16, lineHeight: 22 },
  bodyText: { fontSize: 18, color: c.text, lineHeight: 24 },
  input: { backgroundColor: c.inputBg, borderWidth: 2, borderColor: c.inputBorder, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 56, marginBottom: 16, fontSize: 18, color: c.text, justifyContent: 'center' },
  inputReadonly: { backgroundColor: c.surfaceSecondary, borderColor: c.border },
  inputText: { fontSize: 18, color: c.text },
  inputError: { borderColor: c.dangerText, borderWidth: 3 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8, marginBottom: 16 },
  errorText: { color: c.dangerText, fontSize: 16, flex: 1 },
  segment: { flex: 1, minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: 2, borderColor: c.inputBorder, backgroundColor: c.surface, paddingHorizontal: 4 },
  segmentActive: { backgroundColor: c.text, borderColor: c.text },
  segmentText: { color: c.text, fontWeight: '600', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end' },
  modal: { backgroundColor: c.modalBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 32, maxHeight: '80%' },
  modalTitle: { fontSize: 22, fontWeight: '700', marginBottom: 16, color: c.text },
  langItem: { padding: 12, minHeight: 48, justifyContent: 'center', borderRadius: 8, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  langItemSelected: { backgroundColor: c.mark },
  langItemSelectedText: { color: c.primaryStrong, fontWeight: '700' },
  templateInfo: { fontSize: 16, color: c.text, fontWeight: '600', flex: 1 },
  templateButtons: { flexDirection: 'row', gap: 16, marginBottom: 16 },
  btn: { backgroundColor: c.primary, minHeight: 56, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: c.onPrimary, fontWeight: '700', fontSize: 18 },
  btnSecondaryOutline: { minHeight: 56, borderRadius: 12, borderWidth: 2, borderColor: c.text, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  btnSecondaryOutlineText: { color: c.text, fontWeight: '700', fontSize: 18, flexShrink: 1, textAlign: 'center' },
  btnDangerOutline: { minHeight: 56, borderRadius: 12, borderWidth: 2, borderColor: c.dangerText, backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  btnDangerOutlineText: { color: c.dangerText, fontWeight: '700', fontSize: 18 },
  linkBtn: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  linkText: { color: c.primaryText, fontWeight: '700', fontSize: 18, textDecorationLine: 'underline' },
  iconBtn: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  chip: { flex: 1, minHeight: 48, paddingHorizontal: 4, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: c.inputBorder, backgroundColor: c.surface },
  chipActive: { backgroundColor: c.text, borderColor: c.text },
  chipText: { color: c.text, fontSize: 16, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  checkBox: { width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: c.inputBorder, alignItems: 'center', justifyContent: 'center' },
  checkBoxOn: { backgroundColor: c.primary, borderColor: c.primary },
  disabled: { opacity: 0.45 },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 12, color: c.text },
  sectionBox: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginTop: 16, marginBottom: 0 },
  sectionHeaderText: { flex: 1, fontWeight: '600', fontSize: 18, color: c.text },
});
