'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

type Listino = { id: string; name: string };
type ListinoItem = { id: string; description: string; unit_price: number; markup_percent: number; category?: string | null };

export default function ListiniPage() {
  const { t } = useTranslation();
  const [listini, setListini] = useState<Listino[]>([]);
  const [items, setItems] = useState<ListinoItem[]>([]);
  const [selectedListino, setSelectedListino] = useState<Listino | null>(null);
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

  const fetchListini = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('id, material_markup_vat_percent').eq('id', user.id).single();
    if (!profile) return;
    setProfileMarkupPercent(profile.material_markup_vat_percent ?? 0);
    const { data } = await supabase.from('listini').select('id, name').eq('profile_id', profile.id);
    setListini(data || []);
  };

  const fetchItems = async (listinoId: string) => {
    const { data } = await supabase.from('listini_vettoriali').select('id, description, unit_price, markup_percent, category').eq('listino_id', listinoId);
    setItems(data || []);
  };

  useEffect(() => { fetchListini(); }, []);
  useEffect(() => { if (selectedListino) fetchItems(selectedListino.id); }, [selectedListino?.id]);

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
      setUploading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const profileId = (await supabase.from('profiles').select('id').eq('id', user.id).single()).data?.id;
      if (!profileId) return;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('profileId', profileId);
      formData.append('listinoId', selectedListino.id);

      const res = await fetch('/api/listini/upload', {
        method: 'POST',
        body: formData,
      });

      const payload = await res.json();
      if (!res.ok) {
        const summary = payload?.summary;
        const detail = summary
          ? ` (${summary.parsedRows}/${summary.totalRows} righe valide)`
          : '';
        throw new Error(`${payload?.error || 'Import non riuscito'}${detail}`);
      }

      const summary = payload.summary;
      toast.success(
        `${summary.parsedRows}/${summary.totalRows} ${t('listini.itemsAdded')} · normalize: ${summary.normalizedPriceRows} · unita rilevate: ${summary.unitDetectedRows}`
      );
      await fetchItems(selectedListino.id);
      toast.success('Organizzazione AI avviata automaticamente');
      await runAiOrganize(selectedListino.id, profileId);
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

  const runAiOrganize = async (listinoId: string, profileId: string) => {
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

      toast.success(`AI completata: ${payload.updatedCount} voci aggiornate`);
      await fetchItems(listinoId);
    } catch (err) {
      toast.error((err as Error).message);
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
            <label className="btn-primary cursor-pointer">
              {uploading ? 'Import in corso...' : t('listini.uploadCsv')}
              <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleUploadCsv} className="hidden" disabled={uploading} />
            </label>
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
