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
  View,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActionSheet,
  BottomActionBar,
  BottomTabBar,
  DangerButton,
  EmptyState,
  HeaderBack,
  ListGroup,
  ListRow,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  TertiaryButton,
  TextField,
  formatMoney,
  radius,
  space,
  ufficio,
  type SheetAction,
  type SheetDestructive,
} from '../components/ui';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';
import { buildWebApiUrl, getWebApiAuthHeaders, isWebApiConfigured } from '../lib/webApi';
import { fetchAccessibleListini, type Listino } from '../lib/teamListini';

type ListinoSourceInfo = {
  fileName: string;
  mimeType: string;
  uploadedAt: string;
  aiFeedback?: string | null;
  parsedSummary?: {
    totalRows?: number;
    parsedRows?: number;
    normalizedPriceRows?: number;
    unitDetectedRows?: number;
    pendingReferenceRows?: number;
  } | null;
  pricingDiagnostics?: {
    resolvedFromFile?: number;
    resolvedFromDerived?: number;
    resolvedFromRule?: number;
    unresolved?: number;
    recommendedRules?: Array<{ label?: string; reference_unit?: string }>;
  } | null;
  sourceDiagnostics?: Array<{
    sourceName?: string;
    selected?: boolean;
    reason?: string | null;
  }>;
  requiresPricingRules?: boolean;
  downloadUrl?: string;
};

type ListinoItem = {
  id: string;
  description: string;
  unit_price: number;
  markup_percent?: number | null;
  category?: string | null;
};

type UploadPayload = {
  error?: string;
  warning?: string;
  inserted?: number;
  updated?: number;
  duplicatesSkipped?: number;
  changes?: {
    increased: number;
    decreased: number;
    unchanged: number;
    missing: number;
    examples: Array<{ description: string; oldPrice: number; newPrice: number }>;
  };
  sourceStored?: boolean;
  aiFeedback?: string | null;
  sourceInfo?: ListinoSourceInfo | null;
  summary?: {
    totalRows?: number;
    parsedRows?: number;
    normalizedPriceRows?: number;
    unitDetectedRows?: number;
    pendingReferenceRows?: number;
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
      ? `${summary.parsedRows}/${summary.totalRows} voci lette dal file`
      : null,
    payload?.inserted !== undefined || payload?.updated !== undefined
      ? `Nuove: ${payload?.inserted || 0} · prezzi aggiornati: ${payload?.updated || 0}${payload?.duplicatesSkipped ? ` · doppioni ignorati: ${payload.duplicatesSkipped}` : ''}`
      : null,
    payload?.changes && (payload.changes.increased || payload.changes.decreased || payload.changes.missing)
      ? `Aumentati: ${payload.changes.increased} · diminuiti: ${payload.changes.decreased} · invariati: ${payload.changes.unchanged}` +
        (payload.changes.missing ? ` · non più nel file: ${payload.changes.missing}` : '')
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

type PricingGroupRow = {
  id?: string;
  name: string;
  reference_unit: string;
  unit_price: number | null;
  item_count: number;
};

function formatGroupPrice(value: number | null): string {
  return value === null || value === undefined ? '' : String(value).replace('.', ',');
}

// Base64 inflates the file by ~33%: above this size the JSON body would exceed
// Vercel's 4.5 MB request limit.
const PDF_BASE64_MAX_BYTES = 3 * 1024 * 1024;

async function uploadPdfToSignedStorage(params: {
  uri: string;
  fileName: string;
  profileId: string;
  listinoId: string;
  contentType?: string;
}): Promise<string> {
  const signedRes = await fetch(buildWebApiUrl('/api/listini/source-upload-url'), {
    method: 'POST',
    headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      profileId: params.profileId,
      listinoId: params.listinoId,
      fileName: params.fileName,
    }),
  });
  const signed = parseUploadPayload(await signedRes.text()) as UploadPayload & {
    signedUrl?: string;
    storagePath?: string;
  };
  if (!signedRes.ok || !signed.signedUrl || !signed.storagePath) {
    throw new Error(signed.error || `URL di caricamento non disponibile (HTTP ${signedRes.status})`);
  }

  const upload = await FileSystem.uploadAsync(signed.signedUrl, params.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': params.contentType || 'application/pdf', 'x-upsert': 'true' },
  });
  if (upload.status < 200 || upload.status >= 300) {
    throw new Error(`Storage HTTP ${upload.status}`);
  }
  return signed.storagePath;
}

async function readFileBase64(uri: string): Promise<string> {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  if (!base64?.trim()) {
    throw new Error('Non sono riuscito a leggere il PDF selezionato.');
  }
  return base64;
}

export default function ListiniScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const [listini, setListini] = useState<Listino[]>([]);
  const [items, setItems] = useState<ListinoItem[]>([]);
  const [selectedListino, setSelectedListino] = useState<Listino | null>(null);
  const [selectedSourceInfo, setSelectedSourceInfo] = useState<ListinoSourceInfo | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileMarkupPercent, setProfileMarkupPercent] = useState<number>(0);

  const [listLoading, setListLoading] = useState(false);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [organizingAi, setOrganizingAi] = useState(false);
  // "Prezzi per forma": only for listini whose PDF has no prices.
  const [pricingGroups, setPricingGroups] = useState<PricingGroupRow[]>([]);
  const [groupPriceDrafts, setGroupPriceDrafts] = useState<Record<string, string>>({});
  const [savingGroupPrices, setSavingGroupPrices] = useState(false);
  // Supplier discount and markup per category.
  const [showPricingSettings, setShowPricingSettings] = useState(false);
  const [discountDraft, setDiscountDraft] = useState('');
  const [categoryMarkupRows, setCategoryMarkupRows] = useState<Array<{ category: string; itemCount: number; markupPercent: number | null }>>([]);
  const [categoryMarkupDrafts, setCategoryMarkupDrafts] = useState<Record<string, string>>({});
  const [savingPricingSettings, setSavingPricingSettings] = useState(false);
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [priceHistory, setPriceHistory] = useState<Array<{ id: string; old_price: number; new_price: number; changed_at: string; description: string }>>([]);

  const [showListinoModal, setShowListinoModal] = useState(false);
  const [newListinoName, setNewListinoName] = useState('');
  const [editingListino, setEditingListino] = useState<Listino | null>(null);

  const [showItemModal, setShowItemModal] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('0');
  const [newMarkupPercent, setNewMarkupPercent] = useState('0');
  const [editingItem, setEditingItem] = useState<ListinoItem | null>(null);
  const [savingItem, setSavingItem] = useState(false);


  const showWebApiConfigAlert = (featureLabel: string) => {
    // Shown to the user: no developer settings, just where to do it.
    Alert.alert('Dal sito', `${featureLabel} si fa dal sito, dal computer.`);
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

      const nextListini = await fetchAccessibleListini(profile.id);
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

  const fetchSourceInfo = useCallback(async (listinoId: string, nextProfileId: string) => {
    if (!isWebApiConfigured()) {
      setSelectedSourceInfo(null);
      return;
    }

    try {
      const res = await fetch(
        buildWebApiUrl(`/api/listini/source?listinoId=${encodeURIComponent(listinoId)}&profileId=${encodeURIComponent(nextProfileId)}`),
        { headers: await getWebApiAuthHeaders() }
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Lettura sorgente non riuscita');
      setSelectedSourceInfo((payload?.sourceInfo as ListinoSourceInfo | null) || null);
    } catch {
      setSelectedSourceInfo(null);
    }

    try {
      const res = await fetch(
        buildWebApiUrl(`/api/listini/pricing-groups?listinoId=${encodeURIComponent(listinoId)}&profileId=${encodeURIComponent(nextProfileId)}`),
        { headers: await getWebApiAuthHeaders() }
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Lettura forme non riuscita');
      const groups = (payload?.groups || []) as PricingGroupRow[];
      setPricingGroups(groups);
      setGroupPriceDrafts(Object.fromEntries(groups.map((group) => [group.name, formatGroupPrice(group.unit_price)])));
    } catch {
      setPricingGroups([]);
      setGroupPriceDrafts({});
    }
  }, []);

  const loadPricingSettings = async () => {
    if (!selectedListino || !profileId) return;
    try {
      const res = await fetch(
        buildWebApiUrl(`/api/listini/settings?listinoId=${encodeURIComponent(selectedListino.id)}&profileId=${encodeURIComponent(profileId)}`),
        { headers: await getWebApiAuthHeaders() }
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Lettura impostazioni non riuscita');
      setDiscountDraft(formatGroupPrice(payload.supplierDiscountPercent || null));
      setCategoryMarkupRows(payload.categories || []);
      setCategoryMarkupDrafts(
        Object.fromEntries((payload.categories || []).map((row: { category: string; markupPercent: number | null }) => [row.category, formatGroupPrice(row.markupPercent)]))
      );
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    }
  };

  const togglePriceHistory = async () => {
    const next = !showPriceHistory;
    setShowPriceHistory(next);
    if (!next || !selectedListino) return;
    const { data, error } = await supabase
      .from('listino_price_history')
      .select('id, old_price, new_price, changed_at, listini_vettoriali(description)')
      .eq('listino_id', selectedListino.id)
      .order('changed_at', { ascending: false })
      .limit(30);
    if (error) {
      Alert.alert(t('messages.error'), error.message);
      return;
    }
    setPriceHistory(
      (data || []).map((row: any) => ({
        id: row.id,
        old_price: Number(row.old_price),
        new_price: Number(row.new_price),
        changed_at: row.changed_at,
        description: row.listini_vettoriali?.description || 'Voce eliminata',
      }))
    );
  };

  const togglePricingSettings = async () => {
    const next = !showPricingSettings;
    setShowPricingSettings(next);
    if (next) await loadPricingSettings();
  };

  const handleSavePricingSettings = async () => {
    if (!selectedListino || !profileId) return;
    setSavingPricingSettings(true);
    try {
      const res = await fetch(buildWebApiUrl('/api/listini/settings'), {
        method: 'POST',
        headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          listinoId: selectedListino.id,
          profileId,
          supplierDiscountPercent: discountDraft,
          categoryMarkups: categoryMarkupRows.map((row) => ({ category: row.category, markupPercent: categoryMarkupDrafts[row.category] ?? '' })),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Salvataggio non riuscito');
      await fetchItems(selectedListino.id);
      await loadPricingSettings();
      Alert.alert('Impostazioni salvate', payload.repricedItems ? `${payload.repricedItems} prezzi netti ricalcolati` : 'Ricarichi applicati');
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setSavingPricingSettings(false);
    }
  };

  const handleSaveGroupPrices = async () => {
    if (!selectedListino || !profileId) return;
    setSavingGroupPrices(true);
    try {
      const res = await fetch(buildWebApiUrl('/api/listini/pricing-groups'), {
        method: 'POST',
        headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          listinoId: selectedListino.id,
          profileId,
          prices: pricingGroups.map((group) => ({ name: group.name, unit_price: groupPriceDrafts[group.name] ?? '' })),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Salvataggio prezzi non riuscito');
      await fetchItems(selectedListino.id);
      await fetchSourceInfo(selectedListino.id, profileId);
      Alert.alert(
        'Prezzi applicati',
        `${payload.inserted || 0} voci nuove, ${payload.updated || 0} aggiornate` +
          (payload.pendingGroups ? `\n${payload.pendingGroups} forme ancora senza prezzo` : '')
      );
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setSavingGroupPrices(false);
    }
  };

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
      setSelectedSourceInfo(null);
      return;
    }
    fetchItems(selectedListino.id);
    if (profileId) {
      fetchSourceInfo(selectedListino.id, profileId);
    }
  }, [fetchItems, fetchSourceInfo, profileId, selectedListino?.id]);

  useEffect(() => {
    if (!profileId) return;

    const channel = supabase
      .channel(`mobile-listini-${profileId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listini', filter: `profile_id=eq.${profileId}` }, () => {
        fetchListini();
        if (selectedListino?.id) {
          fetchSourceInfo(selectedListino.id, profileId);
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'listini_vettoriali' }, () => {
        if (selectedListino?.id) {
          fetchItems(selectedListino.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchItems, fetchListini, fetchSourceInfo, profileId, selectedListino?.id]);

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
          setSelectedListino({ ...editingListino, name });
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
      profile_id: selectedListino.profile_id,
      description: newDescription.trim(),
      unit_price: parseFloat(newUnitPrice.replace(',', '.')) || 0,
      markup_percent: parseFloat(newMarkupPercent.replace(',', '.')) || 0,
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
              headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
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
      throw new Error('Il riordino delle voci si fa dal sito, dal computer.');
    }

    setOrganizingAi(true);
    try {
      const res = await fetch(buildWebApiUrl('/api/listini/ai-organize'), {
        method: 'POST',
        headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ listinoId, profileId }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Riordino delle voci non riuscito');
      }

      await fetchItems(listinoId);
      await fetchSourceInfo(listinoId, profileId);

      if (!options?.silentSuccess) {
        if (payload?.usedStoredSource) {
          const importedCount = payload?.importedCount || 0;
          const summary = importedCount
            ? `${importedCount} voci importate dalla sorgente PDF`
            : (payload?.aiFeedback || 'Sorgente PDF analizzata');
          Alert.alert('Voci riordinate', summary);
        } else {
          Alert.alert('Voci riordinate', `${payload.updatedCount || 0} voci aggiornate`);
        }
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
      showWebApiConfigAlert('Il riordino delle voci');
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
      let payload: UploadPayload;
      let statusCode = 0;

      if (mimeType === 'application/pdf') {
        // The server runs on Vercel, which rejects request bodies over 4.5 MB: a PDF sent
        // as base64 JSON fails from ~3 MB. Upload it straight to Storage with a signed URL
        // and send only its path; base64 stays as fallback for small files.
        let storagePath: string | null = null;
        try {
          storagePath = await uploadPdfToSignedStorage({
            uri: asset.uri,
            fileName,
            profileId,
            listinoId: selectedListino.id,
          });
        } catch (storageError) {
          const sizeBytes = 'size' in fileInfo ? Number(fileInfo.size || 0) : 0;
          if (sizeBytes > PDF_BASE64_MAX_BYTES) {
            throw new Error(`Caricamento PDF non riuscito: ${(storageError as Error).message}`);
          }
        }

        const response = await fetch(buildWebApiUrl('/api/listini/upload'), {
          method: 'POST',
          headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            ...(storagePath ? { storagePath } : { fileBase64: await readFileBase64(asset.uri) }),
            fileName,
            mimeType,
            profileId,
            listinoId: selectedListino.id,
            originalFileName: fileName,
          }),
        });
        statusCode = response.status;
        payload = parseUploadPayload(await response.text());
      } else if ('size' in fileInfo && Number(fileInfo.size || 0) > PDF_BASE64_MAX_BYTES) {
        // Big Excel/CSV/METEL files: same Storage route as PDFs (Vercel's 4.5 MB limit).
        const storagePath = await uploadPdfToSignedStorage({
          uri: asset.uri,
          fileName,
          profileId,
          listinoId: selectedListino.id,
          contentType: mimeType,
        });
        const response = await fetch(buildWebApiUrl('/api/listini/upload'), {
          method: 'POST',
          headers: await getWebApiAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            storagePath,
            fileName,
            mimeType,
            profileId,
            listinoId: selectedListino.id,
            originalFileName: fileName,
          }),
        });
        statusCode = response.status;
        payload = parseUploadPayload(await response.text());
      } else {
        const response = await FileSystem.uploadAsync(buildWebApiUrl('/api/listini/upload'), asset.uri, {
          fieldName: 'file',
          httpMethod: 'POST',
          headers: await getWebApiAuthHeaders(),
          mimeType,
          parameters: {
            profileId,
            listinoId: selectedListino.id,
            originalFileName: fileName,
          },
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        });
        statusCode = response.status;
        payload = parseUploadPayload(response.body);
      }

      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(buildUploadErrorMessage(payload));
      }

      if (payload?.sourceStored) {
        await fetchSourceInfo(selectedListino.id, profileId);
      } else if (payload?.sourceInfo) {
        setSelectedSourceInfo(payload.sourceInfo);
      }

      if (payload?.sourceStored && !(payload?.inserted || 0) && !(payload?.updated || 0)) {
        const candidateCount = Number(payload?.summary?.parsedRows || payload?.sourceInfo?.parsedSummary?.parsedRows || 0);
        const pendingCount = Number(payload?.summary?.pendingReferenceRows || payload?.sourceInfo?.parsedSummary?.pendingReferenceRows || 0);
        const aiLine = payload?.aiFeedback ? `\n\n${payload.aiFeedback}` : (payload?.warning ? `\n\n${payload.warning}` : '');
        const rules = summarizeRecommendedRules(payload);
        const rulesLine = rules ? `\n\nRegole consigliate: ${rules}` : '';
        const candidateLine = candidateCount > 0
          ? `\n\nVoci tecniche trovate: ${candidateCount}${pendingCount > 0 ? ` · da completare con regole prezzo: ${pendingCount}` : ''}`
          : '';
        await fetchItems(selectedListino.id);
        Alert.alert('PDF salvato', `Il PDF e stato salvato come sorgente del listino.${candidateLine}${aiLine}${rulesLine}`);
        return;
      }

      if (Number(payload?.summary?.parsedRows || 0) > 5000) {
        // Very large lists (METEL): the automatic AI pass would only hit its time budget.
        await fetchItems(selectedListino.id);
        Alert.alert('Import completato', buildUploadSuccessMessage(payload));
        return;
      }

      let aiLine = 'Voci riordinate in automatico.';
      try {
        const aiPayload = await runAiOrganize(selectedListino.id, {
          silentSuccess: true,
          suppressErrorAlert: true,
        });
        aiLine = `Voci riordinate: ${aiPayload?.updatedCount || 0} aggiornate.`;
      } catch (err) {
        aiLine = `Listino caricato, ma il riordino non è riuscito: ${(err as Error).message}`;
      }

      await fetchItems(selectedListino.id);
      Alert.alert('Import completato', `${buildUploadSuccessMessage(payload)}\n${aiLine}`);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  /* Two levels: the list of price lists, then one open price list (and its settings views). */
  const [panel, setPanel] = useState<null | 'pricing' | 'groups' | 'history'>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [sheet, setSheet] = useState<{
    title: string;
    subtitle?: string;
    actions: SheetAction[];
    destructive: SheetDestructive | null;
    startOnConfirm?: boolean;
  } | null>(null);
  const navigation = useNavigation<any>();

  const openListino = (item: Listino) => {
    setShowPricingSettings(false);
    setShowPriceHistory(false);
    setPanel(null);
    setItemSearch('');
    setSelectedListino(item);
  };

  const goBack = useCallback(() => {
    if (panel) {
      setPanel(null);
      setShowPricingSettings(false);
      setShowPriceHistory(false);
      return true;
    }
    if (selectedListino) {
      setSelectedListino(null);
      return true;
    }
    return false;
  }, [panel, selectedListino]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
      return () => sub.remove();
    }, [goBack])
  );

  const panelTitle = panel === 'pricing' ? 'Sconto e ricarichi' : panel === 'groups' ? 'Prezzi per forma' : panel === 'history' ? 'Variazioni di prezzo' : null;
  useEffect(() => {
    navigation.setOptions({
      title: panelTitle || selectedListino?.name || t('main.listini'),
      headerLeft: selectedListino
        ? () => <HeaderBack label={panel ? selectedListino.name : t('main.listini') || 'Listini'} onPress={goBack} />
        : undefined,
    });
  }, [navigation, panel, panelTitle, selectedListino, goBack, t]);

  const deleteListino = async (listinoId: string) => {
    const { error } = await supabase.from('listini').delete().eq('id', listinoId);
    if (error) {
      Alert.alert(t('messages.error'), 'Listino non eliminato. Controlla la connessione e riprova.');
      return false;
    }
    if (selectedListino?.id === listinoId) {
      setSelectedListino(null);
      setItems([]);
    }
    await fetchListini();
    return true;
  };

  const deleteItem = async (itemId: string) => {
    const { error } = await supabase.from('listini_vettoriali').delete().eq('id', itemId);
    if (error) {
      Alert.alert(t('messages.error'), 'Voce non eliminata. Controlla la connessione e riprova.');
      return false;
    }
    if (selectedListino) await fetchItems(selectedListino.id);
    return true;
  };

  const renameListino = (item: Listino) => {
    setEditingListino(item);
    setNewListinoName(item.name);
    setShowListinoModal(true);
  };

  const listinoDestructive = (item: Listino): SheetDestructive => ({
    label: 'Elimina il listino',
    confirmTitle: `Eliminare il listino ${item.name}?`,
    confirmMessage: 'Si cancellano anche tutte le sue voci. I lavori già fatti restano. Non si può annullare.',
    onConfirm: () => deleteListino(item.id),
  });

  const openListinoSheet = (item: Listino) => {
    setSheet({
      title: item.name,
      subtitle: item.ownershipLabel || null || undefined,
      actions: [{ label: 'Rinomina il listino', icon: 'text-outline', onPress: () => renameListino(item) }],
      destructive: listinoDestructive(item),
    });
  };

  const openMoreActions = () => {
    if (!selectedListino) return;
    const actions: SheetAction[] = [
      { label: 'Aggiungi una voce a mano', icon: 'add-outline', onPress: () => { resetItemForm(); setShowItemModal(true); } },
      { label: 'Riordina le voci', icon: 'swap-vertical-outline', onPress: handleOrganizeWithAi },
      { label: 'Sconto fornitore e ricarichi', icon: 'pricetag-outline', onPress: async () => { setPanel('pricing'); setShowPricingSettings(true); await loadPricingSettings(); } },
    ];
    if (pricingGroups.length > 0) actions.push({ label: 'Prezzi per forma', icon: 'scale-outline', onPress: () => setPanel('groups') });
    actions.push({ label: 'Ultime variazioni di prezzo', icon: 'time-outline', onPress: openHistory });
    actions.push({ label: 'Rinomina il listino', icon: 'text-outline', onPress: () => renameListino(selectedListino) });
    setSheet({ title: selectedListino.name, actions, destructive: listinoDestructive(selectedListino) });
  };

  const openHistory = async () => {
    setPanel('history');
    if (!showPriceHistory) await togglePriceHistory();
  };

  const openItem = (item: ListinoItem) => {
    if (!selectedListino?.canEdit) return;
    setEditingItem(item);
    setNewDescription(item.description);
    setNewUnitPrice(String(item.unit_price).replace('.', ','));
    setNewMarkupPercent(String(item.markup_percent || 0).replace('.', ','));
    setShowItemModal(true);
  };

  const shownItems = itemSearch.trim()
    ? items.filter((item) => item.description.toLowerCase().includes(itemSearch.trim().toLowerCase()))
    : items;
  const busy = uploading || organizingAi;
  const canUpload = isWebApiConfigured();
  const fmtDate = (value: string) => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const percentRow = (label: string, value: string, onChange: (v: string) => void, unit: string, a11y: string, key?: string) => (
    <View key={key} style={styles.groupRow}>
      <Text style={[ufficio.row, { color: colors.text, flex: 1 }]} numberOfLines={2}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.textTertiary}
        accessibilityLabel={a11y}
        style={[styles.groupInput, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder, color: colors.text }]}
      />
      <Text style={[ufficio.label, { color: colors.textSecondary, minWidth: 40 }]}>{unit}</Text>
    </View>
  );

  const renderPanel = () => {
    if (panel === 'pricing') {
      return (
        <>
          {percentRow('Sconto fornitore sul listino', discountDraft, setDiscountDraft, '%', 'Sconto fornitore in percentuale')}
          {categoryMarkupRows.map((row) =>
            percentRow(
              `Ricarico ${row.category} (${row.itemCount} voci)`,
              categoryMarkupDrafts[row.category] ?? '',
              (value) => setCategoryMarkupDrafts((drafts) => ({ ...drafts, [row.category]: value })),
              '%',
              `Ricarico ${row.category} in percentuale`,
              row.category
            )
          )}
          <PrimaryButton label="Salva e ricalcola" scale="ufficio" onPress={handleSavePricingSettings} loading={savingPricingSettings} loadingLabel="Salvo…" style={{ marginTop: space.s5 }} />
        </>
      );
    }
    if (panel === 'groups') {
      return (
        <>
          <Text style={[ufficio.body, { color: colors.textSecondary, marginBottom: space.s3 }]}>
            Il PDF non contiene prezzi. Indica il prezzo di ogni forma: le voci si calcolano come peso × prezzo. Le forme senza prezzo non entrano nel listino.
          </Text>
          {pricingGroups.map((group) =>
            percentRow(
              `${group.name} (${group.item_count})`,
              groupPriceDrafts[group.name] ?? '',
              (value) => setGroupPriceDrafts((drafts) => ({ ...drafts, [group.name]: value })),
              `€/${group.reference_unit}`,
              `Prezzo ${group.name} in euro per ${group.reference_unit}`,
              group.name
            )
          )}
          <PrimaryButton label="Applica prezzi" scale="ufficio" onPress={handleSaveGroupPrices} loading={savingGroupPrices} loadingLabel="Applico…" style={{ marginTop: space.s5 }} />
        </>
      );
    }
    // history
    return priceHistory.length ? (
      <ListGroup>
        {priceHistory.map((change, index) => {
          const delta = change.old_price ? Math.round(((change.new_price - change.old_price) / change.old_price) * 100) : 0;
          return (
            <ListRow
              key={change.id}
              first={index === 0}
              scale="ufficio"
              title={change.description}
              subtitle={`${formatMoney(change.old_price)} → ${formatMoney(change.new_price)} (${delta > 0 ? '+' : ''}${delta}%) · ${fmtDate(change.changed_at)}`}
            />
          );
        })}
      </ListGroup>
    ) : (
      <EmptyState text="Nessuna variazione ancora: compariranno quando ricarichi il listino aggiornato del fornitore." />
    );
  };

  const renderList = () => (
    <FlatList
      data={listini}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.scroll}
      ListHeaderComponent={
        <>
          {!canUpload ? (
            <Text style={[ufficio.label, { color: colors.textSecondary, fontWeight: '400', marginBottom: space.s4 }]}>
              Il caricamento del listino si fa dal sito, dal computer.
            </Text>
          ) : null}
          {listLoading && listini.length === 0 ? <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: space.s5 }} /> : null}
        </>
      }
      ListEmptyComponent={
        listLoading ? null : (
          <EmptyState text="Carica il listino del tuo grossista: quando detti, il prezzo arriva da solo." icon="pricetags-outline" />
        )
      }
      renderItem={({ item, index }) => (
        <ListRow
          first={index === 0}
          scale="ufficio"
          title={item.name}
          subtitle={item.canEdit ? `Tuo${item.ownershipLabel ? ` · ${item.ownershipLabel}` : ''}` : `${item.ownershipLabel || 'Condiviso'} · sola lettura`}
          onPress={() => openListino(item)}
          onLongPress={item.canEdit ? () => openListinoSheet(item) : undefined}
          accessibilityHint="Apre il listino"
          style={[
            { borderColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1 },
            index === 0 && { borderTopWidth: 1, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
            index === listini.length - 1 && { borderBottomWidth: 1, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
          ]}
        />
      )}
    />
  );

  const renderDetail = () => {
    if (!selectedListino) return null;
    if (panel) {
      return <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{renderPanel()}</ScrollView>;
    }
    return (
      <FlatList
        data={shownItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            {!selectedListino.canEdit ? (
              <View style={{ marginBottom: space.s3 }}>
                <StatusPill kind="locked" label="Sola lettura" />
              </View>
            ) : null}
            <TextField label="Cerca nel listino" icon="search-outline" value={itemSearch} onChangeText={setItemSearch} placeholder="Es. IPE 120" clearButtonMode="while-editing" autoCorrect={false} />
            {selectedSourceInfo ? (
              <Text style={[ufficio.label, { color: colors.textSecondary, marginBottom: space.s3 }]}>
                File caricato: {selectedSourceInfo.fileName} · {fmtDate(selectedSourceInfo.uploadedAt)}
              </Text>
            ) : null}
            {selectedSourceInfo?.aiFeedback ? (
              <Text style={[ufficio.label, { color: colors.textSecondary, fontWeight: '400', marginBottom: space.s3 }]}>{selectedSourceInfo.aiFeedback}</Text>
            ) : null}
            {busy || itemsLoading ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[ufficio.label, { color: colors.textSecondary }]}>
                  {uploading ? 'Carico il listino…' : organizingAi ? 'Riordino in corso…' : 'Carico le voci…'}
                </Text>
              </View>
            ) : null}
            {!selectedListino.canEdit ? (
              <TertiaryButton label="Ultime variazioni di prezzo" icon="time-outline" onPress={openHistory} style={{ marginBottom: space.s2 }} />
            ) : null}
          </>
        }
        ListEmptyComponent={
          itemsLoading ? null : (
            <EmptyState text={itemSearch.trim() ? `Nessuna voce con «${itemSearch.trim()}».` : 'Nessuna voce in questo listino.'} />
          )
        }
        renderItem={({ item, index }) => {
          const markup = Number(item.markup_percent || 0);
          return (
            <ListRow
              first={index === 0}
              scale="ufficio"
              title={item.description}
              subtitle={`${formatMoney(Number(item.unit_price))} · ricarico ${String(Math.round(markup * 10) / 10).replace('.', ',')}%${item.category ? ` · ${item.category}` : ''}`}
              onPress={selectedListino.canEdit ? () => openItem(item) : undefined}
              hideChevron={!selectedListino.canEdit}
              accessibilityHint={selectedListino.canEdit ? 'Apre la modifica della voce' : undefined}
              style={[
                { borderColor: colors.border, borderLeftWidth: 1, borderRightWidth: 1 },
                index === 0 && { borderTopWidth: 1, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
                index === shownItems.length - 1 && { borderBottomWidth: 1, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
              ]}
            />
          );
        }}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ flex: 1 }}>{selectedListino ? renderDetail() : renderList()}</View>

      {!selectedListino ? (
        <>
          <BottomActionBar aboveTabBar>
            <PrimaryButton label={t('listini.newListino') || 'Nuovo listino'} icon="add-outline" scale="ufficio" onPress={() => { resetListinoForm(); setShowListinoModal(true); }} />
          </BottomActionBar>
          <BottomTabBar active="Listini" />
        </>
      ) : selectedListino.canEdit && !panel ? (
        <BottomActionBar>
          <SecondaryButton label="Altre azioni" icon="ellipsis-horizontal" scale="ufficio" onPress={openMoreActions} disabled={busy} />
          {canUpload ? (
            <>
              <Text style={[ufficio.label, { color: colors.textSecondary, fontWeight: '400', textAlign: 'center' }]}>PDF del grossista, Excel, CSV o METEL</Text>
              <PrimaryButton label="Carica il file del listino" icon="cloud-upload-outline" onPress={handleImportFile} loading={uploading} loadingLabel="Carico…" disabled={busy} />
            </>
          ) : (
            <Text style={[ufficio.label, { color: colors.textSecondary, fontWeight: '400', textAlign: 'center' }]}>Il caricamento del listino si fa dal sito, dal computer.</Text>
          )}
        </BottomActionBar>
      ) : null}

      <Modal visible={showListinoModal} transparent animationType="fade" onRequestClose={() => setShowListinoModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg }]}>
            <Text style={[ufficio.display, styles.modalTitle, { color: colors.text }]}>
              {editingListino ? 'Rinomina il listino' : (t('listini.newListino') || 'Nuovo listino')}
            </Text>
            <TextField label="Nome del listino" value={newListinoName} onChangeText={setNewListinoName} placeholder="Es. Grossista Rossi 2026" autoFocus />
            <View style={styles.modalBtns}>
              <SecondaryButton label={t('buttons.cancel')} scale="ufficio" style={{ flex: 1 }} onPress={() => { setShowListinoModal(false); resetListinoForm(); }} />
              <PrimaryButton label={t('buttons.save')} scale="ufficio" style={{ flex: 1 }} onPress={handleCreateOrUpdateListino} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showItemModal} transparent animationType="fade" onRequestClose={() => setShowItemModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modal, { backgroundColor: colors.modalBg, maxHeight: '90%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={[ufficio.display, styles.modalTitle, { color: colors.text }]}>
                {editingItem ? 'Modifica voce' : (t('listini.newItem') || 'Nuova voce')}
              </Text>
              <TextField label="Descrizione" value={newDescription} onChangeText={setNewDescription} placeholder="Es. Trave IPE 120 S275JR" multiline />
              <View style={{ flexDirection: 'row', gap: space.s3 }}>
                <TextField label="Prezzo netto (€)" value={newUnitPrice} onChangeText={setNewUnitPrice} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
                <TextField label="Ricarico (%)" value={newMarkupPercent} onChangeText={setNewMarkupPercent} keyboardType="decimal-pad" containerStyle={{ flex: 1 }} />
              </View>
              <View style={styles.modalBtns}>
                <SecondaryButton label={t('buttons.cancel')} scale="ufficio" style={{ flex: 1 }} disabled={savingItem} onPress={() => { setShowItemModal(false); resetItemForm(); }} />
                <PrimaryButton label={t('buttons.save')} scale="ufficio" style={{ flex: 1 }} onPress={handleCreateOrUpdateItem} loading={savingItem} loadingLabel="Salvo…" />
              </View>
              {editingItem ? (
                <DangerButton
                  label="Elimina la voce"
                  style={{ marginTop: space.s5 }}
                  onPress={() => {
                    const item = editingItem;
                    setShowItemModal(false);
                    resetItemForm();
                    setTimeout(() => setSheet({
                      title: item.description,
                      actions: [],
                      startOnConfirm: true,
                      destructive: {
                        label: 'Elimina la voce',
                        confirmTitle: 'Eliminare questa voce del listino?',
                        confirmMessage: `«${item.description}» esce dal listino. Le voci già nei lavori restano. Non si può annullare.`,
                        onConfirm: () => deleteItem(item.id),
                      },
                    }), 350);
                  }}
                />
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ActionSheet
        visible={Boolean(sheet)}
        title={sheet?.title || ''}
        subtitle={sheet?.subtitle}
        actions={sheet?.actions}
        destructive={sheet?.destructive}
        startOnConfirm={sheet?.startOnConfirm}
        onClose={() => setSheet(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: space.s4, paddingBottom: space.s5 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: space.s3, marginTop: space.s3, minHeight: 56 },
  groupInput: { width: 96, minHeight: 56, borderWidth: 2, borderRadius: radius.control, paddingHorizontal: space.s3, textAlign: 'right', fontSize: 18 },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: space.s2, marginBottom: space.s3 },
  modalOverlay: { flex: 1, justifyContent: 'center', padding: space.s4 },
  modal: { borderRadius: radius.sheet, padding: space.s5 },
  modalTitle: { marginBottom: space.s4 },
  modalBtns: { flexDirection: 'row', gap: space.s3, marginTop: space.s2 },
});
