'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type Item = { id: string; description: string; unit_price: number; markup_percent?: number };

type Props = {
  alternatives: Item[];
  onSelect: (item: Item) => void;
  onCancel: () => void;
  onAddManual: (description: string) => void;
};

export default function SemanticFallbackModal({ alternatives, onSelect, onCancel, onAddManual }: Props) {
  const { t } = useTranslation();
  const [manualDesc, setManualDesc] = useState('');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6">
        <h3 className="font-bold mb-2">Scegli voce dal listino</h3>
        <p className="text-sm text-slate-600 mb-4">Abbiamo trovato più corrispondenze. Seleziona quella corretta:</p>
        <ul className="space-y-2 mb-4 max-h-48 overflow-y-auto">
          {alternatives.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onSelect(item)}
                className="w-full text-left p-3 rounded-lg border hover:bg-primary hover:text-white hover:border-primary transition"
              >
                <span className="font-medium">{item.description}</span>
                <span className="block text-sm text-slate-500">€{Number(item.unit_price).toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t pt-4">
          <p className="text-sm text-slate-600 mb-2">Oppure inserisci manualmente:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualDesc}
              onChange={(e) => setManualDesc(e.target.value)}
              placeholder="Descrizione"
              className="flex-1 border rounded-lg px-3 py-2"
            />
            <button
              onClick={() => { if (manualDesc.trim()) onAddManual(manualDesc.trim()); }}
              disabled={!manualDesc.trim()}
              className="btn-primary"
            >
              Aggiungi
            </button>
          </div>
        </div>
        <button onClick={onCancel} className="w-full mt-4 py-2 border rounded-lg hover:bg-slate-50">
          Annulla
        </button>
      </div>
    </div>
  );
}
