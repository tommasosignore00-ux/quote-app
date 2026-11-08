'use client';

import { useState, useEffect, useCallback } from 'react';
import { resolveVatPercent } from '@/lib/constants';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import VoiceButton from '@/components/VoiceButton';
import QuotePreview from '@/components/QuotePreview';
import CostoEditor from '@/components/CostoEditor';
import VoiceConfirmModal, {
  type VoiceCandidate,
  type VoiceDraft,
  type VoiceDraftItem,
} from '@/components/VoiceConfirmModal';
import {
  extractSpokenItems,
  parseItalianNumber,
  type SpokenItem,
  type VoiceResult,
} from '@/lib/voiceResult';
import { useRealtime } from '@/lib/useRealtime';

type Cliente = { id: string; name: string };
type Lavoro = {
  id: string;
  title: string;
  cliente_id: string;
  status: string;
  clienti?: any;
};
type Costo = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
};
type ListinoMatchItem = {
  id: string;
  description: string;
  unit_price: number;
  markup_percent?: number;
  listino_id?: string | null;
  listino_name?: string | null;
  category?: string | null;
  fullMatch?: boolean;
};

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  useSessionTimeout(); // Monitor inactivity and auto-logout
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [selectedLavoro, setSelectedLavoro] = useState<Lavoro | null>(null);
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [costi, setCosti] = useState<Costo[]>([]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileCountryCode, setProfileCountryCode] = useState<string | null>(null);
  const [profileVatPercent, setProfileVatPercent] = useState<number>(22);
  const [profileMaterialMarkup, setProfileMaterialMarkup] = useState<number>(0);
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [savingVoiceDraft, setSavingVoiceDraft] = useState(false);

  const [showClientModal, setShowClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [creatingClient, setCreatingClient] = useState(false);

  const [showJobModal, setShowJobModal] = useState(false);
  const [newJobTitle, setNewJobTitle] = useState('');
  const [jobClienteId, setJobClienteId] = useState<string | null>(null);
  const [creatingJob, setCreatingJob] = useState(false);

  const [showCostoModal, setShowCostoModal] = useState(false);
  const [newCostoDesc, setNewCostoDesc] = useState('');
  const [newCostoQty, setNewCostoQty] = useState('1');
  const [newCostoUnit, setNewCostoUnit] = useState('');
  const [newCostoPrice, setNewCostoPrice] = useState('0');
  const [creatingCosto, setCreatingCosto] = useState(false);
  const [matchedListinoItem, setMatchedListinoItem] = useState<ListinoMatchItem | null>(
    null
  );
  const [clientSearch, setClientSearch] = useState('');
  const [listinoAlternatives, setListinoAlternatives] = useState<ListinoMatchItem[]>([]);

  const fetchData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    // Try with vat_percent and material_markup first; fall back to id-only if columns don't exist yet
    let pid = user.id;
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, vat_percent, material_markup, country_code')
      .eq('id', user.id)
      .single();
    if (profile) {
      pid = profile.id;
      setProfileCountryCode(profile.country_code || null);
      setProfileVatPercent(resolveVatPercent(profile.vat_percent));
      setProfileMaterialMarkup(Number(profile.material_markup) || 0);
    } else if (profileErr) {
      // Columns might not exist yet – try without them
      console.warn(
        'Profile fetch with vat_percent/material_markup failed, retrying:',
        profileErr.message
      );
      const { data: profileFallback } = await supabase
        .from('profiles')
        .select('id, country_code')
        .eq('id', user.id)
        .single();
      if (profileFallback) {
        pid = profileFallback.id;
        setProfileCountryCode(profileFallback.country_code || null);
      }
    }
    setProfileId(pid);

    const { data: c } = await supabase
      .from('clienti')
      .select('id, name')
      .eq('profile_id', pid);
    setClienti(c || []);

    const { data: l } = await supabase
      .from('lavori')
      .select('id, title, cliente_id, status, clienti(name)')
      .eq('profile_id', pid);
    // Accepted quotes are final: they live only in the Preventivi section.
    setLavori((l || []).filter((job) => job.status !== 'approved'));

    if (selectedLavoro) {
      const { data: costiData } = await supabase
        .from('preventivi_dettaglio')
        .select('id, description, quantity, unit_price, tax_rate')
        .eq('lavoro_id', selectedLavoro.id);
      setCosti(costiData || []);
    }
  }, [selectedLavoro?.id]);

  useRealtime(profileId, fetchData);

  // The open job was accepted meanwhile: it has left this page.
  useEffect(() => {
    if (selectedLavoro && !lavori.some((job) => job.id === selectedLavoro.id)) {
      setSelectedLavoro(null);
    }
  }, [lavori, selectedLavoro]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const listinoSalePrice = (item: { unit_price: number; markup_percent?: number }) =>
    Number(item.unit_price) *
    (1 + (Number(item.markup_percent) || profileMaterialMarkup) / 100);

  // Auto-search listino when typing cost description
  useEffect(() => {
    if (!newCostoDesc.trim() || !profileId || !showCostoModal) {
      setMatchedListinoItem(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/listini/text-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: newCostoDesc, profileId }),
        });
        const match = await res.json();
        const found: ListinoMatchItem[] = match.item
          ? [match.item, ...(match.alternatives || [])]
          : [];
        const exact = match.fullMatch ? found.filter((item) => item.fullMatch) : [];

        if (exact.length === 1) {
          // The price shown is the one that will be saved, markup included.
          setMatchedListinoItem(exact[0]);
          setNewCostoPrice(listinoSalePrice(exact[0]).toFixed(2));
          setListinoAlternatives([]);
        } else {
          setMatchedListinoItem(null);
          setListinoAlternatives(found);
        }
      } catch (err) {
        console.error('[Dashboard] Error searching listino:', err);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timer);
  }, [newCostoDesc, profileId, showCostoModal]);

  const handleCreateClient = async () => {
    if (!newClientName.trim()) {
      toast.error('Inserisci il nome del cliente');
      return;
    }
    if (!profileId) {
      toast.error(t('messages.notAuthenticated'));
      return;
    }
    setCreatingClient(true);
    try {
      const { data: created, error } = await supabase
        .from('clienti')
        .insert({ profile_id: profileId, name: newClientName })
        .select('*');
      if (error) throw error;
      if (created?.[0]) setClienti((p) => [...p, created[0]]);
      setNewClientName('');
      setShowClientModal(false);
      toast.success(t('messages.saved'));
    } catch (err: unknown) {
      console.error('Client creation error:', err);
      toast.error((err as Error).message);
    } finally {
      setCreatingClient(false);
    }
  };

  const handleCreateJob = async () => {
    if (!newJobTitle.trim() || !jobClienteId || !profileId) return;
    setCreatingJob(true);
    try {
      const { data: created, error } = await supabase
        .from('lavori')
        .insert({ profile_id: profileId, title: newJobTitle, cliente_id: jobClienteId })
        .select('*');
      if (error) throw error;
      if (created?.[0]) setLavori((p) => [created[0], ...p]);
      setNewJobTitle('');
      setJobClienteId(null);
      setShowJobModal(false);
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setCreatingJob(false);
    }
  };

  const handleDeleteClient = async (clientId: string) => {
    if (!confirm(t('dashboard.deleteConfirm'))) return;
    try {
      const { error } = await supabase.from('clienti').delete().eq('id', clientId);
      if (error) throw error;
      toast.success(t('dashboard.deleted'));
      fetchData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!confirm(t('dashboard.deleteConfirm'))) return;
    try {
      const { error } = await supabase.from('lavori').delete().eq('id', jobId);
      if (error) throw error;
      if (selectedLavoro?.id === jobId) setSelectedLavoro(null);
      toast.success(t('dashboard.deleted'));
      fetchData();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleCreateCosto = async () => {
    if (!newCostoDesc.trim() || !selectedLavoro) return;
    setCreatingCosto(true);
    try {
      const quantity = parseFloat(newCostoQty) || 1;

      // Use matched item if available
      if (matchedListinoItem) {
        const price = listinoSalePrice(matchedListinoItem);
        const { data: created, error } = await supabase
          .from('preventivi_dettaglio')
          .insert({
            lavoro_id: selectedLavoro.id,
            description: matchedListinoItem.description,
            quantity,
            unit_price: price,
            tax_rate: profileVatPercent,
            listino_item_id: matchedListinoItem.id,
            // Empty: the database copies the unit of the price list item.
            unit: newCostoUnit.trim() || null,
          })
          .select('*');
        if (error) throw error;
        if (created?.[0]) setCosti((prev) => [created[0], ...prev]);
        setNewCostoDesc('');
        setNewCostoQty('1');
        setNewCostoUnit('');
        setNewCostoPrice('0');
        setMatchedListinoItem(null);
        setListinoAlternatives([]);
        setShowCostoModal(false);
        toast.success('Prezzo preso dal listino');
        return;
      }

      // No match - use manual price
      const unitPrice = parseFloat(newCostoPrice) || 0;
      const { data: created, error } = await supabase
        .from('preventivi_dettaglio')
        .insert({
          lavoro_id: selectedLavoro.id,
          description: newCostoDesc,
          quantity,
          unit_price: unitPrice,
          tax_rate: profileVatPercent,
          unit: newCostoUnit.trim() || null,
        })
        .select('*');
      if (error) throw error;
      if (created?.[0]) setCosti((prev) => [created[0], ...prev]);
      setNewCostoDesc('');
      setNewCostoQty('1');
      setNewCostoUnit('');
      setNewCostoPrice('0');
      setMatchedListinoItem(null);
      setListinoAlternatives([]);
      setShowCostoModal(false);
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setCreatingCosto(false);
    }
  };

  const handleSelectCliente = (clienteId: string) => {
    setSelectedClienteId(selectedClienteId === clienteId ? null : clienteId);
    setSelectedLavoro(null);
  };

  const selectedCliente =
    clienti.find((cliente) => cliente.id === selectedClienteId) || null;
  const voiceContext = {
    appLanguage: i18n.language,
    selectedInputLanguage: i18n.language,
    userIntentMode: 'voice',
    company: {
      country: profileCountryCode,
      locale: i18n.language,
      defaultVatRate: profileVatPercent,
      vatMode: 'standard',
    },
    currentCustomer: selectedCliente
      ? {
          id: selectedCliente.id,
          name: selectedCliente.name,
          companyName: selectedCliente.name,
        }
      : null,
    currentJob: selectedLavoro
      ? {
          id: selectedLavoro.id,
          customerId: selectedLavoro.cliente_id,
          title: selectedLavoro.title,
        }
      : null,
    currentQuote: selectedLavoro
      ? {
          jobId: selectedLavoro.id,
          customerId: selectedLavoro.cliente_id,
          language: i18n.language,
          items: costi.map((costo) => ({
            id: costo.id,
            description: costo.description,
            quantity: costo.quantity,
            unitPrice: costo.unit_price,
            vatRate: costo.tax_rate,
          })),
        }
      : null,
    existingCustomers: clienti.map((cliente) => ({
      id: cliente.id,
      name: cliente.name,
      companyName: cliente.name,
    })),
    existingJobs: lavori.map((lavoro) => ({
      id: lavoro.id,
      customerId: lavoro.cliente_id,
      title: lavoro.title,
    })),
  };

  /** Price list candidates for one spoken item: words first, meaning only as a fallback. */
  const buildVoiceDraftItem = async (
    spoken: SpokenItem,
    index: number
  ): Promise<VoiceDraftItem> => {
    const post = async (url: string) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: spoken.description, profileId }),
      });
      return res.ok ? res.json() : { item: null, alternatives: [] };
    };
    const byWords = await post('/api/listini/text-search');
    let candidates: VoiceCandidate[] = byWords.item
      ? [byWords.item, ...(byWords.alternatives || [])]
      : [];
    if (candidates.length === 0) {
      const byMeaning = await post('/api/voice/semantic-match');
      candidates = (byMeaning.alternatives || []).map((item: VoiceCandidate) => ({
        ...item,
        fullMatch: false,
        semantic: true,
      }));
    }
    const exact = candidates.filter((candidate) => candidate.fullMatch);
    return {
      key: `${Date.now()}-${index}`,
      spoken: spoken.description,
      quantity: spoken.quantity === null ? '' : String(spoken.quantity).replace('.', ','),
      unit: spoken.unit || '',
      price: spoken.unitPrice === null ? '' : String(spoken.unitPrice).replace('.', ','),
      candidates,
      choice: exact.length === 1 ? candidates.indexOf(exact[0]) : -1,
    };
  };

  // Nothing dictated is saved here: every result opens a confirmation first.
  const handleVoiceResult = async (result: VoiceResult) => {
    const intent = String(result.agent?.intent || '');
    if (intent === 'remove_quote_items' || intent === 'edit_quote_items') {
      toast.error(
        'A voce puoi solo aggiungere voci: togli o modifica le voci dalla lista.'
      );
      return;
    }
    const spokenItems = extractSpokenItems(result);

    if (result.action === 'create_cliente' && result.data?.name && !spokenItems.length) {
      setVoiceDraft({ kind: 'cliente', name: String(result.data.name).trim() });
      return;
    }

    if (result.action === 'create_lavoro' && result.data?.title && !spokenItems.length) {
      let clienteId = clienti.find((c) => c.id === result.data?.cliente_id)?.id;
      if (!clienteId && result.data.cliente_name) {
        const spokenName = String(result.data.cliente_name).toLowerCase();
        const matches = clienti.filter((c) => c.name.toLowerCase().includes(spokenName));
        if (matches.length === 1) clienteId = matches[0].id;
      }
      setVoiceDraft({
        kind: 'lavoro',
        title: String(result.data.title).trim(),
        clienteId: clienteId || selectedClienteId || '',
      });
      return;
    }

    if (spokenItems.length) {
      if (!selectedLavoro) {
        toast.error('Apri prima il lavoro a cui aggiungere le voci, poi riprova.');
        return;
      }
      const items = await Promise.all(spokenItems.map(buildVoiceDraftItem));
      setVoiceDraft({ kind: 'items', transcript: result.text || '', items });
      return;
    }

    const question = result.agent?.clarification?.questions?.[0];
    toast.error(
      typeof question === 'string' && question.trim()
        ? question.trim()
        : result.text
          ? `Non ho capito cosa fare. Ho sentito: "${result.text}".`
          : 'Non ho sentito niente, riprova.'
    );
  };

  const handleConfirmVoiceDraft = async (draft: VoiceDraft) => {
    if (!profileId) return;
    setSavingVoiceDraft(true);
    try {
      if (draft.kind === 'cliente') {
        const { data: created, error } = await supabase
          .from('clienti')
          .insert({ profile_id: profileId, name: draft.name.trim() })
          .select('*');
        if (error) throw error;
        if (created?.[0]) setClienti((p) => [...p, created[0]]);
      } else if (draft.kind === 'lavoro') {
        const { error } = await supabase
          .from('lavori')
          .insert({
            profile_id: profileId,
            cliente_id: draft.clienteId,
            title: draft.title.trim(),
          });
        if (error) throw error;
      } else {
        if (!selectedLavoro) throw new Error('Nessun lavoro aperto');
        const rows = draft.items.map((item) => {
          const match = item.candidates[item.choice];
          const ownPrice = parseItalianNumber(item.price);
          return {
            lavoro_id: selectedLavoro.id,
            description: match?.description || item.spoken,
            quantity: parseItalianNumber(item.quantity) as number,
            unit_price: ownPrice ?? (match ? listinoSalePrice(match) : 0),
            tax_rate: profileVatPercent,
            listino_item_id: match?.id || null,
            // Empty: the database copies the unit of the price list item.
            unit: item.unit.trim() || null,
          };
        });
        const { error } = await supabase.from('preventivi_dettaglio').insert(rows);
        if (error) throw error;
      }
      setVoiceDraft(null);
      toast.success(t('messages.saved'));
      fetchData();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingVoiceDraft(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">{t('main.jobs')}</h1>
            <VoiceButton
              onResult={handleVoiceResult}
              clienti={clienti}
              context={voiceContext}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{t('dashboard.clients')}</h3>
                <button
                  onClick={() => setShowClientModal(true)}
                  className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
                >
                  + Add
                </button>
              </div>
              <input
                type="text"
                placeholder={t('dashboard.searchClient') || 'Cerca cliente...'}
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <ul className="space-y-2 max-h-60 overflow-y-auto">
                {clienti
                  .filter(
                    (c) =>
                      !clientSearch.trim() ||
                      c.name.toLowerCase().includes(clientSearch.toLowerCase())
                  )
                  .map((c) => (
                    <li
                      key={c.id}
                      className={`text-sm p-2 rounded flex items-center justify-between group cursor-pointer transition-colors ${
                        selectedClienteId === c.id
                          ? 'bg-primary text-white'
                          : 'hover:bg-slate-100'
                      }`}
                    >
                      <span onClick={() => handleSelectCliente(c.id)} className="flex-1">
                        {c.name}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClient(c.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 text-xs px-2"
                      >
                        🗑️
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{t('dashboard.jobs')}</h3>
                <button
                  onClick={() => {
                    setJobClienteId(clienti[0]?.id ?? null);
                    setShowJobModal(true);
                  }}
                  className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
                >
                  + Add
                </button>
              </div>
              <ul className="space-y-2 max-h-60 overflow-y-auto">
                {(!selectedClienteId
                  ? lavori
                  : lavori.filter((l) => l.cliente_id === selectedClienteId)
                ).map((l) => (
                  <li
                    key={l.id}
                    className={`text-sm p-2 rounded flex items-center justify-between group ${selectedLavoro?.id === l.id ? 'bg-primary text-white' : 'hover:bg-slate-100'}`}
                  >
                    <span
                      onClick={() => setSelectedLavoro(l)}
                      className="cursor-pointer flex-1"
                    >
                      {selectedClienteId
                        ? l.title
                        : `${(l.clienti as { name?: string })?.name || ''} - ${l.title}`}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteJob(l.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-800 text-xs px-2"
                    >
                      🗑️
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {selectedLavoro && (
            <div className="mt-6 bg-white rounded-xl shadow p-4">
              <div className="flex justify-between items-center mb-4">
                <h3>
                  {t('dashboard.details')} {selectedLavoro.title}
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCostoModal(true)}
                    className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded"
                  >
                    + {t('dashboard.addCost')}
                  </button>
                  <QuotePreview lavoroId={selectedLavoro.id} lavoro={selectedLavoro} />
                </div>
              </div>
              <CostoEditor
                costi={costi}
                lavoroId={selectedLavoro.id}
                onUpdate={fetchData}
                defaultVatPercent={profileVatPercent}
              />
            </div>
          )}
        </div>
      </div>

      {voiceDraft && (
        <VoiceConfirmModal
          draft={voiceDraft}
          clienti={clienti}
          saving={savingVoiceDraft}
          salePrice={listinoSalePrice}
          onConfirm={handleConfirmVoiceDraft}
          onCancel={() => setVoiceDraft(null)}
        />
      )}

      {showClientModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-modal-title"
        >
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 id="client-modal-title" className="text-lg font-bold mb-4">
              {t('dashboard.addClient')}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('dashboard.clientName')}
              </label>
              <input
                type="text"
                placeholder={t('dashboard.clientName')}
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowClientModal(false)}
                className="px-4 py-2 rounded-lg border hover:bg-slate-50"
              >
                {t('dashboard.cancel')}
              </button>
              <button
                onClick={handleCreateClient}
                disabled={creatingClient}
                className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90"
              >
                {creatingClient ? t('dashboard.creating') : t('dashboard.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showJobModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-modal-title"
        >
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 id="job-modal-title" className="text-lg font-bold mb-4">
              {t('dashboard.addJob')}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('dashboard.jobTitle')}
              </label>
              <input
                type="text"
                placeholder={t('dashboard.jobTitle')}
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('dashboard.selectClient')}
              </label>
              <select
                value={jobClienteId || ''}
                onChange={(e) => setJobClienteId(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="">{t('dashboard.selectClient')}</option>
                {clienti.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowJobModal(false)}
                className="px-4 py-2 rounded-lg border hover:bg-slate-50"
              >
                {t('dashboard.cancel')}
              </button>
              <button
                onClick={handleCreateJob}
                disabled={creatingJob}
                className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90"
              >
                {creatingJob ? t('dashboard.creating') : t('dashboard.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCostoModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="costo-modal-title"
        >
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 id="costo-modal-title" className="text-lg font-bold mb-4">
              {t('dashboard.addCost')}
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('dashboard.description')}
              </label>
              <input
                type="text"
                placeholder={t('dashboard.description')}
                value={newCostoDesc}
                onChange={(e) => setNewCostoDesc(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
              {matchedListinoItem && (
                <p className="text-xs text-green-600 mt-1">
                  ✓ Trovato nel listino
                  {matchedListinoItem.listino_name
                    ? ` ${matchedListinoItem.listino_name}`
                    : ''}
                  {matchedListinoItem.category ? ` • ${matchedListinoItem.category}` : ''}
                  : €
                  {(
                    Number(matchedListinoItem.unit_price) *
                    (1 + (Number(matchedListinoItem.markup_percent) || 0) / 100)
                  ).toFixed(2)}
                </p>
              )}

              {/* Material alternatives picker */}
              {listinoAlternatives.length > 0 && !matchedListinoItem && (
                <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                  <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 font-medium">
                    {listinoAlternatives.length} risultati trovati — seleziona il
                    materiale:
                  </p>
                  <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {listinoAlternatives.map((alt) => (
                      <li
                        key={alt.id}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => {
                          setMatchedListinoItem(alt);
                          setNewCostoPrice(
                            (
                              Number(alt.unit_price) *
                              (1 + (Number(alt.markup_percent) || 0) / 100)
                            ).toFixed(2)
                          );
                          setListinoAlternatives([]);
                        }}
                      >
                        <p className="text-sm font-medium">{alt.description}</p>
                        <p className="text-xs text-slate-500">
                          €
                          {(
                            Number(alt.unit_price) *
                            (1 + (Number(alt.markup_percent) || 0) / 100)
                          ).toFixed(2)}
                          {alt.markup_percent
                            ? ` (base €${Number(alt.unit_price).toFixed(2)} +${alt.markup_percent}%)`
                            : ''}
                        </p>
                        {(alt.listino_name || alt.category) && (
                          <p className="text-xs text-slate-400">
                            {[alt.listino_name, alt.category].filter(Boolean).join(' • ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('dashboard.quantity')}
              </label>
              <input
                type="number"
                placeholder="1"
                value={newCostoQty}
                onChange={(e) => setNewCostoQty(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Unità di misura (facoltativa)
              </label>
              <input
                type="text"
                placeholder="pz, m, kg, m², h, a corpo..."
                value={newCostoUnit}
                onChange={(e) => setNewCostoUnit(e.target.value)}
                maxLength={20}
                list="quote-units"
                className="w-full border rounded-lg px-3 py-2"
              />
              <datalist id="quote-units">
                {['pz', 'm', 'm²', 'm³', 'kg', 'l', 'h', 'a corpo'].map((unit) => (
                  <option key={unit} value={unit} />
                ))}
              </datalist>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {t('dashboard.unitPrice')}
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={newCostoPrice}
                onChange={(e) => setNewCostoPrice(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
                disabled={!!matchedListinoItem}
              />
              {matchedListinoItem && (
                <p className="text-xs text-slate-500 mt-1">
                  Prezzo automatico dal listino
                </p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCostoModal(false);
                  setMatchedListinoItem(null);
                  setListinoAlternatives([]);
                }}
                className="px-4 py-2 rounded-lg border hover:bg-slate-50"
              >
                {t('dashboard.cancel')}
              </button>
              <button
                onClick={handleCreateCosto}
                disabled={creatingCosto}
                className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90"
              >
                {creatingCosto ? t('dashboard.creating') : t('dashboard.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
