'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

type Costo = { id: string; description: string; quantity: number; unit_price: number; tax_rate?: number };

type Props = {
  costi: Costo[];
  lavoroId: string;
  onUpdate: () => void;
  defaultVatPercent?: number;
};

export default function CostoEditor({ costi, lavoroId, onUpdate, defaultVatPercent = 22 }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(1);
  const [editPrice, setEditPrice] = useState(0);
  const [editTaxRate, setEditTaxRate] = useState(defaultVatPercent);

  const handleDelete = async (id: string) => {
    await supabase.from('preventivi_dettaglio').delete().eq('id', id);
    toast.success('Voce eliminata');
    onUpdate();
  };

  const handleUpdate = async (id: string) => {
    const c = costi.find(x => x.id === id);
    if (!c) return;
    await supabase.from('preventivi_dettaglio').update({
      quantity: editQty,
      unit_price: editPrice,
      tax_rate: editTaxRate,
    }).eq('id', id);
    setEditing(null);
    toast.success('Voce aggiornata');
    onUpdate();
  };

  const startEdit = (c: Costo) => {
    setEditing(c.id);
    setEditQty(c.quantity);
    setEditPrice(c.unit_price);
    setEditTaxRate(c.tax_rate ?? defaultVatPercent);
  };

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left py-2">Descrizione</th>
          <th className="text-right py-2">Qty</th>
          <th className="text-right py-2">Prezzo</th>
          <th className="text-right py-2">IVA %</th>
          <th className="text-right py-2">Totale</th>
          <th className="w-24"></th>
        </tr>
      </thead>
      <tbody>
        {costi.map((c) => (
          <tr key={c.id} className="border-b">
            <td className="py-2">{c.description}</td>
            <td className="text-right py-2">
              {editing === c.id ? (
                <input
                  type="number"
                  value={editQty}
                  onChange={(e) => setEditQty(Number(e.target.value))}
                  className="w-16 border rounded px-2 py-1 text-right"
                />
              ) : (
                c.quantity
              )}
            </td>
            <td className="text-right py-2">
              {editing === c.id ? (
                <input
                  type="number"
                  step="0.01"
                  value={editPrice}
                  onChange={(e) => setEditPrice(Number(e.target.value))}
                  className="w-20 border rounded px-2 py-1 text-right"
                />
              ) : (
                `€${c.unit_price.toFixed(2)}`
              )}
            </td>
            <td className="text-right py-2">
              {editing === c.id ? (
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={editTaxRate}
                  onChange={(e) => setEditTaxRate(Number(e.target.value))}
                  className="w-16 border rounded px-2 py-1 text-right"
                />
              ) : (
                `${c.tax_rate ?? defaultVatPercent}%`
              )}
            </td>
            <td className="text-right py-2 font-medium">
              {`€${(c.quantity * c.unit_price * (1 + (c.tax_rate ?? defaultVatPercent) / 100)).toFixed(2)}`}
            </td>
            <td className="py-2">
              {editing === c.id ? (
                <div className="flex gap-1">
                  <button onClick={() => handleUpdate(c.id)} className="text-xs text-green-600 hover:underline">Salva</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-slate-500 hover:underline">Annulla</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => startEdit(c)} className="text-xs text-primary hover:underline">Modifica</button>
                  <button onClick={() => handleDelete(c.id)} className="text-xs text-red-600 hover:underline">Elimina</button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
