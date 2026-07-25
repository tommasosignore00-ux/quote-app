'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

type Listino = { id: string; name: string };
type ListinoItem = { id: string; description: string; unit_price: number; markup_percent: number; category?: string | null };
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
  { rule_key: 'metal_nonferrous', label: 'Rame / metalli non ferrosi', reference_unit: 'kg' },
  { rule_key: 'electric_cable', label: 'Cavi elettrici', reference_unit: 'm' },
  { rule_key: 'piping', label: 'Tubazioni / raccordi', reference_unit: 'm' },
  { rule_key: 'paint_chemical', label: 'Vernici / chimici', reference_unit: 'l' },
  { rule_key: 'wood_panel', label: 'Legno / pannelli', reference_unit: 'm2' },
];

const DEBUG_SERVER_URL = 'http://127.0.0.1:7777/event';
const DEBUG_SESSION_ID = 'pdf-upload-pattern-error';

function fileToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    const base64 = btoa(binary);
    if (!base64) {
      throw new Error('Non sono riuscito a leggere il PDF selezionato.');
    }
    return base64;
  });
}

function reportDebugEvent(event: {
  runId: 'pre-fix' | 'post-fix';
  hypothesisId: 'A' | 'B' | 'C' | 'D' | 'E';
  location: string;
  msg: string;
  data?: Record<string, unknown>;
}) {
  if (process.env.NODE_ENV === 'production') return;
  fetch(DEBUG_SERVER_URL, {
    method: 'POST',
    body: JSON.stringify({
      sessionId: DEBUG_SESSION_ID,
      runId: event.runId,
      hypothesisId: event.hypothesisId,
      location: event.location,
      msg: event.msg,
      data: event.data || {},
      ts: Date.now(),
    }),
  }).catch(() => {});
}

export default function ListiniPage() {
  const { t } = useTranslation();
  const [listini, setListini] = useState<Listino[]>([]);
  const [items, setItems] = useState<ListinoItem[]>([]);
  const [selectedListino, setSelectedListino] = useState<Listino | null>(null);
  const [selectedSourceInfo, setSelectedSourceInfo] = useState<ListinoSourceInfo | null>(null);
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
  const uploadTableInputRef = useRef<HTMLInputElement | null>(null);
  const uploadPdfInputRef = useRef<HTMLInputElement | null>(null);

  const fetchListini = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('id, material_markup_vat_percent').eq('id', user.id).single();
    if (!profile) return;
    setProfileId(profile.id);
    setProfileMarkupPercent(profile.material_markup_vat_percent ?? 0);
    const { data } = await supabase.from('listini').select('id, name').eq('profile_id', profile.id);
    setListini(data || []);
  };

  const fetchItems = async (listinoId: string) => {
    const { data } = await supabase.from('listini_vettoriali').select('id, description, unit_price, markup_percent, category').eq('listino_id', listinoId);
    setItems(data || []);
  };

  const fetchSourceInfo = async (listinoId: string, nextProfileId: string) => {
    try {
      const res = await fetch(`/api/listini/source?listinoId=${encodeURIComponent(listinoId)}&profileId=${encodeURIComponent(nextProfileId)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Lettura sorgente non riuscita');
      setSelectedSourceInfo(payload?.sourceInfo || null);
    } catch {
      setSelectedSourceInfo(null);
    }
  };

  const fetchPricingRules = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setPricingRulesLoading(true);
    try {
      const { data, error } = await supabase
        .from('pricing_reference_rules')
        .select('id, rule_key, label, reference_unit, reference_price, source_label, source_url, active')
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

  useEffect(() => { fetchListini(); }, []);
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
    const { data: { user } } = await supabase.auth.getUser();
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
        ? supabase.from('pricing_reference_rules').update(payload).eq('id', editingPricingRuleId)
        : supabase.from('pricing_reference_rules').insert(payload);
      const { error } = await query;
      if (error) throw error;

      toast.success(editingPricingRuleId ? 'Regola prezzo aggiornata' : 'Regola prezzo salvata');
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
      const { error } = await supabase.from('pricing_reference_rules').delete().eq('id', ruleId);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single();
    if (!profile) return;
    const { error } = await supabase.from('listini').insert({ profile_id: profile.id, name });
    if (error) toast.error(error.message);
    else { toast.success(t('listini.listiniCreated')); fetchListini(); }
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
      const { error } = await supabase.from('listini').update({ name: editingListinoName.trim() }).eq('id', editingListino.id);
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
      const { error } = await supabase.from('listini_vettoriali').delete().eq('id', itemId);
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
      // #region debug-point A:web-upload-start
      reportDebugEvent({
        runId: 'pre-fix',
        hypothesisId: 'A',
        location: 'web/app/dashboard/listini/page.tsx:handleUploadCsv:start',
        msg: '[DEBUG] Web upload started',
        data: {
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          selectedListinoId: selectedListino.id,
        },
      });
      // #endregion
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const resolvedProfileId = profileId || (await supabase.from('profiles').select('id').eq('id', user.id).single()).data?.id;
      if (!resolvedProfileId) return;

      // #region debug-point B:web-upload-before-fetch
      reportDebugEvent({
        runId: 'pre-fix',
        hypothesisId: 'B',
        location: 'web/app/dashboard/listini/page.tsx:handleUploadCsv:before-fetch',
        msg: '[DEBUG] Web upload about to call API',
        data: {
          fileName: file.name,
          fileType: file.type,
          profileId: resolvedProfileId,
          listinoId: selectedListino.id,
        },
      });
      // #endregion

      let res: Response;
      if ((file.type || '').toLowerCase() === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const fileBase64 = await fileToBase64(file);
        res = await fetch('/api/listini/upload', {
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
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('profileId', resolvedProfileId);
        formData.append('listinoId', selectedListino.id);
        res = await fetch('/api/listini/upload', {
          method: 'POST',
          body: formData,
        });
      }

      // #region debug-point B:web-upload-response
      res.clone().text().then((body) => {
        reportDebugEvent({
          runId: 'pre-fix',
          hypothesisId: 'B',
          location: 'web/app/dashboard/listini/page.tsx:handleUploadCsv:after-fetch',
          msg: '[DEBUG] Web upload received response',
          data: {
            status: res.status,
            ok: res.ok,
            contentType: res.headers.get('content-type'),
            bodyPreview: body.slice(0, 500),
          },
        });
      }).catch((cloneError) => {
        reportDebugEvent({
          runId: 'pre-fix',
          hypothesisId: 'B',
          location: 'web/app/dashboard/listini/page.tsx:handleUploadCsv:after-fetch',
          msg: '[DEBUG] Web upload response clone failed',
          data: {
            status: res.status,
            error: cloneError instanceof Error ? cloneError.message : String(cloneError),
          },
        });
      });
      // #endregion
      const payload = await res.json();
      if (!res.ok) {
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
        const rulesDetail = recommendedRules.length ? ` · regole utili: ${recommendedRules.join(', ')}` : '';
        const skippedSources = Array.isArray(payload?.sourceDiagnostics)
          ? payload.sourceDiagnostics
              .filter((source: any) => !source?.selected && source?.sourceName)
              .slice(0, 3)
              .map((source: any) => `${source.sourceName}${source.reason ? `: ${source.reason}` : ''}`)
          : [];
        const skippedDetail = skippedSources.length ? ` · fogli ignorati: ${skippedSources.join(' | ')}` : '';
        throw new Error(`${payload?.error || 'Import non riuscito'}${detail}${pricingDetail}${rulesDetail}${skippedDetail}`);
      }

      if (payload?.sourceStored) {
        await fetchSourceInfo(selectedListino.id, resolvedProfileId);
      } else if (payload?.sourceInfo) {
        setSelectedSourceInfo(payload.sourceInfo as ListinoSourceInfo);
      }

      if (payload?.sourceStored && (!payload?.inserted || payload.inserted === 0)) {
        toast.success('PDF salvato come sorgente del listino');
        if (payload?.aiFeedback) {
          toast(payload.aiFeedback, { duration: 8000, icon: 'ℹ️' });
        }
        if (payload?.pricingDiagnostics?.recommendedRules?.length) {
          const topRules = payload.pricingDiagnostics.recommendedRules
            .slice(0, 3)
            .map((rule: any) => `${rule.label} (${rule.reference_unit})`)
            .join(', ');
          toast(`Imposta le regole prezzo e poi rilancia "Riorganizza con AI": ${topRules}`, { icon: '🧠', duration: 8000 });
        }
        await fetchItems(selectedListino.id);
        return;
      }

      const summary = payload.summary;
      const pricingDiagnostics = payload?.pricingDiagnostics;
      const selectedSources = Array.isArray(payload?.sourceDiagnostics)
        ? payload.sourceDiagnostics.filter((source: any) => source?.selected).map((source: any) => source?.sourceName).filter(Boolean)
        : [];
      const sourceLabel = selectedSources.length ? ` · sorgenti: ${selectedSources.join(', ')}` : '';
      const pricingLabel = pricingDiagnostics
        ? ` · file: ${pricingDiagnostics.resolvedFromFile} · derivati: ${pricingDiagnostics.resolvedFromDerived} · regole: ${pricingDiagnostics.resolvedFromRule} · senza prezzo: ${pricingDiagnostics.unresolved}`
        : '';
      toast.success(
        `${summary.parsedRows}/${summary.totalRows} ${t('listini.itemsAdded')} · normalize: ${summary.normalizedPriceRows} · unita rilevate: ${summary.unitDetectedRows}${pricingLabel}${sourceLabel}`
      );
      if (pricingDiagnostics?.unresolved && Array.isArray(pricingDiagnostics?.recommendedRules) && pricingDiagnostics.recommendedRules.length) {
        const topRules = pricingDiagnostics.recommendedRules
          .slice(0, 3)
          .map((rule: any) => `${rule.label} (${rule.reference_unit})`)
          .join(', ');
        toast(`Per completare il resto, imposta le regole prezzo: ${topRules}`, { icon: 'ℹ️' });
      }
      await fetchItems(selectedListino.id);
      toast.success('Organizzazione AI avviata automaticamente');
      try {
        await runAiOrganize(selectedListino.id, resolvedProfileId, { suppressErrorToast: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Organizzazione AI non riuscita';
        toast.error(`Import completato, ma AI non riuscita: ${message}`);
      }
    } catch (err) {
      // #region debug-point A:web-upload-catch
      reportDebugEvent({
        runId: 'pre-fix',
        hypothesisId: 'A',
        location: 'web/app/dashboard/listini/page.tsx:handleUploadCsv:catch',
        msg: '[DEBUG] Web upload threw before completion',
        data: {
          error: err instanceof Error ? err.message : String(err),
          name: err instanceof Error ? err.name : typeof err,
        },
      });
      // #endregion
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single();
      if (!profile) return;

      const item = {
        listino_id: selectedListino.id,
        profile_id: profile.id,
        description: newDescription,
        unit_price: parseFloat(newUnitPrice) || 0,
        markup_percent: parseFloat(newMarkupPercent) || 0,
      };

      if (editingItem) {
        const { error } = await supabase.from('listini_vettoriali').update(item).eq('id', editingItem.id);
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
      const res = await fetch('/api/listini/ai-organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listinoId, profileId }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || 'Organizzazione AI non riuscita');
      }

      if (payload?.usedStoredSource) {
        if (payload?.importedCount) {
          toast.success(`AI completata: ${payload.importedCount} voci importate dalla sorgente PDF`);
        } else {
          toast.success('Sorgente PDF analizzata');
        }
        if (payload?.aiFeedback) {
          toast(payload.aiFeedback, { duration: 8000, icon: 'ℹ️' });
        }
      } else {
        toast.success(`AI completata: ${payload.updatedCount} voci aggiornate`);
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const profileId = (await supabase.from('profiles').select('id').eq('id', user.id).single()).data?.id;
    if (!profileId) return;
    await runAiOrganize(selectedListino.id, profileId);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">{t('main.listini')}</h1>
      <div className="flex gap-4 mb-6">
        <button onClick={handleCreateListino} className="btn-primary">{t('listini.newListino')}</button>
        {selectedListino && (
          <>
            <button
              onClick={() => uploadTableInputRef.current?.click()}
              className="btn-primary"
              disabled={uploading}
            >
              {uploading ? 'Import in corso...' : 'Carica CSV/Excel'}
            </button>
            <button
              onClick={() => uploadPdfInputRef.current?.click()}
              className="btn-primary"
              disabled={uploading}
            >
              {uploading ? 'Import in corso...' : 'Carica PDF'}
            </button>
            <input
              ref={uploadTableInputRef}
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
              onChange={handleUploadCsv}
              className="hidden"
              disabled={uploading}
            />
            <input
              ref={uploadPdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handleUploadCsv}
              className="hidden"
              disabled={uploading}
            />
            <button onClick={openPricingRulesModal} className="btn-secondary" disabled={uploading || organizingAi}>
              Regole prezzo
            </button>
            <button onClick={handleOrganizeWithAi} className="btn-secondary" disabled={organizingAi || uploading}>
              {organizingAi ? 'AI in corso...' : 'Riorganizza con AI'}
            </button>
            <button onClick={() => {
              setEditingItem(null);
              setNewMarkupPercent(String(profileMarkupPercent));
              setNewDescription('');
              setNewUnitPrice('0');
              setShowManualModal(true);
            }} className="btn-secondary">{t('listini.addManual')}</button>
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
                  onClick={(e) => { e.stopPropagation(); handleDeleteListino(l.id); }} 
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
              <h3 className="font-semibold mb-3">{t('listini.items')} {selectedListino.name}</h3>
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
                  {selectedSourceInfo.requiresPricingRules && selectedSourceInfo.pricingDiagnostics?.recommendedRules?.length ? (
                    <p className="mt-2 text-slate-600">
                      Regole consigliate: {selectedSourceInfo.pricingDiagnostics.recommendedRules
                        .slice(0, 3)
                        .map((rule) => `${rule.label} (${rule.reference_unit})`)
                        .join(', ')}
                    </p>
                  ) : null}
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
                      <td className="text-right py-2">€{Number(i.unit_price).toFixed(2)}</td>
                      <td className="text-right py-2">{Number(i.markup_percent).toFixed(0)}%</td>
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
                <label className="block text-sm font-medium mb-1">{t('listini.description')}</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder={t('listini.description')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('listini.price')}</label>
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
                <label className="block text-sm font-medium mb-1">{t('listini.markup')}</label>
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
                {saving ? '...' : editingItem ? (t('actions.edit') || 'Modifica') : t('listini.save')}
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
                  Servono per i file che hanno peso, metri o altre misure ma non il prezzo. Esempio: ferro al kg, cavi al metro.
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
                  <label className="block text-sm font-medium mb-1">Chiave categoria</label>
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
                    <label className="block text-sm font-medium mb-1">Unita riferimento</label>
                    <input
                      type="text"
                      value={pricingRuleUnit}
                      onChange={(e) => setPricingRuleUnit(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2"
                      placeholder="kg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Prezzo riferimento</label>
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
                  <button onClick={handleSavePricingRule} className="btn-primary" disabled={savingPricingRule}>
                    {savingPricingRule ? 'Salvataggio...' : editingPricingRuleId ? 'Aggiorna regola' : 'Salva regola'}
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
                  <button onClick={fetchPricingRules} className="text-sm text-slate-600 hover:text-slate-800">
                    Aggiorna
                  </button>
                </div>
                {pricingRulesLoading ? (
                  <p className="text-sm text-slate-500">Caricamento...</p>
                ) : pricingRules.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nessuna regola salvata. Se carichi ferro con solo il peso, qui devi impostare almeno una regola €/kg.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {pricingRules.map((rule) => (
                      <div key={rule.id} className="rounded-lg border bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium">{rule.label}</div>
                            <div className="text-xs text-slate-500">
                              {rule.rule_key} · {rule.reference_unit} · {Number(rule.reference_price).toFixed(4)}
                            </div>
                            {(rule.source_label || rule.source_url) && (
                              <div className="text-xs text-slate-500 mt-1 break-all">
                                {[rule.source_label, rule.source_url].filter(Boolean).join(' · ')}
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
            <h3 className="text-lg font-semibold mb-4">{t('actions.edit') || 'Modifica listino'}</h3>
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
              <button
                onClick={handleRenameListino}
                className="btn-primary flex-1"
              >
                {t('listini.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
