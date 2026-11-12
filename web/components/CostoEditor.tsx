'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

/**
 * A quote line. unit_price is what the company pays (purchase price) and tax_rate is
 * the markup (ricarico) percent on it: the client only ever sees the final price.
 */
type Costo = {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  unit?: string | null;
};

type Props = {
  costi: Costo[];
  lavoroId: string;
  onUpdate: () => void;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const euro = (value: number) =>
  `${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Final unit price the client sees. */
export const clientUnitPrice = (c: { unit_price: number; tax_rate?: number | null }) =>
  Number(c.unit_price) * (1 + (Number(c.tax_rate) || 0) / 100);

const parse = (value: string) => {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export default function CostoEditor({ costi, onUpdate }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [cost, setCost] = useState('0');
  const [markup, setMarkup] = useState('0');
  const [finalPrice, setFinalPrice] = useState('0');
  const [saving, setSaving] = useState(false);

  const startEdit = (c: Costo) => {
    setEditing(c.id);
    setDescription(c.description);
    setQuantity(String(c.quantity));
    setUnit(c.unit || '');
    setCost(String(round2(Number(c.unit_price))));
    setMarkup(String(Number(c.tax_rate) || 0));
    setFinalPrice(String(round2(clientUnitPrice(c))));
  };

  // The three prices stay consistent whichever one is typed.
  const changeCost = (value: string) => {
    setCost(value);
    setFinalPrice(String(round2(parse(value) * (1 + parse(markup) / 100))));
  };
  const changeMarkup = (value: string) => {
    setMarkup(value);
    setFinalPrice(String(round2(parse(cost) * (1 + parse(value) / 100))));
  };
  const changeFinal = (value: string) => {
    setFinalPrice(value);
    const c = parse(cost);
    if (c > 0) setMarkup(String(round2((parse(value) / c - 1) * 100)));
    else setCost(value);
  };

  const handleUpdate = async (id: string) => {
    if (!description.trim()) {
      toast.error('Scrivi la descrizione della voce');
      return;
    }
    setSaving(true);
    const purchase = parse(cost);
    const ricarico = purchase > 0 ? parse(markup) : 0;
    const { error } = await supabase
      .from('preventivi_dettaglio')
      .update({
        description: description.trim(),
        quantity: parse(quantity),
        unit: unit.trim() || null,
        unit_price: purchase > 0 ? purchase : parse(finalPrice),
        tax_rate: ricarico,
      })
      .eq('id', id);
    setSaving(false);
    if (error) {
      toast.error('Modifica non salvata');
      return;
    }
    setEditing(null);
    toast.success('Voce aggiornata');
    onUpdate();
  };

  const handleDelete = async (c: Costo) => {
    if (!window.confirm(`Eliminare la voce "${c.description}"?`)) return;
    await supabase.from('preventivi_dettaglio').delete().eq('id', c.id);
    toast.success('Voce eliminata');
    onUpdate();
  };

  const input = 'border border-slate-300 rounded px-2 py-2 text-base';

  return (
    <div>
      <p className="mb-3 text-sm text-slate-500">
        Prezzo d&apos;acquisto e ricarico li vedi solo tu: il cliente vede solo il prezzo
        finale.
      </p>
      <table className="w-full text-base">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2">Descrizione</th>
            <th className="py-2 text-right">Q.tà</th>
            <th className="py-2 pl-2">U.M.</th>
            <th className="py-2 text-right">Acquisto</th>
            <th className="py-2 text-right">Ricarico</th>
            <th className="py-2 text-right">Al cliente</th>
            <th className="py-2 text-right">Importo</th>
            <th className="w-28" />
          </tr>
        </thead>
        <tbody>
          {costi.map((c) =>
            editing === c.id ? (
              <tr key={c.id} className="border-b bg-slate-50 align-top">
                <td className="py-2 pr-2">
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    aria-label="Descrizione"
                    className={`${input} w-full`}
                  />
                </td>
                <td className="py-2 text-right">
                  <input
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    aria-label="Quantità"
                    className={`${input} w-20 text-right`}
                  />
                </td>
                <td className="py-2 pl-2">
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    maxLength={20}
                    placeholder="pz"
                    aria-label="Unità di misura"
                    className={`${input} w-20`}
                  />
                </td>
                <td className="py-2 text-right">
                  <input
                    inputMode="decimal"
                    value={cost}
                    onChange={(e) => changeCost(e.target.value)}
                    aria-label="Prezzo d'acquisto"
                    className={`${input} w-24 text-right`}
                  />
                </td>
                <td className="py-2 text-right">
                  <input
                    inputMode="decimal"
                    value={markup}
                    onChange={(e) => changeMarkup(e.target.value)}
                    aria-label="Ricarico percentuale"
                    className={`${input} w-20 text-right`}
                  />
                </td>
                <td className="py-2 text-right">
                  <input
                    inputMode="decimal"
                    value={finalPrice}
                    onChange={(e) => changeFinal(e.target.value)}
                    aria-label="Prezzo al cliente"
                    className={`${input} w-24 text-right font-semibold`}
                  />
                </td>
                <td className="py-2 text-right font-semibold">
                  {euro(parse(quantity) * parse(finalPrice))}
                </td>
                <td className="py-2 pl-2">
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleUpdate(c.id)}
                      disabled={saving}
                      className="btn-primary min-h-[44px] px-3"
                    >
                      Salva
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="min-h-[44px] rounded border border-slate-300 px-3"
                    >
                      Annulla
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={c.id} className="border-b">
                <td className="py-2">{c.description}</td>
                <td className="py-2 text-right">{c.quantity}</td>
                <td className="py-2 pl-2">{c.unit || ''}</td>
                <td className="py-2 text-right text-slate-500">
                  {euro(Number(c.unit_price))}
                </td>
                <td className="py-2 text-right text-slate-500">
                  {Number(c.tax_rate) || 0}%
                </td>
                <td className="py-2 text-right">{euro(clientUnitPrice(c))}</td>
                <td className="py-2 text-right font-semibold">
                  {euro(Number(c.quantity) * clientUnitPrice(c))}
                </td>
                <td className="py-2 pl-2">
                  <div className="flex gap-3">
                    <button
                      onClick={() => startEdit(c)}
                      className="min-h-[44px] text-primary hover:underline"
                    >
                      Modifica
                    </button>
                    <button
                      onClick={() => handleDelete(c)}
                      className="min-h-[44px] text-danger hover:underline"
                    >
                      Elimina
                    </button>
                  </div>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
