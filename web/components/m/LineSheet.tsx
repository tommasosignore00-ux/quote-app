'use client';

/** Edit one quote line on the phone site. Purchase price and markup stay private. */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { euro, type Costo } from '@/lib/mobileWeb';
import { Button, Field, Sheet, inputClass } from './ui';

const VAT_PRESETS = ['22', '10', '5', '4', '0'];

const num = (value: string) => {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const show = (value: number) => String(Math.round(value * 100) / 100).replace('.', ',');

type Props = {
  line: Costo | null;
  onClose: () => void;
  onSaved: (line: Costo) => void;
  onDeleted: (id: string) => void;
};

export default function LineSheet({ line, onClose, onSaved, onDeleted }: Props) {
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [cost, setCost] = useState('');
  const [markup, setMarkup] = useState('');
  const [finalPrice, setFinalPrice] = useState('');
  const [vat, setVat] = useState('');
  const [vatCustom, setVatCustom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!line) return;
    setDescription(line.description);
    setQuantity(show(Number(line.quantity)));
    setUnit(line.unit || '');
    setCost(show(Number(line.unit_price)));
    setMarkup(show(Number(line.tax_rate) || 0));
    setFinalPrice(
      show(Number(line.unit_price) * (1 + (Number(line.tax_rate) || 0) / 100))
    );
    const own =
      line.vat_percent === null || line.vat_percent === undefined
        ? ''
        : String(Number(line.vat_percent));
    if (!own || VAT_PRESETS.includes(own)) {
      setVat(own);
      setVatCustom('');
    } else {
      setVat('custom');
      setVatCustom(own.replace('.', ','));
    }
    setError(null);
    setConfirmDelete(false);
  }, [line]);

  if (!line) return null;

  const changeCost = (value: string) => {
    setCost(value);
    setFinalPrice(show(num(value) * (1 + num(markup) / 100)));
  };
  const changeMarkup = (value: string) => {
    setMarkup(value);
    setFinalPrice(show(num(cost) * (1 + num(value) / 100)));
  };
  const changeFinal = (value: string) => {
    setFinalPrice(value);
    if (num(cost) > 0) setMarkup(show((num(value) / num(cost) - 1) * 100));
    else setCost(value);
  };

  const save = async () => {
    if (!description.trim()) {
      setError('Scrivi la descrizione della voce.');
      return;
    }
    const lineVat = vat === '' ? null : vat === 'custom' ? num(vatCustom) : num(vat);
    if (lineVat !== null && (lineVat < 0 || lineVat > 100)) {
      setError("L'IVA deve essere tra 0 e 100.");
      return;
    }
    const purchase = num(cost);
    const changes = {
      description: description.trim(),
      quantity: num(quantity),
      unit: unit.trim() || null,
      unit_price: purchase > 0 ? purchase : num(finalPrice),
      tax_rate: purchase > 0 ? num(markup) : 0,
      vat_percent: lineVat,
    };
    setSaving(true);
    const { error: saveError } = await supabase
      .from('preventivi_dettaglio')
      .update(changes)
      .eq('id', line.id);
    setSaving(false);
    if (saveError) {
      setError('Modifica non salvata. Riprova.');
      return;
    }
    onSaved({ ...line, ...changes });
  };

  const remove = async () => {
    setSaving(true);
    const { error: deleteError } = await supabase
      .from('preventivi_dettaglio')
      .delete()
      .eq('id', line.id);
    setSaving(false);
    if (deleteError) {
      setError('Voce non eliminata. Riprova.');
      return;
    }
    onDeleted(line.id);
  };

  return (
    <Sheet open={Boolean(line)} onClose={onClose} title="Modifica voce">
      <Field label="Descrizione">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className={`${inputClass} py-3`}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantità">
          <input
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Unità">
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="pz, m, h…"
            maxLength={20}
            className={inputClass}
          />
        </Field>
        <Field label="Lo paghi (€)">
          <input
            inputMode="decimal"
            value={cost}
            onChange={(e) => changeCost(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Ricarico (%)">
          <input
            inputMode="decimal"
            value={markup}
            onChange={(e) => changeMarkup(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Prezzo al cliente (€)">
        <input
          inputMode="decimal"
          value={finalPrice}
          onChange={(e) => changeFinal(e.target.value)}
          className={`${inputClass} border-primary text-2xl font-bold`}
        />
      </Field>

      <p className="mb-2 text-base font-semibold">IVA di questa voce</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {[
          ['', 'Del preventivo'],
          ...VAT_PRESETS.map((rate) => [rate, `${rate}%`]),
          ['custom', 'Altra'],
        ].map(([value, label]) => (
          <button
            key={value || 'quote'}
            type="button"
            aria-pressed={vat === value}
            onClick={() => setVat(value)}
            className={`min-h-[52px] min-w-[64px] rounded-xl border-2 px-4 text-lg font-bold ${
              vat === value
                ? 'border-primary bg-primary text-white'
                : 'border-mv-line bg-mv-sheet text-mv-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {vat === 'custom' ? (
        <Field label="Aliquota in %">
          <input
            inputMode="decimal"
            value={vatCustom}
            onChange={(e) => setVatCustom(e.target.value)}
            className={inputClass}
          />
        </Field>
      ) : null}

      <p className="mb-4 text-base text-mv-muted">
        Il cliente vede solo il prezzo al cliente. Totale riga:{' '}
        {euro(num(quantity) * num(finalPrice))}
      </p>
      {error ? (
        <p className="mb-3 text-lg font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Button big variant="secondary" onClick={onClose}>
          Annulla
        </Button>
        <Button big onClick={save} disabled={saving}>
          {saving ? 'Salvo…' : 'Salva'}
        </Button>
      </div>

      <div className="mt-8 border-t border-mv-line pt-5">
        {confirmDelete ? (
          <div className="grid gap-3">
            <p className="text-lg font-bold">Eliminare «{line.description}»?</p>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              No, tienila
            </Button>
            <Button variant="danger" onClick={remove} disabled={saving}>
              Sì, elimina la voce
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            className="w-full"
            onClick={() => setConfirmDelete(true)}
          >
            Elimina la voce
          </Button>
        )}
      </div>
    </Sheet>
  );
}
