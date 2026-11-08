'use client';

import { useState } from 'react';
import { parseItalianNumber } from '@/lib/voiceResult';

export type VoiceCandidate = {
  id: string;
  description: string;
  unit_price: number;
  markup_percent?: number;
  listino_id?: string | null;
  listino_name?: string | null;
  category?: string | null;
  fullMatch?: boolean;
  /** Found by meaning, not by the words said: never preselected. */
  semantic?: boolean;
};

export type VoiceDraftItem = {
  key: string;
  spoken: string;
  /** Empty when no quantity was said: required before confirming. */
  quantity: string;
  unit: string;
  /** Spoken or typed price; when empty the price list decides. */
  price: string;
  candidates: VoiceCandidate[];
  /** Index in candidates, -1 for none. */
  choice: number;
};

export type VoiceDraft =
  | { kind: 'cliente'; name: string }
  | { kind: 'lavoro'; title: string; clienteId: string }
  | { kind: 'items'; transcript: string; items: VoiceDraftItem[] };

type Props = {
  draft: VoiceDraft;
  clienti: { id: string; name: string }[];
  saving: boolean;
  salePrice: (item: VoiceCandidate) => number;
  onConfirm: (draft: VoiceDraft) => void;
  onCancel: () => void;
};

const inputClass = 'w-full border rounded px-3 py-2';

export default function VoiceConfirmModal({
  draft: initial,
  clienti,
  saving,
  salePrice,
  onConfirm,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState<VoiceDraft>(initial);

  const updateItem = (key: string, patch: Partial<VoiceDraftItem>) => {
    setDraft((current) =>
      current.kind === 'items'
        ? {
            ...current,
            items: current.items.map((item) =>
              item.key === key ? { ...item, ...patch } : item
            ),
          }
        : current
    );
  };

  const validQuantity = (text: string) => (parseItalianNumber(text) ?? 0) > 0;
  const canConfirm =
    draft.kind === 'cliente'
      ? Boolean(draft.name.trim())
      : draft.kind === 'lavoro'
        ? Boolean(draft.title.trim() && draft.clienteId)
        : draft.items.length > 0 &&
          draft.items.every((item) => validQuantity(item.quantity));

  const title =
    draft.kind === 'cliente'
      ? 'Creo questo cliente?'
      : draft.kind === 'lavoro'
        ? 'Creo questo lavoro?'
        : 'Controlla le voci dettate';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="bg-white rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-4"
      >
        <h3 className="text-lg font-bold">{title}</h3>

        {draft.kind === 'cliente' && (
          <label className="block text-sm font-medium">
            Nome del cliente
            <input
              className={inputClass}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
        )}

        {draft.kind === 'lavoro' && (
          <>
            <label className="block text-sm font-medium">
              Nome del lavoro
              <input
                className={inputClass}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium">
              Cliente
              <select
                className={inputClass}
                value={draft.clienteId}
                onChange={(e) => setDraft({ ...draft, clienteId: e.target.value })}
              >
                <option value="">Scegli il cliente</option>
                {clienti.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {draft.kind === 'items' && (
          <>
            {draft.transcript && (
              <p className="text-sm italic text-slate-500">
                &ldquo;{draft.transcript}&rdquo;
              </p>
            )}
            {draft.items.map((item) => {
              const match = item.candidates[item.choice];
              return (
                <div key={item.key} className="border rounded-lg p-3 space-y-2">
                  <p className="font-medium">{item.spoken}</p>
                  {item.candidates.length > 0 ? (
                    <label className="block text-sm">
                      {item.candidates.some((candidate) => candidate.semantic)
                        ? 'Articoli simili per significato: controlla che sia quello giusto'
                        : 'Articolo del listino'}
                      <select
                        className={inputClass}
                        value={item.choice}
                        onChange={(e) =>
                          updateItem(item.key, { choice: Number(e.target.value) })
                        }
                      >
                        <option value={-1}>Nessuno: usa il testo dettato</option>
                        {item.candidates.map((candidate, index) => (
                          <option key={candidate.id} value={index}>
                            {candidate.description} (€ {salePrice(candidate).toFixed(2)})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="text-sm text-amber-700">
                      Non trovato nel listino: inserisci il prezzo.
                    </p>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block text-sm">
                      Quantità
                      <input
                        className={`${inputClass} ${validQuantity(item.quantity) ? '' : 'border-amber-500'}`}
                        inputMode="decimal"
                        placeholder="da confermare"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.key, { quantity: e.target.value })
                        }
                      />
                    </label>
                    <label className="block text-sm">
                      Unità
                      <input
                        className={inputClass}
                        value={item.unit}
                        onChange={(e) => updateItem(item.key, { unit: e.target.value })}
                      />
                    </label>
                    <label className="block text-sm">
                      Prezzo €
                      <input
                        className={inputClass}
                        inputMode="decimal"
                        placeholder={match ? salePrice(match).toFixed(2) : '0,00'}
                        value={item.price}
                        onChange={(e) => updateItem(item.key, { price: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 rounded bg-slate-100"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => onConfirm(draft)}
            disabled={!canConfirm || saving}
            className="px-4 py-2 rounded bg-primary text-white disabled:opacity-50"
          >
            {saving ? 'Salvo…' : 'Conferma'}
          </button>
        </div>
      </div>
    </div>
  );
}
