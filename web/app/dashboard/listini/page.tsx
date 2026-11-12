'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { fetchAccessibleListini, type Listino } from '../../../lib/teamListini';

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
  if (!changes || !(changes.increased || changes.decreased || changes.missing)) {
    return null;
  }
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
      reject(new Error('Safari non è riuscito a completare il caricamento del PDF.'));
    xhr.onabort = () => reject(new Error('Upload PDF interrotto in Safari.'));
    xhr.send(formData);
  });
}

// Vercel rejects request bodies over 4.5 MB: larger files go straight to Storage.
const DIRECT_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
// Above this many items the automatic AI categorization would only hit its time budget.
const AUTO_ORGANIZE_MAX_ITEMS = 5000;

function storageContentType(file: File): string {
  if (file.type) return file.type;
  return file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'text/plain';
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
      contentType: storageContentType(params.file),
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
        mimeType: storageContentType(params.file),
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
  const [newDescription, setNewDescription] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('0');
  const [newMarkupPercent, setNewMarkupPercent] = useState('0');
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
  // Supplier discount and markup per category (any listino).
  const [showPricingSettings, setShowPricingSettings] = useState(false);
  const [discountDraft, setDiscountDraft] = useState('');
  const [categoryMarkupRows, setCategoryMarkupRows] = useState<
    Array<{ category: string; itemCount: number; markupPercent: number | null }>
  >([]);
  const [categoryMarkupDrafts, setCategoryMarkupDrafts] = useState<
    Record<string, string>
  >({});
  const [savingPricingSettings, setSavingPricingSettings] = useState(false);
  // Price history: changes recorded when a new price list or shape prices are applied.
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [priceHistory, setPriceHistory] = useState<
    Array<{
      id: string;
      old_price: number;
      new_price: number;
      changed_at: string;
      description: string;
    }>
  >([]);

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
    try {
      setListini(await fetchAccessibleListini(profile.id));
    } catch (err) {
      toast.error((err as Error).message);
    }
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

  const loadPricingSettings = async () => {
    if (!selectedListino) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    try {
      const res = await fetch(
        `/api/listini/settings?listinoId=${encodeURIComponent(selectedListino.id)}&profileId=${encodeURIComponent(user.id)}`
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Lettura impostazioni non riuscita');
      setDiscountDraft(formatGroupPrice(payload.supplierDiscountPercent || null));
      setCategoryMarkupRows(payload.categories || []);
      setCategoryMarkupDrafts(
        Object.fromEntries(
          (payload.categories || []).map(
            (row: { category: string; markupPercent: number | null }) => [
              row.category,
              formatGroupPrice(row.markupPercent),
            ]
          )
        )
      );
    } catch (err) {
      toast.error((err as Error).message);
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
      toast.error(error.message);
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
    if (!selectedListino) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setSavingPricingSettings(true);
    try {
      const res = await fetch('/api/listini/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listinoId: selectedListino.id,
          profileId: user.id,
          supplierDiscountPercent: discountDraft,
          categoryMarkups: categoryMarkupRows.map((row) => ({
            category: row.category,
            markupPercent: categoryMarkupDrafts[row.category] ?? '',
          })),
        }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Salvataggio non riuscito');
      toast.success(
        `Impostazioni salvate${payload.repricedItems ? `: ${payload.repricedItems} prezzi netti ricalcolati` : ''}`
      );
      await fetchItems(selectedListino.id);
      await loadPricingSettings();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPricingSettings(false);
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

  const handleCreateListino = async () => {
    // No browser prompt: a default name, renamed later from the list.
    const name = `Listino ${listini.length + 1}`;
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

  /** Imports one file (PDF, Excel, CSV or METEL) into the given price list. */
  const importFile = async (file: File, target: Listino) => {
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
        formData.append('listinoId', target.id);
        formData.append('originalFileName', file.name);
        formData.append('mimeType', file.type || 'application/pdf');

        try {
          uploadResult = await uploadPdfViaStorageReference({
            file,
            profileId: resolvedProfileId,
            listinoId: target.id,
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
                  listinoId: target.id,
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
      } else if (file.size > DIRECT_UPLOAD_MAX_BYTES) {
        uploadResult = await uploadPdfViaStorageReference({
          file,
          profileId: resolvedProfileId,
          listinoId: target.id,
        });
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('profileId', resolvedProfileId);
        formData.append('listinoId', target.id);
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
        await fetchSourceInfo(target.id, resolvedProfileId);
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
            ? `PDF caricato: abbiamo riconosciuto ${candidateCount} articoli${pendingCount > 0 ? `, di cui ${pendingCount} senza un prezzo chiaro da completare` : ''}.`
            : 'PDF caricato. Non abbiamo ancora trovato articoli con prezzo: controlla il file o aggiungi le voci a mano.'
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
        await fetchItems(target.id);
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
      toast.success(`Listino caricato: ${savedLabel}${skippedLabel}${sourceLabel}`);
      const changesLabel = describeListinoChanges(payload?.changes);
      if (changesLabel) {
        toast(`Aggiornamento listino: ${changesLabel}`, { duration: 12000, icon: '📈' });
      }
      await fetchItems(target.id);
      if (Number(payload?.summary?.parsedRows || 0) > AUTO_ORGANIZE_MAX_ITEMS) {
        toast(
          'Listino molto grande: categorie AI non avviate in automatico. Puoi lanciarle con "Riorganizza con AI".',
          {
            duration: 8000,
            icon: 'ℹ️',
          }
        );
        return;
      }
      toast.success(
        'Ora ordiniamo gli articoli per categoria: ci vuole qualche istante.'
      );
      try {
        await runAiOrganize(target.id, resolvedProfileId, {
          suppressErrorToast: true,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Organizzazione AI non riuscita';
        toast.error(
          `Listino caricato, ma l'ordinamento per categoria non è riuscito: ${message}`
        );
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (file && selectedListino) await importFile(file, selectedListino);
    } finally {
      e.target.value = '';
    }
  };

  /** One button: the price list is created from the file name, then the file is imported. */
  const handleUploadNew = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (!file) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const name =
        file.name
          .replace(/\.[^.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim()
          .slice(0, 80) || 'Il mio listino';
      const { data: created, error } = await supabase
        .from('listini')
        .insert({ profile_id: user.id, name })
        .select('id, name, profile_id')
        .single();
      if (error || !created) {
        toast.error('Non è stato possibile creare il listino. Riprova.');
        return;
      }
      const listino: Listino = { ...created, canEdit: true, ownershipLabel: null };
      await fetchListini();
      setSelectedListino(listino);
      toast.success(`Listino "${name}" creato: puoi rinominarlo quando vuoi.`);
      await importFile(file, listino);
    } finally {
      e.target.value = '';
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
        profile_id: selectedListino.profile_id,
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
      <div className="mb-6 flex flex-wrap gap-4">
        <label
          htmlFor="listini-upload-new"
          className={`btn-primary min-h-[48px] ${uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
          aria-disabled={uploading}
        >
          {uploading ? 'Caricamento in corso…' : 'Carica il tuo listino'}
        </label>
        <input
          id="listini-upload-new"
          type="file"
          accept=".pdf,.csv,.txt,.met,.xlsx,.xls"
          onChange={handleUploadNew}
          className="sr-only"
          disabled={uploading}
        />
        <button onClick={handleCreateListino} className="btn-secondary">
          Listino vuoto (voci a mano)
        </button>
        {selectedListino?.canEdit && (
          <>
            <label
              htmlFor="listini-upload-table"
              className={`btn-primary ${uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
              aria-disabled={uploading}
            >
              {uploading ? 'Caricamento in corso…' : 'Aggiorna da Excel o CSV'}
            </label>
            <label
              htmlFor="listini-upload-pdf"
              className={`btn-primary ${uploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}
              aria-disabled={uploading}
              onClick={() => {}}
            >
              {uploading ? 'Caricamento in corso…' : 'Aggiorna da PDF'}
            </label>
            <input
              id="listini-upload-table"
              type="file"
              accept=".csv,.txt,.met,.xlsx,.xls"
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
                  onClick={() => {
                    setShowPricingSettings(false);
                    setShowPriceHistory(false);
                    setSelectedListino(l);
                  }}
                  className="cursor-pointer flex-1"
                >
                  {l.name}
                  {l.ownershipLabel && (
                    <span className="ml-2 text-xs opacity-70">{l.ownershipLabel}</span>
                  )}
                </span>
                {l.canEdit && (
                  <>
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
                      className="text-danger hover:text-danger-dark text-sm px-3 min-h-[44px]"
                    >
                      Elimina
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          {selectedListino && (
            <>
              <h3 className="font-semibold mb-3">
                {t('listini.items')} {selectedListino.name}
                {!selectedListino.canEdit && (
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    Sola lettura
                  </span>
                )}
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
              {selectedListino.canEdit && (
                <div className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
                  <button
                    type="button"
                    onClick={togglePricingSettings}
                    className="flex w-full items-center justify-between font-medium text-slate-800"
                    aria-expanded={showPricingSettings}
                  >
                    <span>Sconto fornitore e ricarichi</span>
                    <span className="text-slate-500">
                      {showPricingSettings ? '▲' : '▼'}
                    </span>
                  </button>
                  {showPricingSettings && (
                    <div className="mt-3 space-y-3">
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-slate-700">
                          Sconto fornitore sul prezzo di listino
                          <span className="block text-xs text-slate-500">
                            Il prezzo netto delle voci diventa listino × (1 − sconto).
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={discountDraft}
                            onChange={(e) => setDiscountDraft(e.target.value)}
                            placeholder="0"
                            aria-label="Sconto fornitore in percentuale"
                            className="w-20 rounded border border-slate-300 px-2 py-1 text-right"
                          />
                          <span className="text-slate-500">%</span>
                        </span>
                      </label>
                      {categoryMarkupRows.length > 0 && (
                        <table className="w-full">
                          <thead>
                            <tr className="border-b text-slate-600">
                              <th className="text-left py-1">Categoria</th>
                              <th className="text-right py-1">Voci</th>
                              <th className="text-right py-1">Ricarico</th>
                            </tr>
                          </thead>
                          <tbody>
                            {categoryMarkupRows.map((row) => (
                              <tr
                                key={row.category}
                                className="border-b border-slate-100"
                              >
                                <td className="py-1 pr-2">{row.category}</td>
                                <td className="py-1 text-right text-slate-500">
                                  {row.itemCount}
                                </td>
                                <td className="py-1 text-right">
                                  <span className="inline-flex items-center gap-1">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={categoryMarkupDrafts[row.category] ?? ''}
                                      onChange={(e) =>
                                        setCategoryMarkupDrafts((drafts) => ({
                                          ...drafts,
                                          [row.category]: e.target.value,
                                        }))
                                      }
                                      placeholder="—"
                                      aria-label={`Ricarico ${row.category} in percentuale`}
                                      className="w-20 rounded border border-slate-300 px-2 py-1 text-right"
                                    />
                                    <span className="text-slate-500">%</span>
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      <div className="flex justify-end">
                        <button
                          onClick={handleSavePricingSettings}
                          className="btn-primary"
                          disabled={savingPricingSettings}
                        >
                          {savingPricingSettings ? 'Salvo...' : 'Salva e ricalcola'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="mb-4 rounded-lg border border-slate-200 p-3 text-sm">
                <button
                  type="button"
                  onClick={togglePriceHistory}
                  className="flex w-full items-center justify-between font-medium text-slate-800"
                  aria-expanded={showPriceHistory}
                >
                  <span>Ultime variazioni di prezzo</span>
                  <span className="text-slate-500">{showPriceHistory ? '▲' : '▼'}</span>
                </button>
                {showPriceHistory &&
                  (priceHistory.length ? (
                    <table className="mt-3 w-full">
                      <thead>
                        <tr className="border-b text-slate-600">
                          <th className="text-left py-1">Voce</th>
                          <th className="text-right py-1">Prima</th>
                          <th className="text-right py-1">Dopo</th>
                          <th className="text-right py-1">Data</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceHistory.map((change) => {
                          const delta = change.old_price
                            ? Math.round(
                                ((change.new_price - change.old_price) /
                                  change.old_price) *
                                  100
                              )
                            : 0;
                          return (
                            <tr key={change.id} className="border-b border-slate-100">
                              <td className="py-1 pr-2">{change.description}</td>
                              <td className="py-1 text-right">
                                € {formatEuro(change.old_price)}
                              </td>
                              <td className="py-1 text-right">
                                € {formatEuro(change.new_price)}{' '}
                                <span
                                  className={
                                    delta > 0 ? 'text-red-700' : 'text-green-700'
                                  }
                                >
                                  ({delta > 0 ? '+' : ''}
                                  {delta}%)
                                </span>
                              </td>
                              <td className="py-1 text-right text-slate-500">
                                {new Date(change.changed_at).toLocaleDateString('it-IT')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="mt-2 text-slate-600">
                      Nessuna variazione ancora: compariranno quando ricarichi il listino
                      aggiornato del fornitore.
                    </p>
                  ))}
              </div>
              {selectedListino.canEdit && pricingGroups.length > 0 && (
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
                        {selectedListino.canEdit && (
                          <>
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
                              className="text-danger hover:text-danger-dark text-sm px-3 min-h-[44px]"
                            >
                              Elimina
                            </button>
                          </>
                        )}
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
