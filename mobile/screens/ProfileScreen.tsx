import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, FlatList, Modal } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import i18n from '../lib/i18n';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { validateIBAN, formatIBAN } from '../lib/ibanValidation';
import { getFiscalConfig, FiscalField, US_STATE_TAX_RATES } from '../lib/fiscalSwitch';
import { getTimeSavingsStats } from '../lib/timeSavings';
import { useTheme } from '../lib/darkMode';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors, mode, setMode, isDark } = useTheme();
  const [profile, setProfile] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLangModal, setShowLangModal] = useState(false);
  const [showCountryModal, setShowCountryModal] = useState(false);
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
  const [showTeamSection, setShowTeamSection] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('technician');

  // Punto 43: Webhooks
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>(['quote_approved']);

  const languages = ['it', 'en', 'de', 'fr', 'es', 'pt', 'pl', 'nl', 'zh', 'ru', 'cs', 'hu', 'ro', 'uk', 'hr', 'sk', 'bg', 'sl', 'el', 'ja', 'ko'];
  const languageLabels: Record<string, string> = {
    it: 'Italiano', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español', pt: 'Português', pl: 'Polski', nl: 'Nederlands', zh: '中文', ru: 'Русский', cs: 'Čeština', hu: 'Magyar', ro: 'Română', uk: 'Українська', hr: 'Hrvatski', sk: 'Slovenčina', bg: 'Български', sl: 'Slovenščina', el: 'Ελληνικά', ja: '日本語', ko: '한국어'
  };
  const countries = ['IT', 'DE', 'FR', 'ES', 'GB', 'US', 'AT', 'CH', 'NL', 'BE', 'PT', 'PL', 'RO', 'CZ', 'HR', 'HU', 'SK', 'SI', 'BG', 'GR', 'RU', 'UA', 'JP', 'KR', 'CN'];
  const countryLabels: Record<string, string> = {
    IT: '🇮🇹 Italia', DE: '🇩🇪 Germania', FR: '🇫🇷 Francia', ES: '🇪🇸 Spagna', GB: '🇬🇧 Regno Unito', US: '🇺🇸 Stati Uniti', AT: '🇦🇹 Austria', CH: '🇨🇭 Svizzera', NL: '🇳🇱 Paesi Bassi', BE: '🇧🇪 Belgio', PT: '🇵🇹 Portogallo', PL: '🇵🇱 Polonia', RO: '🇷🇴 Romania', CZ: '🇨🇿 Rep. Ceca', HR: '🇭🇷 Croazia', HU: '🇭🇺 Ungheria', SK: '🇸🇰 Slovacchia', SI: '🇸🇮 Slovenia', BG: '🇧🇬 Bulgaria', GR: '🇬🇷 Grecia', RU: '🇷🇺 Russia', UA: '🇺🇦 Ucraina', JP: '🇯🇵 Giappone', KR: '🇰🇷 Corea del Sud', CN: '🇨🇳 Cina'
  };

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (data) {
        setProfile(data);
        setFiscalConfig(getFiscalConfig(data.country_code || 'IT'));
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
          converted: referrals.filter(r => r.status === 'converted').length,
        });
      }

      // Punto 41: Load team members
      const { data: team } = await supabase
        .from('team_members')
        .select('*, member:member_id(email, company_name)')
        .eq('team_owner_id', user.id)
        .eq('active', true);
      if (team) setTeamMembers(team);

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
      if (stats.totalHoursSaved > 0) {
        setTimeSavedStats(
          `${stats.totalHoursSaved}h risparmiate (${stats.totalActions} azioni, ${stats.thisMonth}min questo mese)`
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
      await supabase.from('profiles').update({
        company_name: profile.company_name,
        vat_number: profile.vat_number,
        vat_percent: profile.vat_percent ?? 22,
        material_markup: profile.material_markup_vat_percent || 0,
        material_markup_vat_percent: profile.material_markup_vat_percent || 0,
        fiscal_code: profile.fiscal_code,
        country_code: profile.country_code,
        language: profile.language,
        address: profile.address,
        city: profile.city,
        postal_code: profile.postal_code,
        iban: profile.iban,
        swift_bic: profile.swift_bic,
        custom_template_html: profile.custom_template_html,
        us_state: usState || null,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
      if (profile.language) {
        i18n.changeLanguage(profile.language);
      }
      Alert.alert(t('messages.success'), t('messages.saved'));
    } catch (err: unknown) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleUploadTemplate = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'text/html' });
      if (result.canceled) return;
      
      const fileUri = result.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(fileUri);
      
      setProfile({ ...profile, custom_template_html: content });
      Alert.alert(
        t('messages.success'), 
        'Template HTML caricato! Ricorda di salvare le modifiche.\n\nPlaceholder disponibili: {{lavoroTitle}}, {{clienteName}}, {{revision}}, {{items}}, {{subtotal}}, {{taxes}}, {{total}}, {{companyName}}, {{vatNumber}}, {{iban}}, {{swift}}, ecc.'
      );
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      const { data: clients } = await supabase.from('clienti').select('*').eq('profile_id', user.id);
      const { data: jobs } = await supabase.from('lavori').select('*').eq('profile_id', user.id);
      const jobIds = (jobs || []).map((j: any) => j.id);
      const { data: quotes } = jobIds.length > 0
        ? await supabase.from('preventivi_dettaglio').select('*').in('lavoro_id', jobIds)
        : { data: [] };
      const exportData = { profile: prof, clients, jobs, quotes, exportedAt: new Date().toISOString() };
      const path = FileSystem.cacheDirectory + 'my_data_export.json';
      await FileSystem.writeAsStringAsync(path, JSON.stringify(exportData, null, 2));
      await Sharing.shareAsync(path);
    } catch (err) {
      Alert.alert('Errore', (err as Error).message);
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
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;
              await supabase.from('profiles').delete().eq('id', user.id);
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
  const TEAM_MEMBERS_INCLUDED = 5;
  const EXTRA_MEMBER_PRICE = 7.99;

  // Punto 41: Invite team member
  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Enforce member limit
      const currentCount = teamMembers.length;
      if (currentCount >= TEAM_MEMBERS_INCLUDED) {
        const extraCount = currentCount - TEAM_MEMBERS_INCLUDED + 1;
        const extraCost = extraCount * EXTRA_MEMBER_PRICE;
        return new Promise<void>((resolve) => {
          Alert.alert(
            'Membro extra',
            `Hai già ${currentCount} membri (${TEAM_MEMBERS_INCLUDED} inclusi nel piano).\n\nAggiungere questo membro costerà €${EXTRA_MEMBER_PRICE}/mese in più.\nTotale supplemento: €${extraCost.toFixed(2)}/mese.`,
            [
              { text: 'Annulla', style: 'cancel', onPress: () => resolve() },
              { text: 'Aggiungi (€' + EXTRA_MEMBER_PRICE + '/mese)', onPress: async () => {
                await doInviteMember(user.id);
                resolve();
              }},
            ]
          );
        });
      }

      await doInviteMember(user.id);
    } catch (err) {
      Alert.alert('Errore', (err as Error).message);
    }
  };

  const doInviteMember = async (userId: string) => {
    try {
      const { data: invitedProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', inviteEmail)
        .maybeSingle();
      if (!invitedProfile) {
        Alert.alert('Utente non trovato', "L'utente deve prima registrarsi all'app");
        return;
      }
      const defaultPermissions: Record<string, Record<string, boolean>> = {
        admin: { create_quotes: true, edit_quotes: true, delete_quotes: true, manage_clients: true, view_reports: true },
        technician: { create_quotes: true, edit_quotes: true, delete_quotes: false, manage_clients: false, view_reports: false },
        readonly: { create_quotes: false, edit_quotes: false, delete_quotes: false, manage_clients: false, view_reports: true },
      };
      const { data: created, error } = await supabase.from('team_members').insert({
        team_owner_id: userId,
        member_id: invitedProfile.id,
        role: inviteRole,
        permissions: defaultPermissions[inviteRole] || defaultPermissions.readonly,
      }).select('*, member:member_id(email, company_name)');
      if (error) throw error;
      if (created?.[0]) setTeamMembers(prev => [...prev, created[0]]);
      setInviteEmail('');

      // Update extra members count in profile for metered billing
      const newCount = teamMembers.length + 1;
      const extraMembers = Math.max(0, newCount - TEAM_MEMBERS_INCLUDED);
      await supabase.from('profiles').update({ extra_team_members: extraMembers }).eq('id', userId);

      if (newCount > TEAM_MEMBERS_INCLUDED) {
        Alert.alert('Membro aggiunto!', `Hai ${newCount} membri (${newCount - TEAM_MEMBERS_INCLUDED} extra a €${EXTRA_MEMBER_PRICE}/mese ciascuno).`);
      } else {
        Alert.alert('Membro aggiunto!', `${newCount}/${TEAM_MEMBERS_INCLUDED} membri inclusi nel piano.`);
      }
    } catch (err) {
      Alert.alert('Errore', (err as Error).message);
    }
  };

  // Punto 41: Remove team member
  const handleRemoveTeamMember = async (id: string) => {
    await supabase.from('team_members').update({ active: false }).eq('id', id);
    const newMembers = teamMembers.filter(m => m.id !== id);
    setTeamMembers(newMembers);
    // Update extra members count
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const extraMembers = Math.max(0, newMembers.length - TEAM_MEMBERS_INCLUDED);
      await supabase.from('profiles').update({ extra_team_members: extraMembers }).eq('id', user.id);
    }
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

  if (loading) return <View style={[styles.container, { backgroundColor: colors.background }]}><Text style={{ color: colors.text }}>{t('messages.loading')}</Text></View>;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('main.profile')}</Text>

      {/* Punto 7: Dark Mode Toggle */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        {(['system', 'light', 'dark'] as const).map((m) => (
          <TouchableOpacity key={m} onPress={() => setMode(m)} style={[{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 2 }, mode === m ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: mode === m ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>{m === 'system' ? '⚙️ Auto' : m === 'light' ? '☀️ Light' : '🌙 Dark'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={[styles.label, { color: colors.text }]}>{t('profile.company')}</Text>
      <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('profile.company')} value={profile.company_name || ''} onChangeText={(v) => setProfile({ ...profile, company_name: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={[styles.label, { color: colors.text }]}>{t('profile.vatNumber')}</Text>
      <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('profile.vatNumber')} value={profile.vat_number || ''} onChangeText={(v) => setProfile({ ...profile, vat_number: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={[styles.label, { color: colors.text }]}>{t('profile.fiscalCode')}</Text>
      <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('profile.fiscalCode')} value={profile.fiscal_code || ''} onChangeText={(v) => setProfile({ ...profile, fiscal_code: v })} placeholderTextColor={colors.textTertiary} />
      <Text style={[styles.label, { color: colors.text }]}>{t('profile.country')}</Text>
      <TouchableOpacity style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => setShowCountryModal(true)}>
        <Text style={{ color: colors.text }}>{countryLabels[profile.country_code] || profile.country_code || 'Seleziona nazione'}</Text>
      </TouchableOpacity>
      <Modal visible={showCountryModal} transparent animationType="fade" onRequestClose={() => setShowCountryModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.country')}</Text>
            <FlatList data={countries} keyExtractor={(i) => i} renderItem={({ item }) => (
              <TouchableOpacity onPress={() => { setProfile({ ...profile, country_code: item }); setFiscalConfig(getFiscalConfig(item)); setShowCountryModal(false); }} style={[styles.langItem, { borderBottomColor: colors.border }, profile.country_code === item && styles.langItemSelected]}>
                <Text style={[{ color: colors.text }, profile.country_code === item ? styles.langItemSelectedText : undefined]}>{countryLabels[item]}</Text>
              </TouchableOpacity>
            )} />
          </View>
        </View>
      </Modal>
      <Text style={[styles.label, { color: colors.text }]}>{t('profile.language')}</Text>
      <TouchableOpacity style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => setShowLangModal(true)}>
        <Text style={{ color: colors.text }}>{languageLabels[profile.language] || 'Seleziona lingua'}</Text>
      </TouchableOpacity>
      <Modal visible={showLangModal} transparent animationType="fade" onRequestClose={() => setShowLangModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profile.language')}</Text>
            <FlatList data={languages} keyExtractor={(i) => i} renderItem={({ item }) => (
              <TouchableOpacity onPress={() => { setProfile({ ...profile, language: item }); setShowLangModal(false); }} style={[styles.langItem, { borderBottomColor: colors.border }, profile.language === item && styles.langItemSelected]}>
                <Text style={[{ color: colors.text }, profile.language === item ? styles.langItemSelectedText : undefined]}>{languageLabels[item]}</Text>
              </TouchableOpacity>
            )} />
          </View>
        </View>
      </Modal>
      <Text style={styles.label}>{t('profile.iban')}</Text>
      <TextInput style={[styles.input, ibanError ? styles.inputError : null]} placeholder={t('profile.iban')} value={profile.iban || ''} onChangeText={(v) => { setProfile({ ...profile, iban: v.toUpperCase().replace(/\s/g, '') }); setIbanError(null); }} onBlur={() => { if (profile.iban) { const r = validateIBAN(profile.iban); if (!r.valid) setIbanError(r.error || 'IBAN non valido'); else { setIbanError(null); setProfile({ ...profile, iban: formatIBAN(profile.iban) }); } } }} autoCapitalize="characters" placeholderTextColor="#94a3b8" />
      {ibanError && <Text style={styles.errorText}>⚠️ {ibanError}</Text>}
      <Text style={styles.label}>{t('profile.swiftBic')}</Text>
      <TextInput style={styles.input} placeholder={t('profile.swiftBic')} value={profile.swift_bic || ''} onChangeText={(v) => setProfile({ ...profile, swift_bic: v })} placeholderTextColor="#94a3b8" />
      <Text style={styles.label}>{t('messages.address')}</Text>
      <TextInput style={styles.input} placeholder={t('messages.address')} value={profile.address || ''} onChangeText={(v) => setProfile({ ...profile, address: v })} placeholderTextColor="#94a3b8" />
      <Text style={styles.label}>{t('messages.city')}</Text>
      <TextInput style={styles.input} placeholder={t('messages.city')} value={profile.city || ''} onChangeText={(v) => setProfile({ ...profile, city: v })} placeholderTextColor="#94a3b8" />
      <Text style={styles.label}>{t('messages.postalCode')}</Text>
      <TextInput style={styles.input} placeholder={t('messages.postalCode')} value={profile.postal_code || ''} onChangeText={(v) => setProfile({ ...profile, postal_code: v })} placeholderTextColor="#94a3b8" />
      <Text style={styles.label}>{t('profile.vatPercent')}</Text>
      <TextInput keyboardType="numeric" style={styles.input} placeholder={t('profile.vatPercent')} value={String(profile.vat_percent ?? 22)} onChangeText={(v) => setProfile({ ...profile, vat_percent: parseFloat(v || '22') })} placeholderTextColor="#94a3b8" />
      <Text style={styles.label}>{t('profile.materialMarkupVAT')}</Text>
      <TextInput keyboardType="numeric" style={styles.input} placeholder={t('profile.materialMarkupVAT')} value={String(profile.material_markup_vat_percent || 0)} onChangeText={(v) => setProfile({ ...profile, material_markup_vat_percent: parseFloat(v || '0') })} placeholderTextColor="#94a3b8" />
      
      {/* Punto 21: Dynamic Fiscal Fields */}
      {fiscalConfig.fields.length > 0 && (
        <View style={styles.fiscalSection}>
          <Text style={styles.sectionTitle}>📋 Campi fiscali ({fiscalConfig.countryCode})</Text>
          {fiscalConfig.fields.map((field: FiscalField) => (
            <View key={field.key}>
              <Text style={styles.label}>{field.label}{field.required ? ' *' : ''}</Text>
              <TextInput style={styles.input} placeholder={field.placeholder || field.label} value={profile[field.key] || ''} onChangeText={(v) => setProfile({ ...profile, [field.key]: v })} placeholderTextColor="#94a3b8" />
            </View>
          ))}
          {fiscalConfig.reverseChargeApplicable && (
            <Text style={styles.fiscalHint}>⚡ Reverse charge disponibile per operazioni intra-UE</Text>
          )}
          {fiscalConfig.electronicInvoicingRequired && fiscalConfig.electronicInvoicingSystem && (
            <Text style={styles.fiscalHint}>📄 Fatturazione elettronica: {fiscalConfig.electronicInvoicingSystem}</Text>
          )}
        </View>
      )}

      {/* Punto 44: Time Savings Widget */}
      {timeSavedStats ? (
        <View style={styles.timeSavedWidget}>
          <Text style={styles.timeSavedTitle}>⏱️ Tempo risparmiato</Text>
          <Text style={styles.timeSavedValue}>{timeSavedStats}</Text>
        </View>
      ) : null}

      <Text style={styles.label}>Template Preventivo Personalizzato</Text>
      <View style={styles.templateSection}>
        {profile.custom_template_html ? (
          <View>
            <Text style={styles.templateInfo}>✓ Template personalizzato caricato ({(profile.custom_template_html.length / 1024).toFixed(1)} KB)</Text>
            <View style={styles.templateButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handleUploadTemplate}>
                <Text style={styles.btnText}>Sostituisci Template</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleRemoveTemplate}>
                <Text style={styles.btnText}>Rimuovi</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={[styles.btn, styles.btnOutline]} onPress={handleUploadTemplate}>
            <Text style={styles.btnOutlineText}>📄 Carica Template HTML</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.templateHint}>Carica un file HTML con placeholder come {'{{lavoroTitle}}'}, {'{{clienteName}}'}, {'{{items}}'}, {'{{total}}'}, ecc.</Text>
      </View>

      {/* Punto 25: US State Picker (only shown for US country) */}
      {(profile.country_code || '').toUpperCase() === 'US' && (
        <View style={styles.sectionBox}>
          <Text style={[styles.sectionTitle, { color: '#1e40af' }]}>🇺🇸 US Sales Tax State</Text>
          <TouchableOpacity style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border }]} onPress={() => setShowUsStatePicker(!showUsStatePicker)}>
            <Text style={{ color: colors.text }}>{usState ? `${usState} (${US_STATE_TAX_RATES[usState] || 0}%)` : 'Seleziona stato'}</Text>
          </TouchableOpacity>
          {showUsStatePicker && (
            <View style={{ maxHeight: 200 }}>
              <FlatList
                data={Object.entries(US_STATE_TAX_RATES).map(([code, rate]) => ({ code, rate }))}
                keyExtractor={item => item.code}
                renderItem={({ item }) => (
                  <TouchableOpacity onPress={() => { setUsState(item.code); setShowUsStatePicker(false); }} style={[styles.langItem, { borderBottomColor: colors.border }, usState === item.code && styles.langItemSelected]}>
                    <Text style={[{ color: colors.text }, usState === item.code ? styles.langItemSelectedText : undefined]}>{item.code} — {item.rate}%</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
        </View>
      )}

      {/* Punto 35: Referral Program */}
      {profile.referral_code && (
        <View style={[styles.sectionBox, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
          <Text style={{ fontWeight: '700', marginBottom: 8, fontSize: 16 }}>🎁 Programma Referral</Text>
          <Text style={{ color: '#334155' }}>Il tuo codice: <Text style={{ fontWeight: '700' }}>{profile.referral_code}</Text></Text>
          <TouchableOpacity onPress={() => {
            const link = `https://quoteapp.it/register?ref=${profile.referral_code}`;
            Alert.alert('Link Referral', link);
          }}>
            <Text style={{ color: '#dc2626', marginTop: 8, fontWeight: '600' }}>📋 Mostra link invito</Text>
          </TouchableOpacity>
          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
            Guadagna il 20% su ogni abbonamento tramite il tuo link.
          </Text>
          {referralStats.total > 0 && (
            <Text style={{ color: '#334155', marginTop: 8, fontSize: 13 }}>
              👥 {referralStats.total} invitati · {referralStats.converted} convertiti
            </Text>
          )}
        </View>
      )}

      {/* Punto 14: Command Mappings Review */}
      <TouchableOpacity onPress={() => setShowMappingsSection(!showMappingsSection)} style={styles.sectionHeader}>
        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>🎤 Mappature comandi vocali ({commandMappings.length})</Text>
        <Text style={{ color: colors.textSecondary }}>{showMappingsSection ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {showMappingsSection && commandMappings.length > 0 && (
        <View style={[styles.sectionBox, { marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
          {commandMappings.map(m => (
            <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, color: colors.text }}>"{m.raw_text}" → {m.mapped_description}</Text>
                <Text style={{ fontSize: 11, color: '#94a3b8' }}>Usato {m.usage_count}x</Text>
              </View>
              <TouchableOpacity onPress={() => handleDeleteMapping(m.id)}>
                <Text style={{ fontSize: 18, color: '#ef4444' }}>🗑</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Punto 41: Team Management - solo per abbonamento team */}
      {profile.subscription_status === 'team' && <>
      <TouchableOpacity onPress={() => setShowTeamSection(!showTeamSection)} style={styles.sectionHeader}>
        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>👥 Team ({teamMembers.length}/{TEAM_MEMBERS_INCLUDED} inclusi{teamMembers.length > TEAM_MEMBERS_INCLUDED ? ` + ${teamMembers.length - TEAM_MEMBERS_INCLUDED} extra` : ''})</Text>
        <Text style={{ color: colors.textSecondary }}>{showTeamSection ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {showTeamSection && (
        <View style={[styles.sectionBox, { marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
          {teamMembers.length > TEAM_MEMBERS_INCLUDED && (
            <View style={{ backgroundColor: '#fef3c7', padding: 10, borderRadius: 8, marginBottom: 12 }}>
              <Text style={{ color: '#92400e', fontSize: 13, fontWeight: '600' }}>
                💰 {teamMembers.length - TEAM_MEMBERS_INCLUDED} {teamMembers.length - TEAM_MEMBERS_INCLUDED === 1 ? 'membro extra' : 'membri extra'} — €{((teamMembers.length - TEAM_MEMBERS_INCLUDED) * EXTRA_MEMBER_PRICE).toFixed(2)}/mese
              </Text>
            </View>
          )}
          {teamMembers.map(m => (
            <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
              <View>
                <Text style={{ fontSize: 14, color: colors.text }}>{m.member?.email || 'N/A'}</Text>
                <Text style={{ fontSize: 12, color: '#64748b' }}>{m.role}</Text>
              </View>
              <TouchableOpacity onPress={() => handleRemoveTeamMember(m.id)}>
                <Text style={{ fontSize: 18, color: '#ef4444' }}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <Text style={{ marginTop: 12, marginBottom: 6, fontWeight: '600', color: colors.text }}>Invita membro</Text>
          <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder="email@example.com" value={inviteEmail} onChangeText={setInviteEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.textTertiary} />
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            {['admin', 'technician', 'readonly'].map(role => (
              <TouchableOpacity key={role} onPress={() => setInviteRole(role)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: inviteRole === role ? '#dc2626' : '#f1f5f9' }}>
                <Text style={{ color: inviteRole === role ? '#fff' : '#374151', fontSize: 12, fontWeight: '600' }}>{role}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[styles.btn, { marginBottom: 0 }]} onPress={handleInviteMember}>
            <Text style={styles.btnText}>Invita</Text>
          </TouchableOpacity>
        </View>
      )}
      </>}

      {/* Punto 43: Webhooks - solo per abbonamento pro/team */}
      {(profile.subscription_status === 'active' || profile.subscription_status === 'team') && <View style={[styles.sectionBox, { marginTop: 16 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>🔗 Webhook / Integrazioni</Text>
          <TouchableOpacity onPress={() => setShowWebhookModal(true)}>
            <Text style={{ color: '#dc2626', fontWeight: '600' }}>➕ Aggiungi</Text>
          </TouchableOpacity>
        </View>
        {webhooks.map(w => (
          <View key={w.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, color: colors.text }} numberOfLines={1}>{w.url}</Text>
              <Text style={{ fontSize: 11, color: '#94a3b8' }}>{(w.events || []).join(', ')}</Text>
            </View>
            <TouchableOpacity onPress={() => handleDeleteWebhook(w.id)}>
              <Text style={{ fontSize: 18, color: '#ef4444' }}>🗑</Text>
            </TouchableOpacity>
          </View>
        ))}
        {webhooks.length === 0 && <Text style={{ color: '#94a3b8', fontSize: 13 }}>Nessun webhook configurato</Text>}
      </View>}

      {/* Punto 43: Add Webhook Modal */}
      <Modal visible={showWebhookModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Nuovo Webhook</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder="https://hooks.zapier.com/..." value={newWebhookUrl} onChangeText={setNewWebhookUrl} autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.textTertiary} />
            <Text style={{ marginBottom: 8, fontWeight: '600', color: colors.text }}>Eventi:</Text>
            {['quote_approved', 'quote_sent', 'client_created'].map(evt => (
              <TouchableOpacity key={evt} onPress={() => {
                setNewWebhookEvents(prev => prev.includes(evt) ? prev.filter(e => e !== evt) : [...prev, evt]);
              }} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 18, marginRight: 8 }}>{newWebhookEvents.includes(evt) ? '☑️' : '⬜'}</Text>
                <Text style={{ color: colors.text }}>{evt}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={[styles.btn, styles.btnSecondary, { flex: 1 }]} onPress={() => setShowWebhookModal(false)}>
                <Text style={styles.btnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, { flex: 1 }]} onPress={handleAddWebhook}>
                <Text style={styles.btnText}>Salva</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Punto 27: GDPR Data Export & Delete */}
      <View style={[styles.sectionBox, { marginTop: 16, backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
        <Text style={{ fontWeight: '700', fontSize: 16, color: '#991b1b', marginBottom: 12 }}>🔒 Privacy & GDPR</Text>
        <TouchableOpacity style={[styles.btn, { backgroundColor: '#1e40af', marginBottom: 12 }]} onPress={handleExportMyData}>
          <Text style={styles.btnText}>📥 Esporta i miei dati</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={handleDeleteAccount}>
          <Text style={styles.btnText}>🗑 Elimina account</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.btn, styles.btnSubscription]} onPress={() => (navigation as any).navigate('Subscription')}>
        <Text style={styles.btnText}>{t('navigation.subscription') || 'Abbonamento'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.btn, saving && styles.disabled]} onPress={handleSave} disabled={saving}>
        <Text style={styles.btnText}>{saving ? t('buttons.loading') : t('buttons.save')}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', padding: 24 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 24 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 16, justifyContent: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 24, maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  langItem: { padding: 12, borderRadius: 8, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  langItemSelected: { backgroundColor: '#dc2626' },
  langItemSelectedText: { color: '#fff' },
  templateSection: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, marginBottom: 20 },
  templateInfo: { fontSize: 14, color: '#059669', marginBottom: 12, fontWeight: '600' },
  templateButtons: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  templateHint: { fontSize: 12, color: '#64748b', marginTop: 8, lineHeight: 18 },
  btn: { backgroundColor: '#dc2626', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  btnSubscription: { backgroundColor: '#0f172a', marginBottom: 12 },
  btnSecondary: { backgroundColor: '#64748b', flex: 1 },
  btnDanger: { backgroundColor: '#ef4444', flex: 1 },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 2, borderColor: '#dc2626' },
  btnOutlineText: { color: '#dc2626', fontWeight: '600', fontSize: 16 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.6 },
  inputError: { borderColor: '#ef4444', borderWidth: 2 },
  errorText: { color: '#ef4444', fontSize: 12, marginTop: -12, marginBottom: 12, marginLeft: 4 },
  fiscalSection: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', borderRadius: 12, padding: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 12, color: '#166534' },
  fiscalHint: { fontSize: 12, color: '#059669', fontStyle: 'italic', marginTop: 4 },
  timeSavedWidget: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 12, padding: 16, marginBottom: 20 },
  timeSavedTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e40af', marginBottom: 4 },
  timeSavedValue: { fontSize: 14, color: '#1e3a5f' },
  sectionBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, marginTop: 16, marginBottom: 0 },
});
