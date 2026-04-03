'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useSessionTimeout } from '@/hooks/useSessionTimeout';
import VoiceButton from '@/components/VoiceButton';
import QuotePreview from '@/components/QuotePreview';
import CostoEditor from '@/components/CostoEditor';
import SemanticFallbackModal from '@/components/SemanticFallbackModal';
import { useRealtime } from '@/lib/useRealtime';

type Cliente = { id: string; name: string };
type Lavoro = { id: string; title: string; cliente_id: string; status: string; clienti?: any };
type Costo = { id: string; description: string; quantity: number; unit_price: number; tax_rate?: number };

export default function DashboardPage() {
  const { t } = useTranslation();
  useSessionTimeout(); // Monitor inactivity and auto-logout
  const [clienti, setClienti] = useState<Cliente[]>([]);
  const [lavori, setLavori] = useState<Lavoro[]>([]);
  const [selectedLavoro, setSelectedLavoro] = useState<Lavoro | null>(null);
  const [selectedClienteId, setSelectedClienteId] = useState<string | null>(null);
  const [costi, setCosti] = useState<Costo[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profileVatPercent, setProfileVatPercent] = useState<number>(22);
  const [profileMaterialMarkup, setProfileMaterialMarkup] = useState<number>(0);
  const [semanticAlternatives, setSemanticAlternatives] = useState<{ id: string; description: string; unit_price: number; markup_percent?: number }[] | null>(null);
  
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
  const [newCostoPrice, setNewCostoPrice] = useState('0');
  const [creatingCosto, setCreatingCosto] = useState(false);
  const [matchedListinoItem, setMatchedListinoItem] = useState<{ id: string; description: string; unit_price: number; markup_percent?: number } | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [listinoAlternatives, setListinoAlternatives] = useState<{ id: string; description: string; unit_price: number; markup_percent?: number; listino_id?: string }[]>([]);

  const fetchData = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Try with vat_percent and material_markup first; fall back to id-only if columns don't exist yet
    let pid = user.id;
    const { data: profile, error: profileErr } = await supabase.from('profiles').select('id, vat_percent, material_markup').eq('id', user.id).single();
    if (profile) {
      pid = profile.id;
      setProfileVatPercent(Number(profile.vat_percent) || 22);
      setProfileMaterialMarkup(Number(profile.material_markup) || 0);
    } else if (profileErr) {
      // Columns might not exist yet – try without them
      console.warn('Profile fetch with vat_percent/material_markup failed, retrying:', profileErr.message);
      const { data: profileFallback } = await supabase.from('profiles').select('id').eq('id', user.id).single();
      if (profileFallback) pid = profileFallback.id;
    }
    setProfileId(pid);

    const { data: c } = await supabase.from('clienti').select('id, name').eq('profile_id', pid);
    setClienti(c || []);

    const { data: l } = await supabase.from('lavori').select('id, title, cliente_id, status, clienti(name)').eq('profile_id', pid);
    setLavori(l || []);

    if (selectedLavoro) {
      const { data: costiData } = await supabase.from('preventivi_dettaglio').select('id, description, quantity, unit_price, tax_rate').eq('lavoro_id', selectedLavoro.id);
      setCosti(costiData || []);
    }
    setLoading(false);
  }, [selectedLavoro?.id]);

  useRealtime(profileId, fetchData);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-search listino when typing cost description
  useEffect(() => {
    if (!newCostoDesc.trim() || !profileId || !showCostoModal) {
      setMatchedListinoItem(null);
      return;
    }
    
    const timer = setTimeout(async () => {
      try {
        console.log('[Dashboard] Searching listino for:', newCostoDesc);
        const res = await fetch('/api/listini/text-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: newCostoDesc, profileId }),
        });
        const match = await res.json();
        console.log('[Dashboard] Match result:', match);
        
        if (match.item && match.alternatives && match.alternatives.length > 0) {
          // Multiple results found — show picker
          console.log('[Dashboard] Multiple matches found, showing picker');
          setMatchedListinoItem(null);
          setListinoAlternatives([match.item, ...match.alternatives]);
        } else if (match.item) {
          console.log('[Dashboard] Found single match:', match.item.description, 'Price:', match.item.unit_price);
          setMatchedListinoItem(match.item);
          setNewCostoPrice(Number(match.item.unit_price).toFixed(2));
          setListinoAlternatives([]);
        } else {
          console.log('[Dashboard] No match found');
          setMatchedListinoItem(null);
          setListinoAlternatives([]);
        }
      } catch (err) {
        console.error('[Dashboard] Error searching listino:', err);
      }
    }, 500); // Debounce 500ms
    
    return () => clearTimeout(timer);
  }, [newCostoDesc, profileId, showCostoModal]);

  const addCostoFromItem = async (item: { id: string; description: string; unit_price: number; markup_percent?: number }, qty = 1) => {
    if (!selectedLavoro) return;
    await supabase.from('preventivi_dettaglio').insert({
      lavoro_id: selectedLavoro.id,
      description: item.description,
      quantity: qty,
      unit_price: Number(item.unit_price),
      tax_rate: Number(item.markup_percent) || profileMaterialMarkup,
      listino_item_id: item.id,
    });
    setSemanticAlternatives(null);
    fetchData();
  };

  const addCostoManual = async (desc: string, qty = 1) => {
    if (!selectedLavoro) return;
    await supabase.from('preventivi_dettaglio').insert({
      lavoro_id: selectedLavoro.id,
      description: desc,
      quantity: qty,
      unit_price: 0,
      tax_rate: profileMaterialMarkup,
    });
    setSemanticAlternatives(null);
    fetchData();
  };

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
      const { data: created, error } = await supabase.from('clienti').insert({ profile_id: profileId, name: newClientName }).select('*');
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
      const { data: created, error } = await supabase.from('lavori').insert({ profile_id: profileId, title: newJobTitle, cliente_id: jobClienteId }).select('*');
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
        const price = Number(matchedListinoItem.unit_price) * (1 + (Number(matchedListinoItem.markup_percent) || 0) / 100);
        const { data: created, error } = await supabase.from('preventivi_dettaglio').insert({
          lavoro_id: selectedLavoro.id,
          description: matchedListinoItem.description,
          quantity,
          unit_price: price,
          tax_rate: profileVatPercent,
          listino_item_id: matchedListinoItem.id,
        }).select('*');
        if (error) throw error;
        if (created?.[0]) setCosti((prev) => [created[0], ...prev]);
        setNewCostoDesc('');
        setNewCostoQty('1');
        setNewCostoPrice('0');
        setMatchedListinoItem(null);
        setListinoAlternatives([]);
        setShowCostoModal(false);
        toast.success('Prezzo preso dal listino');
        return;
      }
      
      // No match - use manual price
      const unitPrice = parseFloat(newCostoPrice) || 0;
      const { data: created, error } = await supabase.from('preventivi_dettaglio').insert({
        lavoro_id: selectedLavoro.id,
        description: newCostoDesc,
        quantity,
        unit_price: unitPrice,
        tax_rate: profileVatPercent,
      }).select('*');
      if (error) throw error;
      if (created?.[0]) setCosti((prev) => [created[0], ...prev]);
      setNewCostoDesc('');
      setNewCostoQty('1');
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

  const handleVoiceResult = async (result: { action: string; data?: Record<string, unknown> }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('id, country_code').eq('id', user.id).single();
    if (!profile) return;

    if (result.action === 'create_cliente' && result.data?.name) {
      const { data: created } = await supabase.from('clienti').insert({ profile_id: profile.id, name: String(result.data.name) }).select('*');
      if (created?.[0]) setClienti((p) => [...p, created[0]]);
    } else if (result.action === 'create_lavoro' && result.data?.title && (result.data?.cliente_id || result.data?.cliente_name)) {
      let clienteId = result.data.cliente_id as string | undefined;
      if (!clienteId && result.data.cliente_name) {
        const match = clienti.find(c => c.name.toLowerCase().includes(String(result.data?.cliente_name).toLowerCase()));
        clienteId = match?.id;
      }
      if (clienteId) {
        await supabase.from('lavori').insert({
          profile_id: profile.id,
          cliente_id: String(clienteId),
          title: String(result.data.title),
        });
      }
    } else if (result.action === 'add_costo' && result.data?.description && selectedLavoro) {
      const res = await fetch('/api/voice/semantic-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: result.data.description, profileId: profile.id }),
      });
      const match = await res.json();
      const qty = Number(result.data?.quantity) || 1;
      if (match.item) {
        await addCostoFromItem(match.item, qty);
      } else if (match.alternatives?.length > 0) {
        setSemanticAlternatives(match.alternatives);
      } else {
        await addCostoManual(String(result.data.description), qty);
      }
    }
    fetchData();
  };

  return (
    <div className="p-6">
      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">{t('main.jobs')}</h1>
            <VoiceButton onResult={handleVoiceResult} clienti={clienti} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">{t('dashboard.clients')}</h3>
                <button onClick={() => setShowClientModal(true)} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">+ Add</button>
              </div>
              <input
                type="text"
                placeholder={t('dashboard.searchClient') || 'Cerca cliente...'}
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <ul className="space-y-2 max-h-60 overflow-y-auto">
                {clienti.filter(c => !clientSearch.trim() || c.name.toLowerCase().includes(clientSearch.toLowerCase())).map((c) => (
                  <li key={c.id} className={`text-sm p-2 rounded flex items-center justify-between group cursor-pointer transition-colors ${
                    selectedClienteId === c.id ? 'bg-primary text-white' : 'hover:bg-slate-100'
                  }`}>
                    <span onClick={() => handleSelectCliente(c.id)} className="flex-1">{c.name}</span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteClient(c.id); }} 
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
                <button onClick={() => { setJobClienteId(clienti[0]?.id ?? null); setShowJobModal(true); }} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">+ Add</button>
              </div>
              <ul className="space-y-2 max-h-60 overflow-y-auto">
                {(!selectedClienteId ? lavori : lavori.filter(l => l.cliente_id === selectedClienteId)).map((l) => (
                  <li
                    key={l.id}
                    className={`text-sm p-2 rounded flex items-center justify-between group ${selectedLavoro?.id === l.id ? 'bg-primary text-white' : 'hover:bg-slate-100'}`}
                  >
                    <span 
                      onClick={() => setSelectedLavoro(l)}
                      className="cursor-pointer flex-1"
                    >
                      {selectedClienteId ? l.title : `${(l.clienti as { name?: string })?.name || ''} - ${l.title}`}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteJob(l.id); }} 
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
                <h3>{t('dashboard.details')} {selectedLavoro.title}</h3>
                <div className="flex gap-2">
                  <button onClick={() => setShowCostoModal(true)} className="text-xs bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded">+ {t('dashboard.addCost')}</button>
                  <QuotePreview lavoroId={selectedLavoro.id} lavoro={selectedLavoro} />
                </div>
              </div>
              <CostoEditor costi={costi} lavoroId={selectedLavoro.id} onUpdate={fetchData} defaultVatPercent={profileVatPercent} />
            </div>
          )}
        </div>
      </div>

      {semanticAlternatives && (
        <SemanticFallbackModal
          alternatives={semanticAlternatives}
          onSelect={(item) => addCostoFromItem(item)}
          onCancel={() => setSemanticAlternatives(null)}
          onAddManual={(desc) => addCostoManual(desc)}
        />
      )}

      {showClientModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="client-modal-title">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 id="client-modal-title" className="text-lg font-bold mb-4">{t('dashboard.addClient')}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('dashboard.clientName')}</label>
              <input
                type="text"
                placeholder={t('dashboard.clientName')}
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowClientModal(false)} className="px-4 py-2 rounded-lg border hover:bg-slate-50">{t('dashboard.cancel')}</button>
              <button onClick={handleCreateClient} disabled={creatingClient} className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90">{creatingClient ? t('dashboard.creating') : t('dashboard.save')}</button>
            </div>
          </div>
        </div>
      )}

      {showJobModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="job-modal-title">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full">
            <h3 id="job-modal-title" className="text-lg font-bold mb-4">{t('dashboard.addJob')}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('dashboard.jobTitle')}</label>
              <input
                type="text"
                placeholder={t('dashboard.jobTitle')}
                value={newJobTitle}
                onChange={(e) => setNewJobTitle(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('dashboard.selectClient')}</label>
              <select value={jobClienteId || ''} onChange={(e) => setJobClienteId(e.target.value)} className="w-full border rounded-lg px-3 py-2">
              <option value="">{t('dashboard.selectClient')}</option>
              {clienti.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowJobModal(false)} className="px-4 py-2 rounded-lg border hover:bg-slate-50">{t('dashboard.cancel')}</button>
              <button onClick={handleCreateJob} disabled={creatingJob} className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90">{creatingJob ? t('dashboard.creating') : t('dashboard.save')}</button>
            </div>
          </div>
        </div>
      )}

      {showCostoModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" role="dialog" aria-modal="true" aria-labelledby="costo-modal-title">
          <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <h3 id="costo-modal-title" className="text-lg font-bold mb-4">{t('dashboard.addCost')}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('dashboard.description')}</label>
              <input
                type="text"
                placeholder={t('dashboard.description')}
                value={newCostoDesc}
                onChange={(e) => setNewCostoDesc(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
              {matchedListinoItem && (
                <p className="text-xs text-green-600 mt-1">✓ Trovato nel listino: €{(Number(matchedListinoItem.unit_price) * (1 + (Number(matchedListinoItem.markup_percent) || 0) / 100)).toFixed(2)}</p>
              )}

              {/* Material alternatives picker */}
              {listinoAlternatives.length > 0 && !matchedListinoItem && (
                <div className="mt-2 border border-slate-200 rounded-lg overflow-hidden">
                  <p className="text-xs text-slate-500 px-3 py-2 bg-slate-50 font-medium">
                    {listinoAlternatives.length} risultati trovati — seleziona il materiale:
                  </p>
                  <ul className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {listinoAlternatives.map((alt) => (
                      <li
                        key={alt.id}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => {
                          setMatchedListinoItem(alt);
                          setNewCostoPrice((Number(alt.unit_price) * (1 + (Number(alt.markup_percent) || 0) / 100)).toFixed(2));
                          setListinoAlternatives([]);
                        }}
                      >
                        <p className="text-sm font-medium">{alt.description}</p>
                        <p className="text-xs text-slate-500">
                          €{(Number(alt.unit_price) * (1 + (Number(alt.markup_percent) || 0) / 100)).toFixed(2)}
                          {alt.markup_percent ? ` (base €${Number(alt.unit_price).toFixed(2)} +${alt.markup_percent}%)` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('dashboard.quantity')}</label>
              <input
                type="number"
                placeholder="1"
                value={newCostoQty}
                onChange={(e) => setNewCostoQty(e.target.value)}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('dashboard.unitPrice')}</label>
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
                <p className="text-xs text-slate-500 mt-1">Prezzo automatico dal listino</p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowCostoModal(false); setMatchedListinoItem(null); setListinoAlternatives([]); }} className="px-4 py-2 rounded-lg border hover:bg-slate-50">{t('dashboard.cancel')}</button>
              <button onClick={handleCreateCosto} disabled={creatingCosto} className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-primary/90">{creatingCosto ? t('dashboard.creating') : t('dashboard.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
