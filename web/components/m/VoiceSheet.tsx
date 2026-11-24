'use client';

/** Confirmation of dictated lines on the phone site: nothing is saved without "Aggiungi". */

import { useState } from 'react';
import { Check, Minus, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { parseItalianNumber } from '@/lib/voiceResult';
import { candidateSalePrice, euro, type VoiceDraftItem } from '@/lib/mobileWeb';
import { Button, Sheet, inputClass } from './ui';

type Props = {
  open: boolean;
  transcript: string;
  initialItems: VoiceDraftItem[];
  jobLabel: string;
  profileMarkup: number;
  saving: boolean;
  onConfirm: (items: VoiceDraftItem[]) => void;
  onCancel: () => void;
};

const stepQuantity = (value: string, delta: number) => {
  const current = parseItalianNumber(value) ?? 0;
  const next = Math.max(0, Math.round((current + delta) * 100) / 100);
  return String(next).replace('.', ',');
};

export default function VoiceSheet({
  open,
  transcript,
  initialItems,
  jobLabel,
  profileMarkup,
  saving,
  onConfirm,
  onCancel,
}: Props) {
  const [items, setItems] = useState(initialItems);
  const [removed, setRemoved] = useState<{ item: VoiceDraftItem; index: number } | null>(
    null
  );
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const update = (key: string, patch: Partial<VoiceDraftItem>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );

  const remove = (index: number) => {
    setRemoved({ item: items[index], index });
    setItems((current) => current.filter((_, i) => i !== index));
  };

  const restore = () => {
    if (!removed) return;
    setItems((current) => {
      const next = [...current];
      next.splice(Math.min(removed.index, next.length), 0, removed.item);
      return next;
    });
    setRemoved(null);
  };

  const missingQuantity = items.some((item) => !(parseItalianNumber(item.quantity) ?? 0));
  const needsChoice = items.some(
    (item) =>
      item.choice < 0 && item.candidates.length > 1 && !parseItalianNumber(item.price)
  );

  return (
    <Sheet open={open} onClose={() => setConfirmDiscard(true)} title="Controlla le voci">
      <p className="mb-1 text-base text-mv-muted">Stai aggiungendo a</p>
      <p className="mb-3 text-lg font-bold">{jobLabel}</p>
      {transcript ? (
        <p className="mb-4 rounded-xl bg-mv-soft p-3 text-base">
          Hai detto: <span className="italic">«{transcript}»</span>
        </p>
      ) : null}

      <ul className="space-y-4">
        {items.map((item, index) => {
          const match = item.candidates[item.choice];
          const ownPrice = parseItalianNumber(item.price);
          const unitPrice =
            ownPrice ?? (match ? candidateSalePrice(match, profileMarkup) : null);
          const quantity = parseItalianNumber(item.quantity) ?? 0;
          return (
            <li
              key={item.key}
              className="rounded-[20px] border border-mv-line bg-mv-sheet p-4"
            >
              <p className="text-xl font-bold">{match?.description || item.spoken}</p>
              {match ? (
                <p className="mt-1 text-base text-mv-muted">
                  Prezzo dal tuo listino
                  {match.listino_name ? ` · ${match.listino_name}` : ''}
                </p>
              ) : null}

              {!match && item.candidates.length > 0 ? (
                <div className="mt-3">
                  <p className="mb-2 rounded-xl border-2 border-amber-700 bg-amber-50 p-3 text-base font-semibold text-amber-900">
                    Più articoli possibili: scegli quello giusto
                  </p>
                  <div className="space-y-2">
                    {item.candidates.slice(0, 4).map((candidate, ci) => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => update(item.key, { choice: ci })}
                        className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-xl border-2 border-mv-line bg-mv-paper px-4 text-left text-lg"
                      >
                        <span>{candidate.description}</span>
                        <span className="whitespace-nowrap font-bold">
                          {euro(candidateSalePrice(candidate, profileMarkup))}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Diminuisci quantità"
                  onClick={() =>
                    update(item.key, { quantity: stepQuantity(item.quantity, -1) })
                  }
                  className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-mv-ink"
                >
                  <Minus className="h-7 w-7" />
                </button>
                <input
                  inputMode="decimal"
                  aria-label="Quantità"
                  value={item.quantity}
                  placeholder="Quantità"
                  onChange={(e) => update(item.key, { quantity: e.target.value })}
                  className={`${inputClass} min-h-[64px] w-24 text-center text-2xl font-bold`}
                />
                <button
                  type="button"
                  aria-label="Aumenta quantità"
                  onClick={() =>
                    update(item.key, { quantity: stepQuantity(item.quantity, 1) })
                  }
                  className="flex h-16 w-16 items-center justify-center rounded-xl border-2 border-mv-ink"
                >
                  <Plus className="h-7 w-7" />
                </button>
                <input
                  aria-label="Unità di misura"
                  value={item.unit}
                  placeholder="pz, m, h"
                  onChange={(e) => update(item.key, { unit: e.target.value })}
                  className={`${inputClass} min-h-[64px] w-24`}
                />
              </div>

              <label className="mt-3 block">
                <span className="mb-1 block text-base font-semibold">
                  {match
                    ? 'Prezzo al cliente (lascia vuoto per il listino)'
                    : 'Prezzo al cliente'}
                </span>
                <input
                  inputMode="decimal"
                  value={item.price}
                  placeholder={
                    match ? euro(candidateSalePrice(match, profileMarkup)) : '0,00'
                  }
                  onChange={(e) => update(item.key, { price: e.target.value })}
                  className={inputClass}
                />
              </label>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xl font-bold">
                  {unitPrice !== null ? euro(unitPrice * quantity) : 'Prezzo da inserire'}
                </p>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="inline-flex min-h-[48px] items-center gap-2 rounded-xl px-3 text-lg font-semibold text-danger"
                >
                  <Trash2 className="h-5 w-5" /> Togli
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {removed ? (
        <div className="mt-4 flex items-center justify-between rounded-xl border-2 border-mv-line bg-mv-sheet p-3">
          <span className="text-lg">Voce tolta</span>
          <button
            type="button"
            onClick={restore}
            className="inline-flex min-h-[48px] items-center gap-2 rounded-xl px-3 text-lg font-bold text-primary"
          >
            <RotateCcw className="h-5 w-5" /> Ripristina
          </button>
        </div>
      ) : null}

      {missingQuantity || needsChoice ? (
        <p className="mt-4 text-base font-semibold text-amber-900">
          {needsChoice ? 'Scegli l’articolo giusto. ' : ''}
          {missingQuantity ? 'Manca una quantità: usa i tasti − e +.' : ''}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {confirmDiscard ? (
          <>
            <p className="text-lg font-bold">Butti via le voci dettate?</p>
            <Button big variant="secondary" onClick={() => setConfirmDiscard(false)}>
              No, torna
            </Button>
            <Button big variant="danger" onClick={onCancel}>
              Sì, butta via
            </Button>
          </>
        ) : (
          <>
            <Button
              big
              disabled={saving || !items.length || missingQuantity || needsChoice}
              onClick={() => onConfirm(items)}
            >
              <Check className="h-6 w-6" />
              {saving
                ? 'Salvo…'
                : items.length === 1
                  ? 'Aggiungi 1 voce'
                  : `Aggiungi ${items.length} voci`}
            </Button>
            <Button
              big
              variant="secondary"
              onClick={() => (items.length ? setConfirmDiscard(true) : onCancel())}
            >
              Annulla
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
