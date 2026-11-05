'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

type Listino = { id: string; name: string };
type ListinoItem = {
  id: string;
  description: string;
  unit_price: number;
  markup_percent: number;
  category?: string | null;
};
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

const RULE_PRESETS = [
  { rule_key: 'metal_ferrous', label: 'Ferro / acciaio', reference_unit: 'kg' },
  {
    rule_key: 'metal_nonferrous',
    label: 'Rame / metalli non ferrosi',
    reference_unit: 'kg',
  },
  { rule_key: 'electric_cable', label: 'Cavi elettrici', reference_unit: 'm' },
  { rule_key: 'piping', label: 'Tubazioni / raccordi', reference_unit: 'm' },
  { rule_key: 'paint_chemical', label: 'Vernici / chimici', reference_unit: 'l' },
  { rule_key: 'wood_panel', label: 'Legno / pannelli', reference_unit: 'm2' },
];

const PDF_SOURCE_BUCKET = 'listini-sources';

type UploadRequestResult = {
  ok: boolean;
  status: number;
  contentType: string | null;
  payload: any;
  responseText: string;
};

async function fileToBase64(file: File): Promise<string> {
  try {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        if (!base64) {
          reject(new Error('Non sono riuscito a leggere il PDF selezionato.'));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () =>
        reject(reader.error || new Error('Lettura file non riuscita'));
      reader.onabort = () => reject(new Error('Lettura file interrotta'));
      reader.readAsDataURL(file);
    });
  } catch (readAsDataUrlError) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    const base64 = btoa(binary);
    if (!base64) {
      const reason =
        readAsDataUrlError instanceof Error
          ? readAsDataUrlError.message
          : String(readAsDataUrlError);
      throw new Error(`Non sono riuscito a leggere il PDF selezionato: ${reason}`);
    }
    return base64;
  }
}

function isSafariBrowser() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/i.test(ua);
}

async function uploadWithFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<UploadRequestResult> {
  const response = await fetch(input, init);
  const responseText = await response.text();
  let payload: any = null;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    contentType: response.headers.get('content-type'),
    payload,
    responseText,
  };
}

type ListinoChangesSummary = {
  increased: number;
  decreased: number;
  unchanged: number;
  missing: number;
  examples: Array<{ description: string; oldPrice: number; newPrice: number }>;
};

function formatEuro(value: number): string {
  return value.toLocaleString('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/** "12 prezzi aumentati, 3 diminuiti ... es. Tubo rame 12: 4,00 → 4,60 € (+15%)". */
function describeListinoChanges(changes?: ListinoChangesSummary | null): string | null {
  if (!changes || !(changes.increased || changes.decreased || changes.missing))
    {return null;}
  const parts = [
    changes.increased ? `${changes.increased} prezzi aumentati` : null,
    changes.decreased ? `${changes.decreased} diminuiti` : null,
    changes.unchanged ? `${changes.unchanged} invariati` : null,
    changes.missing
      ? `${changes.missing} voci non più presenti nel file (mantenute)`
      : null,
  ].filter(Boolean);
  const top = changes.examples?.[0];
  const example = top
    ? ` · es. ${top.description}: ${formatEuro(top.oldPrice)} → ${formatEuro(top.newPrice)} € (${
        top.newPrice >= top.oldPrice ? '+' : ''
      }${Math.round(((top.newPrice - top.oldPrice) / (top.oldPrice || 1)) * 100)}%)`
    : '';
  return `${parts.join(', ')}${example}`;
}

const JOB_POLL_INTERVAL_MS = 2500;
const JOB_MAX_WAIT_MS = 6 * 60 * 1000;

/**
 * Long listini requests run as background jobs (202 + jobId): wait for the job and
 * return its outcome as if it were the original response. Other responses pass through.
 */
async function resolveListinoJob(
  result: UploadRequestResult
): Promise<UploadRequestResult> {
  const jobId = result.status === 202 ? result.payload?.jobId : null;
  if (!jobId) return result;

  const deadline = Date.now() + JOB_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    const poll = await uploadWithFetch(
      `/api/listini/jobs?id=${encodeURIComponent(jobId)}`
    );
    const job = poll.payload?.job;
    if (!poll.ok || !job) continue;
    if (job.status === 'done' || job.status === 'error') {
      const status = Number(job.http_status || (job.status === 'done' ? 200 : 500));
      return {
        ok: status >= 200 && status < 300,
        status,
        contentType: 'application/json',
        payload: job.result,
        responseText: JSON.stringify(job.result ?? null),
      };
    }
  }
  throw new Error(
    'Il lavoro sta impiegando troppo: ricarica la pagina tra qualche minuto.'
  );
}

function uploadWithXhr(url: string, formData: FormData): Promise<UploadRequestResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.responseType = 'text';

    xhr.onload = () => {
      const responseText = xhr.responseText || '';
      let payload: any = null;

      try {
        payload = responseText ? JSON.parse(responseText) : null;
      } catch {
        payload = null;
      }

      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        contentType: xhr.getResponseHeader('content-type'),
        payload,
        responseText,
      });
    };

    xhr.onerror = () =>
      reject(new Error('Safari non e riuscito a completare l upload del PDF.'));
    xhr.onabort = () => reject(new Error('Upload PDF interrotto in Safari.'));
    xhr.send(formData);
  });
}

async function uploadPdfViaStorageReference(params: {
  file: File;
  profileId: string;
  listinoId: string;
}) {
  const signedUploadResult = await uploadWithFetch('/api/listini/source-upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileId: params.profileId,
      listinoId: params.listinoId,
      fileName: params.file.name,
    }),
  });

  if (
    !signedUploadResult.ok ||
    !signedUploadResult.payload?.token ||
    !signedUploadResult.payload?.storagePath
  ) {
    const errorMessage =
      signedUploadResult.payload?.error ||
      `Preparazione upload PDF non riuscita (HTTP ${signedUploadResult.status})`;
    throw new Error(errorMessage);
  }

  const bucket = String(signedUploadResult.payload.bucket || PDF_SOURCE_BUCKET);
  const storagePath = String(signedUploadResult.payload.storagePath || '').trim();
  const token = String(signedUploadResult.payload.token || '').trim();

  if (!storagePath || !token) {
    throw new Error('Upload firmato PDF incompleto.');
  }

  const storageUpload = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(storagePath, token, params.file, {
      upsert: true,
      contentType: params.file.type || 'application/pdf',
    });

  if (storageUpload.error) {
    throw storageUpload.error;
  }

  return resolveListinoJob(
    await uploadWithFetch('/api/listini/upload?async=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storagePath,
        fileName: params.file.name,
        mimeType: params.file.type || 'application/pdf',
        profileId: params.profileId,
        listinoId: params.listinoId,
        originalFileName: params.file.name,
      }),
    })
  );
}

export default function ListiniPage() {
  const { t } = useTranslation();
  const [listini, setListini] = useState<Listino[]>([]);
  const [items, setItems] = useState<ListinoItem[]>([]);
  const [selectedListino, setSelectedListino] = useState<Listino | null>(null);
  const [selectedSourceInfo, setSelectedSourceInfo] = useState<ListinoSourceInfo | null>(
    null
  );
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileMarkupPercent, setProfileMarkupPercent] = useState<number>(0);

  const [showManualModal, setShowManualModal] = useState(false);
  const [showPricingRulesModal, setShowPricingRulesModal] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('0');
  const [newMarkupPercent, setNewMarkupPercent] = useState('0');
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [pricingRuleLabel, setPricingRuleLabel] = useState('');
  const [pricingRuleKey, setPricingRuleKey] = useState('custom');
  const [pricingRuleUnit, setPricingRuleUnit] = useState('kg');
  const [pricingRulePrice, setPricingRulePrice] = useState('0');
  const [pricingRuleSourceLabel, setPricingRuleSourceLabel] = useState('');
  const [pricingRuleSourceUrl, setPricingRuleSourceUrl] = useState('');
  const [editingPricingRuleId, setEditingPricingRuleId] = useState<string | null>(null);
  const [pricingRulesLoading, setPricingRulesLoading] = useState(false);
  const [savingPricingRule, setSavingPricingRule] = useState(false);
  const [editingItem, setEditingItem] = useState<ListinoItem | null>(null);
  const [editingListino, setEditingListino] = useState<Listino | null>(null);
  const [editingListinoName, setEditingListinoName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [organizingAi, setOrganizingAi] = useState(false);
  // "Prezzi per forma": only for listini whose PDF has no prices.
  const [pricingGroups, setPricingGroups] = useState<PricingGroupRow[]>([]);
  const [groupPriceDrafts, setGroupPriceDrafts] = useState<Record<string, string>>({});
  const [savingGroupPrices, setSavingGroupPrices] = useState(false);

  const fetchListini = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, material_markup_vat_percent')
      .eq('id', user.id)
      .single();
    if (!profile) return;
    setProfileId(profile.id);
    setProfileMarkupPercent(profile.material_markup_vat_percent ?? 0);
    const { data } = await supabase
      .from('listini')
      .select('id, name')
      .eq('profile_id', profile.id);
    setListini(data || []);
  };

  const fetchItems = async (listinoId: string) => {
    const { data } = await supabase
      .from('listini_vettoriali')
      .select('id, description, unit_price, markup_percent, category')
      .eq('listino_id', listinoId);
    setItems(data || []);
  };

  const fetchSourceInfo = async (listinoId: string, nextProfileId: string) => {
    try {
      const res = await fetch(
        `/api/listini/source?listinoId=${encodeURIComponent(listinoId)}&profileId=${encodeURIComponent(nextProfileId)}`
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Lettura sorgente non riuscita');
      setSelectedSourceInfo(payload?.sourceInfo || null);
    } catch {
      setSelectedSourceInfo(null);
    }
    await fetchPricingGroups(listinoId, nextProfileId);
  };

  const fetchPricingGroups = async (listinoId: string, nextProfileId: string) => {
    try {
      const res = await fetch(
        `/api/listini/pricing-groups?listinoId=${encodeURIComponent(listinoId)}&profileId=${encodeURIComponent(nextProfileId)}`
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Lettura forme non riuscita');
      const groups = (payload?.groups || []) as PricingGroupRow[];
      setPricingGroups(groups);
      setGroupPriceDrafts(
        Object.fromEntries(
          groups.map((group) => [group.name, formatGroupPrice(group.unit_price)])
        )
      );
    } catch {
      setPricingGroups([]);
      setGroupPriceDrafts({});
    }
  };

  const handleSaveGroupPrices = async () => {
    if (!selectedListino) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setSavingGroupPrices(true);
    try {
      const res = await fetch('/api/listini/pricing-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listinoId: selectedListino.id,
          profileId: user.id,
          prices: pricingGroups.map((group) => ({
            name: group.name,
            unit_price: groupPriceDrafts[group.name] ?? '',
          })),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Salvataggio prezzi non riuscito');
      toast.success(
        `Prezzi applicati: ${payload.inserted || 0} voci nuove, ${payload.updated || 0} aggiornate` +
          (payload.pendingGroups
            ? ` · ${payload.pendingGroups} forme ancora senza prezzo`
            : '')
      );
      await fetchItems(selectedListino.id);
      await fetchPricingGroups(selectedListino.id, user.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingGroupPrices(false);
    }
  };

  const fetchPricingRules = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setPricingRulesLoading(true);
    try {
      const { data, error } = await supabase
        .from('pricing_reference_rules')
        .select(
          'id, rule_key, label, reference_unit, reference_price, source_label, source_url, active'
        )
        .eq('profile_id', user.id)
        .order('label', { ascending: true });

      if (error) throw error;
      setPricingRules(data || []);
    } catch (err) {
      toast.error(`Regole prezzo: ${(err as Error).message}`);
    } finally {
      setPricingRulesLoading(false);
    }
  };

  useEffect(() => {
    fetchListini();
  }, []);
  useEffect(() => {
    if (!selectedListino) {
      setSelectedSourceInfo(null);
      return;
    }
    fetchItems(selectedListino.id);
    if (profileId) {
      fetchSourceInfo(selectedListino.id, profileId);
    }
  }, [selectedListino?.id, profileId]);

  const resetPricingRuleForm = () => {
    setEditingPricingRuleId(null);
    setPricingRuleLabel('');
    setPricingRuleKey('custom');
    setPricingRuleUnit('kg');
    setPricingRulePrice('0');
    setPricingRuleSourceLabel('');
    setPricingRuleSourceUrl('');
  };

  const openPricingRulesModal = async () => {
    setShowPricingRulesModal(true);
    resetPricingRuleForm();
    await fetchPricingRules();
  };

  const handleApplyPreset = (preset: {
    rule_key: string;
    label: string;
    reference_unit: string;
  }) => {
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const label = pricingRuleLabel.trim();
    if (!label) {
      toast.error('Inserisci il nome della regola');
      return;
    }

    setSavingPricingRule(true);
    try {
      const payload = {
        profile_id: user.id,
        rule_key: pricingRuleKey.trim() || 'custom',
        label,
        reference_unit: pricingRuleUnit.trim() || 'kg',
        reference_price: parseFloat(pricingRulePrice) || 0,
        source_label: pricingRuleSourceLabel.trim() || null,
        source_url: pricingRuleSourceUrl.trim() || null,
        active: true,
      };

      const query = editingPricingRuleId
        ? supabase
            .from('pricing_reference_rules')
            .update(payload)
            .eq('id', editingPricingRuleId)
        : supabase.from('pricing_reference_rules').insert(payload);
      const { error } = await query;
      if (error) throw error;

      toast.success(
        editingPricingRuleId ? 'Regola prezzo aggiornata' : 'Regola prezzo salvata'
      );
      resetPricingRuleForm();
      await fetchPricingRules();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPricingRule(false);
    }
  };

  const handleDeletePricingRule = async (ruleId: string) => {
    if (!confirm('Eliminare questa regola prezzo?')) return;
    try {
      const { error } = await supabase
        .from('pricing_reference_rules')
        .delete()
        .eq('id', ruleId);
      if (error) throw error;
      toast.success('Regola eliminata');
      await fetchPricingRules();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCreateListino = async () => {
    const name = prompt(t('listini.promptNewListino'));
    if (!name) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single();
    if (!profile) return;
    const { error } = await supabase
      .from('listini')
      .insert({ profile_id: profile.id, name });
    if (error) toast.error(error.message);
    else {
      toast.success(t('listini.listiniCreated'));
      fetchListini();
    }
  };

  const handleDeleteListino = async (listinoId: string) => {
    if (!confirm(t('listini.deleteConfirm'))) return;
    try {
      const { error } = await supabase.from('listini').delete().eq('id', listinoId);
      if (error) throw error;
      if (selectedListino?.id === listinoId) setSelectedListino(null);
      toast.success(t('listini.deleted'));
      fetchListini();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRenameListino = async () => {
    if (!editingListino || !editingListinoName.trim()) return;
    try {
      const { error } = await supabase
        .from('listini')
        .update({ name: editingListinoName.trim() })
        .eq('id', editingListino.id);
      if (error) throw error;
      if (selectedListino?.id === editingListino.id) {
        setSelectedListino({ ...selectedListino, name: editingListinoName.trim() });
      }
      setEditingListino(null);
      setEditingListinoName('');
      toast.success(t('messages.saved'));
      fetchListini();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm(t('listini.deleteConfirm'))) return;
    try {
      const { error } = await supabase
        .from('listini_vettoriali')
        .delete()
        .eq('id', itemId);
      if (error) throw error;
      toast.success(t('listini.deleted'));
      if (selectedListino) fetchItems(selectedListino.id);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleUploadCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedListino) return;

    try {
      setUploading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const resolvedProfileId =
        profileId ||
        (await supabase.from('profiles').select('id').eq('id', user.id).single()).data
          ?.id;
      if (!resolvedProfileId) return;

      let uploadResult: UploadRequestResult;
      if (
        (file.type || '').toLowerCase() === 'application/pdf' ||
        file.name.toLowerCase().endsWith('.pdf')
      ) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('profileId', resolvedProfileId);
        formData.append('listinoId', selectedListino.id);
        formData.append('originalFileName', file.name);
        formData.append('mimeType', file.type || 'application/pdf');

        try {
          uploadResult = await uploadPdfViaStorageReference({
            file,
            profileId: resolvedProfileId,
            listinoId: selectedListino.id,
          });
        } catch (storageUploadError) {
          if (isSafariBrowser()) {
            uploadResult = await uploadWithXhr('/api/listini/upload', formData);
          } else {
            try {
              const fileBase64 = await fileToBase64(file);
              uploadResult = await uploadWithFetch('/api/listini/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fileBase64,
                  fileName: file.name,
                  mimeType: file.type || 'application/pdf',
                  profileId: resolvedProfileId,
                  listinoId: selectedListino.id,
                  originalFileName: file.name,
                }),
              });
            } catch (pdfClientError) {
              uploadResult = await uploadWithFetch('/api/listini/upload', {
                method: 'POST',
                body: formData,
              });
            }
          }
        }
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('profileId', resolvedProfileId);
        formData.append('listinoId', selectedListino.id);
        uploadResult = await uploadWithFetch('/api/listini/upload', {
          method: 'POST',
          body: formData,
        });
      }

      const payload = uploadResult.payload;
      if (!uploadResult.ok) {
        const summary = payload?.summary;
        const detail = summary
          ? ` (${summary.parsedRows}/${summary.totalRows} righe importabili)`
          : '';
        const pricingDiagnostics = payload?.pricingDiagnostics;
        const pricingDetail = pricingDiagnostics?.unresolved
          ? ` · senza prezzo: ${pricingDiagnostics.unresolved}`
          : '';
        const recommendedRules = Array.isArray(pricingDiagnostics?.recommendedRules)
          ? pricingDiagnostics.recommendedRules
              .slice(0, 3)
              .map((rule: any) => `${rule.label} (${rule.reference_unit})`)
          : [];
        const rulesDetail = recommendedRules.length
          ? ` · regole utili: ${recommendedRules.join(', ')}`
          : '';
        const skippedSources = Array.isArray(payload?.sourceDiagnostics)
          ? payload.sourceDiagnostics
              .filter((source: any) => !source?.selected && source?.sourceName)
              .slice(0, 3)
              .map(
                (source: any) =>
                  `${source.sourceName}${source.reason ? `: ${source.reason}` : ''}`
              )
          : [];
        const skippedDetail = skippedSources.length
          ? ` · fogli ignorati: ${skippedSources.join(' | ')}`
          : '';
        throw new Error(
          `${payload?.error || 'Import non riuscito'}${detail}${pricingDetail}${rulesDetail}${skippedDetail}`
        );
      }

      if (payload?.sourceStored) {
        await fetchSourceInfo(selectedListino.id, resolvedProfileId);
      } else if (payload?.sourceInfo) {
        setSelectedSourceInfo(payload.sourceInfo as ListinoSourceInfo);
      }

      if (
        payload?.sourceStored &&
        !(payload?.inserted || 0) &&
        !(payload?.updated || 0)
      ) {
        const candidateCount = Number(
          payload?.summary?.parsedRows ||
            payload?.sourceInfo?.parsedSummary?.parsedRows ||
            0
        );
        const pendingCount = Number(
          payload?.summary?.pendingReferenceRows ||
            payload?.sourceInfo?.parsedSummary?.pendingReferenceRows ||
            0
        );
        toast.success(
          candidateCount > 0
            ? `PDF salvato come sorgente tecnica: ${candidateCount} voci candidate${pendingCount > 0 ? `, ${pendingCount} da completare con regole prezzo` : ''}`
            : 'PDF salvato come sorgente del listino'
        );
        if (payload?.aiFeedback || payload?.warning) {
          toast(payload.aiFeedback || payload.warning, { duration: 8000, icon: 'ℹ️' });
        }
        if (payload?.pricingDiagnostics?.recommendedRules?.length) {
          const topRules = payload.pricingDiagnostics.recommendedRules
            .slice(0, 3)
            .map((rule: any) => `${rule.label} (${rule.reference_unit})`)
            .join(', ');
          toast(
            `Imposta le regole prezzo e poi rilancia "Riorganizza con AI": ${topRules}`,
            { icon: '🧠', duration: 8000 }
          );
        }
        await fetchItems(selectedListino.id);
        return;
      }

      const pricingDiagnostics = payload?.pricingDiagnostics;
      const selectedSources = Array.isArray(payload?.sourceDiagnostics)
        ? payload.sourceDiagnostics
            .filter((source: any) => source?.selected)
            .map((source: any) => source?.sourceName)
            .filter(Boolean)
        : [];
      const sourceLabel = selectedSources.length
        ? ` · fogli usati: ${selectedSources.join(', ')}`
        : '';
      const savedLabel = `${payload?.inserted || 0} voci nuove, ${payload?.updated || 0} aggiornate${
        payload?.duplicatesSkipped
          ? `, ${payload.duplicatesSkipped} doppioni ignorati`
          : ''
      }`;
      const skippedLabel = pricingDiagnostics?.unresolved
        ? ` · ${pricingDiagnostics.unresolved} righe senza prezzo non importate`
        : '';
      toast.success(`Listino importato: ${savedLabel}${skippedLabel}${sourceLabel}`);
      const changesLabel = describeListinoChanges(payload?.changes);
      if (changesLabel) {
        toast(`Aggiornamento listino: ${changesLabel}`, { duration: 12000, icon: '📈' });
      }
      await fetchItems(selectedListino.id);
      toast.success('Organizzazione AI avviata automaticamente');
      try {
        await runAiOrganize(selectedListino.id, resolvedProfileId, {
          suppressErrorToast: true,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Organizzazione AI non riuscita';
        toast.error(`Import completato, ma AI non riuscita: ${message}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      e.target.value = '';
      setUploading(false);
    }
  };

  const handleAddManualItem = async () => {
    if (!newDescription.trim() || !selectedListino) {
      toast.error('Inserisci la descrizione');
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single();
      if (!profile) return;

      const item = {
        listino_id: selectedListino.id,
        profile_id: profile.id,
        description: newDescription,
        unit_price: parseFloat(newUnitPrice) || 0,
        markup_percent: parseFloat(newMarkupPercent) || 0,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('listini_vettoriali')
          .update(item)
          .eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const res = await fetch('/api/listini/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item),
        });
        const { embedding } = await res.json();
        await supabase.from('listini_vettoriali').insert({ ...item, embedding });
      }

      toast.success(t('listini.itemAdded'));
      setShowManualModal(false);
      setEditingItem(null);
      setNewDescription('');
      setNewUnitPrice('0');
      setNewMarkupPercent('0');
      fetchItems(selectedListino.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const runAiOrganize = async (
    listinoId: string,
    profileId: string,
    options?: { suppressErrorToast?: boolean }
  ) => {
    try {
      setOrganizingAi(true);
      const res = await resolveListinoJob(
        await uploadWithFetch('/api/listini/ai-organize?async=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listinoId, profileId }),
        })
      );

      const payload = res.payload || {};
      if (!res.ok) {
        throw new Error(payload?.error || 'Organizzazione AI non riuscita');
      }

      if (payload?.usedStoredSource) {
        if (payload?.importedCount) {
          toast.success(
            `AI completata: ${payload.importedCount} voci importate dalla sorgente PDF`
          );
        } else {
          toast.success('Sorgente PDF analizzata');
        }
        if (payload?.aiFeedback) {
          toast(payload.aiFeedback, { duration: 8000, icon: 'ℹ️' });
        }
        if (payload?.pendingPricingGroups) {
          toast(
            `Il PDF non contiene prezzi: indica il prezzo di ${payload.pendingPricingGroups} forme nella sezione "Prezzi per forma".`,
            { duration: 12000, icon: '🧠' }
          );
        }
      } else {
        toast.success(`AI completata: ${payload.updatedCount} voci aggiornate`);
      }
      if (payload?.warning) {
        toast(payload.warning, { duration: 8000, icon: '⚠️' });
      }
      await fetchItems(listinoId);
      await fetchSourceInfo(listinoId, profileId);
    } catch (err) {
      if (!options?.suppressErrorToast) {
        toast.error((err as Error).message);
      }
      throw err;
    } finally {
      setOrganizingAi(false);
    }
  };

  const handleOrganizeWithAi = async () => {
    if (!selectedListino) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const profileId = (
      await supabase.from('profiles').select('id').eq('id', user.id).single()
    ).data?.id;
    if (!profileId) return;
    await runAiOrganize(selectedListino.id, profileId);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">{t('main.listini')}</h1>
      <div className="flex gap-4 mb-6">
        <button onClick={handleCreateListino} className="btn-primary">
          {t('listini.newListino')}
        </button>
        {selectedListino && (
          <>
            <label
              htmlFor="listini-upload-table"
              className={`btn-primary ${uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
              aria-disabled={uploading}
            >
              {uploading ? 'Import in corso...' : 'Carica CSV/Excel'}
            </label>
            <label
              htmlFor="listini-upload-pdf"
              className={`btn-primary ${uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
              aria-disabled={uploading}
              onClick={() => {}}
            >
              {uploading ? 'Import in corso...' : 'Carica PDF'}
            </label>
            <input
              id="listini-upload-table"
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={handleUploadCsv}
              className="sr-only"
              disabled={uploading}
            />
            <input
              id="listini-upload-pdf"
              type="file"
              accept=".pdf"
              onChange={handleUploadCsv}
              onClick={() => {}}
              className="sr-only"
              disabled={uploading}
            />
            <button
              onClick={handleOrganizeWithAi}
              className="btn-secondary"
              disabled={organizingAi || uploading}
            >
              {organizingAi ? 'AI in corso...' : 'Riorganizza con AI'}
            </button>
            <button
              onClick={() => {
                setEditingItem(null);
                setNewMarkupPercent(String(profileMarkupPercent));
                setNewDescription('');
                setNewUnitPrice('0');
                setShowManualModal(true);
              }}
              className="btn-secondary"
            >
              {t('listini.addManual')}
            </button>
          </>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-4">
          <h3 className="font-semibold mb-3">{t('main.listini')}</h3>
          <ul className="space-y-2">
            {listini.map((l) => (
              <li
                key={l.id}
                className={`p-2 rounded flex items-center justify-between group ${selectedListino?.id === l.id ? 'bg-primary text-white' : 'hover:bg-slate-100'}`}
              >
                <span
                  onClick={() => setSelectedListino(l)}
                  className="cursor-pointer flex-1"
                >
                  {l.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingListino(l);
                    setEditingListinoName(l.name);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-slate-700 text-xs px-2"
                >
                  ✏️
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteListino(l.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-800 text-xs px-2"
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          {selectedListino && (
            <>
              <h3 className="font-semibold mb-3">
                {t('listini.items')} {selectedListino.name}
              </h3>
              {selectedSourceInfo && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-800">
                        Sorgente caricata: {selectedSourceInfo.fileName}
                      </div>
                      <div className="text-slate-500">
                        {new Date(selectedSourceInfo.uploadedAt).toLocaleString('it-IT')}
                      </div>
                    </div>
                    {selectedSourceInfo.downloadUrl ? (
                      <a
                        href={selectedSourceInfo.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        Apri PDF
                      </a>
                    ) : null}
                  </div>
                  {selectedSourceInfo.aiFeedback ? (
                    <p className="mt-2 text-slate-700">{selectedSourceInfo.aiFeedback}</p>
                  ) : null}
                </div>
              )}
              {pricingGroups.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-800">Prezzi per forma</div>
                      <p className="text-slate-600">
                        Il PDF non contiene prezzi. Indica il prezzo di ogni forma: le
                        voci si calcolano come peso × prezzo. Le forme senza prezzo non
                        entrano nel listino.
                      </p>
                    </div>
                    <button
                      onClick={handleSaveGroupPrices}
                      className="btn-primary shrink-0"
                      disabled={savingGroupPrices}
                    >
                      {savingGroupPrices ? 'Applico...' : 'Applica prezzi'}
                    </button>
                  </div>
                  <table className="mt-3 w-full">
                    <thead>
                      <tr className="border-b border-amber-200 text-slate-600">
                        <th className="text-left py-1">Forma</th>
                        <th className="text-right py-1">Voci</th>
                        <th className="text-right py-1">Prezzo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricingGroups.map((group) => (
                        <tr key={group.name} className="border-b border-amber-100">
                          <td className="py-1 pr-2">{group.name}</td>
                          <td className="py-1 text-right text-slate-500">
                            {group.item_count}
                          </td>
                          <td className="py-1 text-right">
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={groupPriceDrafts[group.name] ?? ''}
                                onChange={(e) =>
                                  setGroupPriceDrafts((drafts) => ({
                                    ...drafts,
                                    [group.name]: e.target.value,
                                  }))
                                }
                                placeholder="—"
                                aria-label={`Prezzo ${group.name} in euro per ${group.reference_unit}`}
                                className="w-20 rounded border border-slate-300 px-2 py-1 text-right"
                              />
                              <span className="text-slate-500">
                                €/{group.reference_unit}
                              </span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">{t('listini.description')}</th>
                    <th className="text-left py-2">Categoria</th>
                    <th className="text-right py-2">{t('listini.price')}</th>
                    <th className="text-right py-2">{t('listini.markup')}</th>
                    <th className="text-right py-2">{t('listini.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-b group">
                      <td className="py-2">{i.description}</td>
                      <td className="py-2 text-slate-500">{i.category || '-'}</td>
                      <td className="text-right py-2">
                        €{Number(i.unit_price).toFixed(2)}
                      </td>
                      <td className="text-right py-2">
                        {Number(i.markup_percent).toFixed(0)}%
                      </td>
                      <td className="text-right py-2">
                        <button
                          onClick={() => {
                            setEditingItem(i);
                            setNewDescription(i.description);
                            setNewUnitPrice(String(i.unit_price));
                            setNewMarkupPercent(String(i.markup_percent));
                            setShowManualModal(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-800 text-xs mr-2"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteItem(i.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 text-xs"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>

      {/* Manual Item Modal */}
      {showManualModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">{t('listini.newItem')}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('listini.description')}
                </label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder={t('listini.description')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('listini.price')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={newUnitPrice}
                  onChange={(e) => setNewUnitPrice(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {t('listini.markup')}
                </label>
                <input
                  type="number"
                  step="1"
                  value={newMarkupPercent}
                  onChange={(e) => setNewMarkupPercent(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowManualModal(false);
                  setEditingItem(null);
                  setNewDescription('');
                  setNewUnitPrice('0');
                  setNewMarkupPercent('0');
                }}
                className="btn-secondary flex-1"
                disabled={saving}
              >
                {t('listini.cancel')}
              </button>
              <button
                onClick={handleAddManualItem}
                className="btn-primary flex-1"
                disabled={saving}
              >
                {saving
                  ? '...'
                  : editingItem
                    ? t('actions.edit') || 'Modifica'
                    : t('listini.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showPricingRulesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-semibold">Regole prezzo di riferimento</h3>
                <p className="text-sm text-slate-500">
                  Servono per i file che hanno peso, metri o altre misure ma non il
                  prezzo. Esempio: ferro al kg, cavi al metro.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowPricingRulesModal(false);
                  resetPricingRuleForm();
                }}
                className="text-slate-500 hover:text-slate-700"
              >
                Chiudi
              </button>
            </div>

            <div className="mb-6">
              <p className="text-sm font-medium mb-2">Preset rapidi</p>
              <div className="flex flex-wrap gap-2">
                {RULE_PRESETS.map((preset) => (
                  <button
                    key={preset.rule_key}
                    onClick={() => handleApplyPreset(preset)}
                    className="px-3 py-1.5 rounded-full border border-slate-300 text-sm hover:bg-slate-50"
                  >
                    {preset.label} ({preset.reference_unit})
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nome regola</label>
                  <input
                    type="text"
                    value={pricingRuleLabel}
                    onChange={(e) => setPricingRuleLabel(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Es. Ferro / acciaio"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Chiave categoria
                  </label>
                  <input
                    type="text"
                    value={pricingRuleKey}
                    onChange={(e) => setPricingRuleKey(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Es. metal_ferrous"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Unita riferimento
                    </label>
                    <input
                      type="text"
                      value={pricingRuleUnit}
                      onChange={(e) => setPricingRuleUnit(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="kg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Prezzo riferimento
                    </label>
                    <input
                      type="number"
                      step="0.0001"
                      value={pricingRulePrice}
                      onChange={(e) => setPricingRulePrice(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="0.0000"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Fonte</label>
                  <input
                    type="text"
                    value={pricingRuleSourceLabel}
                    onChange={(e) => setPricingRuleSourceLabel(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Es. listino fornitore / mercato metalli"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">URL fonte</label>
                  <input
                    type="url"
                    value={pricingRuleSourceUrl}
                    onChange={(e) => setPricingRuleSourceUrl(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="https://..."
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleSavePricingRule}
                    className="btn-primary"
                    disabled={savingPricingRule}
                  >
                    {savingPricingRule
                      ? 'Salvataggio...'
                      : editingPricingRuleId
                        ? 'Aggiorna regola'
                        : 'Salva regola'}
                  </button>
                  <button
                    onClick={resetPricingRuleForm}
                    className="btn-secondary"
                    disabled={savingPricingRule}
                  >
                    Pulisci
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl border p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold">Regole attive</h4>
                  <button
                    onClick={fetchPricingRules}
                    className="text-sm text-slate-600 hover:text-slate-800"
                  >
                    Aggiorna
                  </button>
                </div>
                {pricingRulesLoading ? (
                  <p className="text-sm text-slate-500">Caricamento...</p>
                ) : pricingRules.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nessuna regola salvata. Se carichi ferro con solo il peso, qui devi
                    impostare almeno una regola €/kg.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {pricingRules.map((rule) => (
                      <div key={rule.id} className="rounded-lg border bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{rule.label}</div>
                            <div className="text-xs text-slate-500">
                              {rule.rule_key} · {rule.reference_unit} ·{' '}
                              {Number(rule.reference_price).toFixed(4)}
                            </div>
                            {(rule.source_label || rule.source_url) && (
                              <div className="text-xs text-slate-500 mt-1 break-all">
                                {[rule.source_label, rule.source_url]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleEditPricingRule(rule)}
                              className="text-slate-600 hover:text-slate-800 text-sm"
                            >
                              Modifica
                            </button>
                            <button
                              onClick={() => handleDeletePricingRule(rule.id)}
                              className="text-red-600 hover:text-red-800 text-sm"
                            >
                              Elimina
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {editingListino && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {t('actions.edit') || 'Modifica listino'}
            </h3>
            <input
              type="text"
              value={editingListinoName}
              onChange={(e) => setEditingListinoName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setEditingListino(null);
                  setEditingListinoName('');
                }}
                className="btn-secondary flex-1"
              >
                {t('listini.cancel')}
              </button>
              <button onClick={handleRenameListino} className="btn-primary flex-1">
                {t('listini.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
