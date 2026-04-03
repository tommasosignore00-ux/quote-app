'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

type Listino = { id: string; name: string };
type ListinoItem = { id: string; description: string; unit_price: number; markup_percent: number };

export default function ListiniPage() {
  const { t } = useTranslation();
  const [listini, setListini] = useState<Listino[]>([]);
  const [items, setItems] = useState<ListinoItem[]>([]);
  const [selectedListino, setSelectedListino] = useState<Listino | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileMarkupPercent, setProfileMarkupPercent] = useState<number>(0);
  
  const [showManualModal, setShowManualModal] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newUnitPrice, setNewUnitPrice] = useState('0');
  const [newMarkupPercent, setNewMarkupPercent] = useState('0');
  const [editingItem, setEditingItem] = useState<ListinoItem | null>(null);
  const [editingListino, setEditingListino] = useState<Listino | null>(null);
  const [editingListinoName, setEditingListinoName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchListini = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data: profile } = await supabase.from('profiles').select('id, material_markup_vat_percent').eq('id', user.id).single();
    if (!profile) return;
    setProfileMarkupPercent(profile.material_markup_vat_percent ?? 0);
    const { data } = await supabase.from('listini').select('id, name').eq('profile_id', profile.id);
    setListini(data || []);
    setLoading(false);
  };

  const fetchItems = async (listinoId: string) => {
    const { data } = await supabase.from('listini_vettoriali').select('id, description, unit_price, markup_percent').eq('listino_id', listinoId);
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

  const parseFileToItems = async (file: File, profileId: string): Promise<{ listino_id: string; profile_id: string; description: string; unit_price: number; markup_percent: number }[]> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as (string | number)[][];
      const header = rows[0];
      const descIdx = header.findIndex((h: unknown) => String(h).toLowerCase().includes('desc') || String(h).toLowerCase().includes('voce'));
      const priceIdx = header.findIndex((h: unknown) => String(h).toLowerCase().includes('prezzo') || String(h).toLowerCase().includes('price'));
      return rows.slice(1)
        .map((row) => {
          const desc = (row[descIdx ?? 0] ?? row[0] ?? '').toString().trim();
          const price = parseFloat(String(row[priceIdx ?? 1] ?? row[1] ?? 0)) || 0;
          return { listino_id: selectedListino!.id, profile_id: profileId, description: desc, unit_price: price, markup_percent: 0 };
        })
        .filter((i) => i.description);
    }
    const text = await file.text();
    const lines = text.split('\n').slice(1).filter(Boolean);
    return lines.map((line) => {
      const [desc, price] = line.split(/[;,]\s*/);
      return { listino_id: selectedListino!.id, profile_id: profileId, description: (desc || '').trim(), unit_price: parseFloat(price || '0') || 0, markup_percent: 0 };
    }).filter((i) => i.description);
  };

  const handleUploadCsv = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedListino) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const profileId = (await supabase.from('profiles').select('id').eq('id', user.id).single()).data?.id;
    if (!profileId) return;

    const items = await parseFileToItems(file, profileId);

    for (const item of items) {
      const res = await fetch('/api/listini/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...item }),
      });
      const { embedding } = await res.json();
      await supabase.from('listini_vettoriali').insert({ ...item, embedding });
    }
      toast.success(`${items.length} ${t('listini.itemsAdded')}`);
    fetchItems(selectedListino.id);
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">{t('main.listini')}</h1>
      <div className="flex gap-4 mb-6">
        <button onClick={handleCreateListino} className="btn-primary">{t('listini.newListino')}</button>
        {selectedListino && (
          <>
            <label className="btn-primary cursor-pointer">
              {t('listini.uploadCsv')}
              <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleUploadCsv} className="hidden" />
            </label>
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
                    <th className="text-right py-2">{t('listini.price')}</th>
                    <th className="text-right py-2">{t('listini.markup')}</th>
                    <th className="text-right py-2">{t('listini.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-b group">
                      <td className="py-2">{i.description}</td>
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
