import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';
import { buildWebApiUrl, isWebApiConfigured } from '../lib/webApi';

type Listino = { id: string; name: string };

type ListinoItem = {
  id: string;
  description: string;
  unit_price: number;
  markup_percent?: number | null;
  category?: string | null;
};

type PricingRule = {
  id: string;
  rule_key: string;
  label: string;
  reference_unit: string;
  reference_price: number;
  source_label?: string | null;
  source_url?: string | null;
  active: boolean;
};

type UploadPayload = {
  error?: string;
  summary?: {
    totalRows?: number;
    parsedRows?: number;
    normalizedPriceRows?: number;
    unitDetectedRows?: number;
  };
  pricingDiagnostics?: {
    resolvedFromFile?: number;
    resolvedFromDerived?: number;
    resolvedFromRule?: number;
    unresolved?: number;
    recommendedRules?: Array<{ label?: string; reference_unit?: string }>;
  };
  sourceDiagnostics?: Array<{
    sourceName?: string;
    selected?: boolean;
    reason?: string | null;
  }>;
};

const RULE_PRESETS = [
  { rule_key: 'metal_ferrous', label: 'Ferro / acciaio', reference_unit: 'kg' },
  { rule_key: 'metal_nonferrous', label: 'Rame / metalli non ferrosi', reference_unit: 'kg' },
  { rule_key: 'electric_cable', label: 'Cavi elettrici', reference_unit: 'm' },
  { rule_key: 'piping', label: 'Tubazioni / raccordi', reference_unit: 'm' },
  { rule_key: 'paint_chemical', label: 'Vernici / chimici', reference_unit: 'l' },
  { rule_key: 'wood_panel', label: 'Legno / pannelli', reference_unit: 'm2' },
];

function inferMimeType(name: string, mimeType?: string | null): string {
  if (mimeType) return mimeType;
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return 'text/csv';
  if (ext === 'txt') return 'text/plain';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

function sanitizeUploadFileName(name?: string | null, fallbackExt?: string): string {
  const trimmed = String(name || '').trim();
  const cleaned = trimmed
    .replace(/[^\w.\-() ]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned) {
    return cleaned;
  }

  const ext = fallbackExt?.trim().replace(/^\./, '');
  return ext ? `import-${Date.now()}.${ext}` : `import-${Date.now()}`;
}

function summarizeRecommendedRules(payload?: UploadPayload): string {
  const rules = payload?.pricingDiagnostics?.recommendedRules || [];
  const summary = rules
    .slice(0, 3)
    .map((rule) => {
      const label = rule.label?.trim();
      const unit = rule.reference_unit?.trim();
      if (!label) return null;
      return unit ? `${label} (${unit})` : label;
    })
    .filter(Boolean);

  return summary.length ? summary.join(', ') : '';
}

function buildUploadErrorMessage(payload?: UploadPayload): string {
  const base = payload?.error || 'Import non riuscito';
  const summary = payload?.summary;
  const summaryLabel =
    summary?.parsedRows !== undefined && summary?.totalRows !== undefined
      ? ` (${summary.parsedRows}/${summary.totalRows} righe importabili)`
      : '';
  const pricing = payload?.pricingDiagnostics;
  const unresolvedLabel = pricing?.unresolved ? `\nSenza prezzo: ${pricing.unresolved}` : '';
  const rules = summarizeRecommendedRules(payload);
  const rulesLabel = rules ? `\nRegole utili: ${rules}` : '';
  const skippedSources = (payload?.sourceDiagnostics || [])
    .filter((source) => !source.selected && source.sourceName)
    .slice(0, 3)
    .map((source) => `${source.sourceName}${source.reason ? `: ${source.reason}` : ''}`);
  const skippedLabel = skippedSources.length ? `\nFogli ignorati: ${skippedSources.join(' | ')}` : '';

  return `${base}${summaryLabel}${unresolvedLabel}${rulesLabel}${skippedLabel}`;
}

function buildUploadSuccessMessage(payload?: UploadPayload): string {
  const summary = payload?.summary;
  const pricing = payload?.pricingDiagnostics;
  const selectedSources = (payload?.sourceDiagnostics || [])
    .filter((source) => source.selected && source.sourceName)
    .map((source) => source.sourceName);

  const lines = [
    summary?.parsedRows !== undefined && summary?.totalRows !== undefined
      ? `${summary.parsedRows}/${summary.totalRows} voci importate`
      : null,
    summary?.normalizedPriceRows !== undefined ? `Prezzi normalizzati: ${summary.normalizedPriceRows}` : null,
    summary?.unitDetectedRows !== undefined ? `Unità rilevate: ${summary.unitDetectedRows}` : null,
    pricing
      ? `Da file: ${pricing.resolvedFromFile || 0} · derivati: ${pricing.resolvedFromDerived || 0} · regole: ${pricing.resolvedFromRule || 0} · senza prezzo: ${pricing.unresolved || 0}`
      : null,
    selectedSources.length ? `Sorgenti usate: ${selectedSources.join(', ')}` : null,
  ].filter(Boolean);

  const rules = summarizeRecommendedRules(payload);
  if (rules) {
    lines.push(`Regole consigliate: ${rules}`);
  }

  return lines.join('\n');
}

function parseUploadPayload(body: string): UploadPayload {
  if (!body?.trim()) return {};

  try {
    return JSON.parse(body) as UploadPayload;
  } catch {
    return {
      error: body.trim(),
    };
  }
}

export default function ListiniScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [listini, setListini] = useState<Listino[]>([]);
  const [items, setItems] = useState<ListinoItem[]>([]);
  const [selectedListino, setSelectedListino] = useState<Listino | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileMarkupPercent, setProfileMarkupPercent] = useState<number>(0);

  const [listLoading, setListLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [organizingAi, setOrganizingAi] = useState(false);

  const [showListinoModal, setShowListinoModal] = useState(false);
  const [newListinoName, setNewListinoName] = useState('');
  const [editingListino, setEditingListino] = useState<Listino | null>(null);

  const [showItemModal, setShowItemModal] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('0');
  const [newMarkupPercent, setNewMarkupPercent] = useState('0');
  const [editingItem, setEditingItem] = useState<ListinoItem | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  const [showPricingRulesModal, setShowPricingRulesModal] = useState(false);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [pricingRulesLoading, setPricingRulesLoading] = useState(false);
  const [savingPricingRule, setSavingPricingRule] = useState(false);
  const [editingPricingRuleId, setEditingPricingRuleId] = useState<string | null>(null);
  const [pricingRuleLabel, setPricingRuleLabel] = useState('');
  const [pricingRuleKey, setPricingRuleKey] = useState('custom');
  const [pricingRuleUnit, setPricingRuleUnit] = useState('kg');
  const [pricingRulePrice, setPricingRulePrice] = useState('0');
  const [pricingRuleSourceLabel, setPricingRuleSourceLabel] = useState('');
  const [pricingRuleSourceUrl, setPricingRuleSourceUrl] = useState('');

  const showWebApiConfigAlert = (featureLabel: string) => {
    Alert.alert(
      'Configura URL web',
      `${featureLabel} sul mobile usa gli stessi endpoint del web. Imposta EXPO_PUBLIC_WEB_URL con l'URL del sito pubblicato.`
    );
  };

  const fetchListini = useCallback(async () => {
    setListLoading(true);
    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) return;

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, material_markup_vat_percent')
        .eq('id', user.id)
        .single();
      if (profileErr) throw profileErr;
      if (!profile) return;

      setProfileId(profile.id);
      setProfileMarkupPercent(profile.material_markup_vat_percent ?? 0);

      const { data, error } = await supabase
        .from('listini')
        .select('id, name')
        .eq('profile_id', profile.id)
        .order('name', { ascending: true });
      if (error) throw error;

      const nextListini: Listino[] = data || [];
      setListini(nextListini);
      setSelectedListino((current) => {
        if (!current) return null;
        return nextListini.find((item) => item.id === current.id) || null;
      });
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setListLoading(false);
    }
  }, [t]);

  const fetchItems = useCallback(async (listinoId: string) => {
    setItemsLoading(true);
    try {
      const { data, error } = await supabase
        .from('listini_vettoriali')
        .select('id, description, unit_price, markup_percent, category')
        .eq('listino_id', listinoId)
        .order('description', { ascending: true });
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setItemsLoading(false);
    }
  }, [t]);

  const fetchPricingRules = useCallback(async () => {
    if (!profileId) return;
    setPricingRulesLoading(true);
    try {
      const { data, error } = await supabase
        .from('pricing_reference_rules')
        .select('id, rule_key, label, reference_unit, reference_price, source_label, source_url, active')
        .eq('profile_id', profileId)
        .order('label', { ascending: true });
      if (error) throw error;
      setPricingRules(data || []);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setPricingRulesLoading(false);
    }
  }, [profileId, t]);

  useFocusEffect(
    useCallback(() => {
      fetchListini();
      if (selectedListino?.id) {
        fetchItems(selectedListino.id);
      }
    }, [fetchItems, fetchListini, selectedListino?.id])
  );

  useEffect(() => {
    if (!selectedListino?.id) {
      setItems([]);
      return;
    }
    fetchItems(selectedListino.id);
  }, [fetchItems, selectedListino?.id]);

  useEffect(() => {
    if (!profileId) return;

    const channel = supabase
      .channel(`mobile-listini-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listini', filter: `profile_id=eq.${profileId}` }, () => {
        fetchListini();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listini_vettoriali' }, () => {
        if (selectedListino?.id) {
          fetchItems(selectedListino.id);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing_reference_rules', filter: `profile_id=eq.${profileId}` }, () => {
        if (showPricingRulesModal) {
          fetchPricingRules();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems, fetchListini, fetchPricingRules, profileId, selectedListino?.id, showPricingRulesModal]);

  const resetListinoForm = () => {
    setEditingListino(null);
    setNewListinoName('');
  };

  const resetItemForm = () => {
    setEditingItem(null);
    setNewDescription('');
    setNewUnitPrice('0');
    setNewMarkupPercent(String(profileMarkupPercent || 0));
  };

  const resetPricingRuleForm = () => {
    setEditingPricingRuleId(null);
    setPricingRuleLabel('');
    setPricingRuleKey('custom');
    setPricingRuleUnit('kg');
    setPricingRulePrice('0');
    setPricingRuleSourceLabel('');
    setPricingRuleSourceUrl('');
  };

  const handleCreateOrUpdateListino = async () => {
    const name = newListinoName.trim();
    if (!name || !profileId) {
      Alert.alert(t('messages.error'), t('listini.promptNewListino') || 'Inserisci il nome del listino');
      return;
    }

    try {
      if (editingListino) {
        const { error } = await supabase.from('listini').update({ name }).eq('id', editingListino.id);
        if (error) throw error;
        if (selectedListino?.id === editingListino.id) {
          setSelectedListino({ id: editingListino.id, name });
        }
      } else {
        const { error } = await supabase.from('listini').insert({ profile_id: profileId, name });
        if (error) throw error;
      }

      setShowListinoModal(false);
      resetListinoForm();
      await fetchListini();
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const handleDeleteListino = async (listinoId: string) => {
    Alert.alert(t('actions.deleteConfirm'), '', [
      { text: t('buttons.cancel'), style: 'cancel' },
      {
        text: t('actions.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('listini').delete().eq('id', listinoId);
            if (error) throw error;
            if (selectedListino?.id === listinoId) {
              setSelectedListino(null);
              setItems([]);
            }
            await fetchListini();
          } catch (err) {
            Alert.alert(t('messages.error'), (err as Error).message);
          }
        },
      },
    ]);
  };

  const handleCreateOrUpdateItem = async () => {
    if (!selectedListino || !profileId || !newDescription.trim()) {
      Alert.alert(t('messages.error'), t('listini.description') || 'Inserisci la descrizione');
      return;
    }

    const payload = {
      listino_id: selectedListino.id,
      profile_id: profileId,
      description: newDescription.trim(),
      unit_price: parseFloat(newUnitPrice) || 0,
      markup_percent: parseFloat(newMarkupPercent) || 0,
    };

    setSavingItem(true);
    try {
      if (editingItem) {
        const { error } = await supabase.from('listini_vettoriali').update(payload).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        let embedding: number[] | null = null;
        if (isWebApiConfigured()) {
          try {
            const res = await fetch(buildWebApiUrl('/api/listini/embed'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ description: payload.description }),
            });
            const data = await res.json();
            if (res.ok && Array.isArray(data?.embedding)) {
              embedding = data.embedding as number[];
            }
          } catch (err) {
            console.warn('Embedding generation skipped on mobile:', err);
          }
        }

        const { error } = await supabase.from('listini_vettoriali').insert({
          ...payload,
          embedding,
        });
        if (error) throw error;
      }

      setShowItemModal(false);
      resetItemForm();
      await fetchItems(selectedListino.id);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setSavingItem(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    Alert.alert(t('actions.deleteConfirm'), '', [
      { text: t('buttons.cancel'), style: 'cancel' },
      {
        text: t('actions.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('listini_vettoriali').delete().eq('id', itemId);
            if (error) throw error;
            if (selectedListino) {
              await fetchItems(selectedListino.id);
            }
          } catch (err) {
            Alert.alert(t('messages.error'), (err as Error).message);
          }
        },
      },
    ]);
  };

  const runAiOrganize = async (
    listinoId: string,
    options?: { silentSuccess?: boolean; suppressErrorAlert?: boolean }
  ) => {
    if (!profileId) return null;
    if (!isWebApiConfigured()) {
      throw new Error("Manca EXPO_PUBLIC_WEB_URL per usare l'organizzazione AI sul mobile.");
    }

    setOrganizingAi(true);
    try {
      const res = await fetch(buildWebApiUrl('/api/listini/ai-organize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listinoId, profileId }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Organizzazione AI non riuscita');
      }

      await fetchItems(listinoId);

      if (!options?.silentSuccess) {
        Alert.alert('AI completata', `${payload.updatedCount || 0} voci aggiornate`);
      }

      return payload;
    } catch (err) {
      if (!options?.suppressErrorAlert) {
        Alert.alert(t('messages.error'), (err as Error).message);
      }
      throw err;
    } finally {
      setOrganizingAi(false);
    }
  };

  const handleOrganizeWithAi = async () => {
    if (!selectedListino) return;
    if (!isWebApiConfigured()) {
      showWebApiConfigAlert("L'organizzazione AI");
      return;
    }
    await runAiOrganize(selectedListino.id);
  };

  const handleImportFile = async () => {
    if (!selectedListino || !profileId) return;
    if (!isWebApiConfigured()) {
      showWebApiConfigAlert("L'import avanzato");
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'text/csv',
          'text/plain',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/pdf',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const mimeType = inferMimeType(asset.name || '', asset.mimeType);
      const fileName = sanitizeUploadFileName(
        asset.name,
        mimeType === 'application/pdf'
          ? 'pdf'
          : mimeType === 'application/vnd.ms-excel'
            ? 'xls'
            : mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              ? 'xlsx'
              : mimeType === 'text/plain'
                ? 'txt'
                : 'csv'
      );

      const fileInfo = await FileSystem.getInfoAsync(asset.uri);
      if (!fileInfo.exists) {
        throw new Error('Il file selezionato non e piu disponibile sul dispositivo. Riprova scegliendolo di nuovo.');
      }

      setUploading(true);
      const response = await FileSystem.uploadAsync(buildWebApiUrl('/api/listini/upload'), asset.uri, {
        fieldName: 'file',
        httpMethod: 'POST',
        mimeType,
        parameters: {
          profileId,
          listinoId: selectedListino.id,
          originalFileName: fileName,
        },
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      });

      const payload = parseUploadPayload(response.body);
      if (response.status < 200 || response.status >= 300) {
        throw new Error(buildUploadErrorMessage(payload));
      }

      let aiLine = 'Organizzazione AI avviata automaticamente.';
      try {
        const aiPayload = await runAiOrganize(selectedListino.id, {
          silentSuccess: true,
          suppressErrorAlert: true,
        });
        aiLine = `AI completata: ${aiPayload?.updatedCount || 0} voci aggiornate.`;
      } catch (err) {
        aiLine = `Import completato, ma AI non riuscita: ${(err as Error).message}`;
      }

      await fetchItems(selectedListino.id);
      Alert.alert('Import completato', `${buildUploadSuccessMessage(payload)}\n${aiLine}`);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const openPricingRulesModal = async () => {
    setShowPricingRulesModal(true);
    resetPricingRuleForm();
    await fetchPricingRules();
  };

  const handleApplyPreset = (preset: { rule_key: string; label: string; reference_unit: string }) => {
    setPricingRuleKey(preset.rule_key);
    setPricingRuleLabel(preset.label);
    setPricingRuleUnit(preset.reference_unit);
  };

  const handleEditPricingRule = (rule: PricingRule) => {
    setEditingPricingRuleId(rule.id);
    setPricingRuleKey(rule.rule_key);
    setPricingRuleLabel(rule.label);
    setPricingRuleUnit(rule.reference_unit);
    setPricingRulePrice(String(rule.reference_price));
    setPricingRuleSourceLabel(rule.source_label || '');
    setPricingRuleSourceUrl(rule.source_url || '');
  };

  const handleSavePricingRule = async () => {
    if (!profileId) return;

    const label = pricingRuleLabel.trim();
    if (!label) {
      Alert.alert(t('messages.error'), 'Inserisci il nome della regola');
      return;
    }

    setSavingPricingRule(true);
    try {
      const payload = {
        profile_id: profileId,
        rule_key: pricingRuleKey.trim() || 'custom',
        label,
        reference_unit: pricingRuleUnit.trim() || 'kg',
        reference_price: parseFloat(pricingRulePrice) || 0,
        source_label: pricingRuleSourceLabel.trim() || null,
        source_url: pricingRuleSourceUrl.trim() || null,
        active: true,
      };

      const query = editingPricingRuleId
        ? supabase.from('pricing_reference_rules').update(payload).eq('id', editingPricingRuleId)
        : supabase.from('pricing_reference_rules').insert(payload);

      const { error } = await query;
      if (error) throw error;

      resetPricingRuleForm();
      await fetchPricingRules();
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setSavingPricingRule(false);
    }
  };

  const handleDeletePricingRule = async (ruleId: string) => {
    Alert.alert('Eliminare questa regola prezzo?', '', [
      { text: t('buttons.cancel'), style: 'cancel' },
      {
        text: t('actions.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase.from('pricing_reference_rules').delete().eq('id', ruleId);
            if (error) throw error;
            await fetchPricingRules();
          } catch (err) {
            Alert.alert(t('messages.error'), (err as Error).message);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('main.listini')}</Text>

      <View style={styles.topActions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => {
            resetListinoForm();
            setShowListinoModal(true);
          }}
        >
          <Text style={styles.actionBtnText}>{t('listini.newListino') || 'Nuovo listino'}</Text>
        </TouchableOpacity>

        {selectedListino && (
          <>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: colors.primary, opacity: uploading ? 0.8 : 1 }]}
              onPress={handleImportFile}
              disabled={uploading || organizingAi}
            >
              <Text style={styles.actionBtnText}>{uploading ? 'Import in corso...' : 'Carica CSV/Excel/PDF'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtnSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={openPricingRulesModal}
              disabled={uploading || organizingAi}
            >
              <Text style={[styles.actionBtnSecondaryText, { color: colors.text }]}>Regole prezzo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtnSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={handleOrganizeWithAi}
              disabled={uploading || organizingAi}
            >
              <Text style={[styles.actionBtnSecondaryText, { color: colors.text }]}>
                {organizingAi ? 'AI in corso...' : 'Riorganizza con AI'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtnSecondary, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => {
                resetItemForm();
                setShowItemModal(true);
              }}
              disabled={uploading || organizingAi}
            >
              <Text style={[styles.actionBtnSecondaryText, { color: colors.text }]}>
                {t('listini.addManual') || 'Aggiungi manualmente'}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {!isWebApiConfigured() && (
        <View style={[styles.noticeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.noticeTitle, { color: colors.text }]}>Parità web/mobile</Text>
          <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
            Per usare import avanzato, PDF e organizzazione AI anche sul mobile, imposta `EXPO_PUBLIC_WEB_URL`
            con l'URL del sito web.
          </Text>
        </View>
      )}

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{t('main.listini')}</Text>
            {listLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>

          <FlatList
            data={listini}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text style={[styles.placeholder, { color: colors.textTertiary }]}>
                Nessun listino disponibile.
              </Text>
            }
            renderItem={({ item }) => {
              const selected = selectedListino?.id === item.id;
              return (
                <View
                  style={[
                    styles.listinoItemRow,
                    { backgroundColor: selected ? colors.primary : 'transparent' },
                  ]}
                >
                  <TouchableOpacity style={styles.listinoNameWrap} onPress={() => setSelectedListino(item)}>
                    <Text style={selected ? styles.listinoSelectedText : [styles.listinoText, { color: colors.text }]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.rowActions}>
                    <TouchableOpacity
                      onPress={() => {
                        setEditingListino(item);
                        setNewListinoName(item.name);
                        setShowListinoModal(true);
                      }}
                    >
                      <Text style={selected ? styles.listinoSelectedText : styles.rowActionText}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteListino(item.id)}>
                      <Text style={selected ? styles.listinoSelectedText : styles.rowActionText}>🗑️</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        </View>

        <View style={[styles.card, styles.itemsCard, { backgroundColor: colors.card, shadowColor: colors.cardShadow }]}>
          {selectedListino ? (
            <>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>{selectedListino.name}</Text>
                {(itemsLoading || uploading || organizingAi) ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : null}
              </View>

              <FlatList
                data={items}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                  <Text style={[styles.placeholder, { color: colors.textTertiary }]}>
                    Nessuna voce presente nel listino selezionato.
                  </Text>
                }
                renderItem={({ item }) => (
                  <View style={[styles.itemRow, { borderBottomColor: colors.borderLight }]}>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemDesc, { color: colors.text }]}>{item.description}</Text>
                      <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
                        €{Number(item.unit_price).toFixed(2)} · {Number(item.markup_percent || 0).toFixed(0)}%
                      </Text>
                      {item.category ? (
                        <Text style={[styles.itemCategory, { color: colors.textSecondary }]}>
                          {item.category}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.rowActions}>
                      <TouchableOpacity
                        onPress={() => {
                          setEditingItem(item);
                          setNewDescription(item.description);
                          setNewUnitPrice(String(item.unit_price));
                          setNewMarkupPercent(String(item.markup_percent || 0));
                          setShowItemModal(true);
                        }}
                      >
                        <Text style={styles.rowActionText}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteItem(item.id)}>
                        <Text style={styles.rowActionText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
            </>
          ) : (
            <Text style={[styles.placeholder, { color: colors.textTertiary }]}>
              {t('sections.selectListino') || 'Seleziona un listino'}
            </Text>
          )}
        </View>
      </View>

      <Modal visible={showListinoModal} transparent animationType="fade" onRequestClose={() => setShowListinoModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingListino ? (t('actions.edit') || 'Modifica') : (t('listini.newListino') || 'Nuovo listino')}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={newListinoName}
              onChangeText={setNewListinoName}
              placeholder={t('listini.promptNewListino') || 'Nome listino'}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => {
                  setShowListinoModal(false);
                  resetListinoForm();
                }}
              >
                <Text style={styles.modalBtnSecondaryText}>{t('buttons.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleCreateOrUpdateListino}>
                <Text style={styles.modalBtnPrimaryText}>{t('buttons.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showItemModal} transparent animationType="fade" onRequestClose={() => setShowItemModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editingItem ? (t('actions.edit') || 'Modifica voce') : (t('listini.newItem') || 'Nuova voce')}
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder={t('listini.description') || 'Descrizione'}
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={newUnitPrice}
              onChangeText={setNewUnitPrice}
              keyboardType="decimal-pad"
              placeholder={t('listini.price') || 'Prezzo'}
              placeholderTextColor={colors.textTertiary}
            />
            <TextInput
              style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
              value={newMarkupPercent}
              onChangeText={setNewMarkupPercent}
              keyboardType="decimal-pad"
              placeholder={t('listini.markup') || 'Markup %'}
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity
                style={styles.modalBtnSecondary}
                onPress={() => {
                  setShowItemModal(false);
                  resetItemForm();
                }}
                disabled={savingItem}
              >
                <Text style={styles.modalBtnSecondaryText}>{t('buttons.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtnPrimary} onPress={handleCreateOrUpdateItem} disabled={savingItem}>
                <Text style={styles.modalBtnPrimaryText}>
                  {savingItem ? '...' : t('buttons.save')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showPricingRulesModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPricingRulesModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalLarge, { backgroundColor: colors.modalBg }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.pricingHeader}>
                <View style={styles.pricingHeaderText}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Regole prezzo di riferimento</Text>
                  <Text style={[styles.pricingHint, { color: colors.textSecondary }]}>
                    Servono per i file senza prezzo diretto ma con peso, metri o altre misure.
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    setShowPricingRulesModal(false);
                    resetPricingRuleForm();
                  }}
                >
                  <Text style={[styles.closeText, { color: colors.textSecondary }]}>Chiudi</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.sectionTitle, { color: colors.text }]}>Preset rapidi</Text>
              <View style={styles.presetWrap}>
                {RULE_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.rule_key}
                    style={[styles.presetChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => handleApplyPreset(preset)}
                  >
                    <Text style={[styles.presetText, { color: colors.text }]}>
                      {preset.label} ({preset.reference_unit})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.sectionTitle, { color: colors.text }]}>Modifica regola</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={pricingRuleLabel}
                onChangeText={setPricingRuleLabel}
                placeholder="Nome regola"
                placeholderTextColor={colors.textTertiary}
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={pricingRuleKey}
                onChangeText={setPricingRuleKey}
                placeholder="Chiave regola"
                placeholderTextColor={colors.textTertiary}
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={pricingRuleUnit}
                onChangeText={setPricingRuleUnit}
                placeholder="Unità di riferimento"
                placeholderTextColor={colors.textTertiary}
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={pricingRulePrice}
                onChangeText={setPricingRulePrice}
                keyboardType="decimal-pad"
                placeholder="Prezzo riferimento"
                placeholderTextColor={colors.textTertiary}
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={pricingRuleSourceLabel}
                onChangeText={setPricingRuleSourceLabel}
                placeholder="Fonte"
                placeholderTextColor={colors.textTertiary}
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                value={pricingRuleSourceUrl}
                onChangeText={setPricingRuleSourceUrl}
                placeholder="URL fonte"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
              />

              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={styles.modalBtnSecondary}
                  onPress={resetPricingRuleForm}
                  disabled={savingPricingRule}
                >
                  <Text style={styles.modalBtnSecondaryText}>Pulisci</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalBtnPrimary}
                  onPress={handleSavePricingRule}
                  disabled={savingPricingRule}
                >
                  <Text style={styles.modalBtnPrimaryText}>{savingPricingRule ? '...' : 'Salva regola'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.pricingRulesList}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Regole salvate</Text>
                  {pricingRulesLoading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </View>

                {!pricingRules.length && !pricingRulesLoading ? (
                  <Text style={[styles.placeholder, { color: colors.textTertiary }]}>
                    Nessuna regola salvata.
                  </Text>
                ) : null}

                {pricingRules.map((rule) => (
                  <View key={rule.id} style={[styles.ruleRow, { borderColor: colors.borderLight }]}>
                    <View style={styles.ruleInfo}>
                      <Text style={[styles.ruleLabel, { color: colors.text }]}>
                        {rule.label} ({rule.reference_unit})
                      </Text>
                      <Text style={[styles.ruleMeta, { color: colors.textSecondary }]}>
                        {rule.rule_key} · €{Number(rule.reference_price).toFixed(2)}
                      </Text>
                      {rule.source_label || rule.source_url ? (
                        <Text style={[styles.ruleMeta, { color: colors.textSecondary }]}>
                          {[rule.source_label, rule.source_url].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.rowActions}>
                      <TouchableOpacity onPress={() => handleEditPricingRule(rule)}>
                        <Text style={styles.rowActionText}>✏️</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeletePricingRule(rule.id)}>
                        <Text style={styles.rowActionText}>🗑️</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  topActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  actionBtnText: { color: '#fff', fontWeight: '600' },
  actionBtnSecondary: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  actionBtnSecondaryText: { fontWeight: '600' },
  noticeCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  noticeTitle: { fontWeight: '700', marginBottom: 4 },
  noticeText: { fontSize: 13, lineHeight: 18 },
  content: { flex: 1, gap: 12 },
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemsCard: { flex: 1.4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontWeight: '600', fontSize: 16 },
  listinoItemRow: { padding: 10, borderRadius: 10, marginBottom: 6, flexDirection: 'row', alignItems: 'center' },
  listinoNameWrap: { flex: 1 },
  listinoText: { fontSize: 14 },
  listinoSelectedText: { color: '#fff', fontWeight: '600' },
  rowActions: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  rowActionText: { fontSize: 16 },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemDesc: { fontSize: 14, fontWeight: '500' },
  itemMeta: { fontSize: 12, marginTop: 3 },
  itemCategory: { fontSize: 12, marginTop: 2 },
  placeholder: { fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 16, padding: 20 },
  modalLarge: { borderRadius: 16, padding: 20, maxHeight: '90%' },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  modalBtnPrimary: { flex: 1, backgroundColor: '#dc2626', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnPrimaryText: { color: '#fff', fontWeight: '600' },
  modalBtnSecondary: { flex: 1, backgroundColor: '#e2e8f0', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnSecondaryText: { color: '#334155', fontWeight: '600' },
  pricingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  pricingHeaderText: { flex: 1 },
  pricingHint: { fontSize: 13, lineHeight: 18 },
  closeText: { fontWeight: '600' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  presetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  presetChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  presetText: { fontSize: 12, fontWeight: '500' },
  pricingRulesList: { marginTop: 10 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  ruleInfo: { flex: 1, paddingRight: 12 },
  ruleLabel: { fontSize: 14, fontWeight: '600' },
  ruleMeta: { fontSize: 12, marginTop: 2 },
});
