'use client';

import { useState } from 'react';

type Decision = 'accepted' | 'rejected';

export default function DecisionForm({ token }: { token: string }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Decision | null>(null);
  // A refusal is final: it is sent only after a second, explicit confirmation.
  const [confirmingRefusal, setConfirmingRefusal] = useState(false);
  const nameMissing = name.trim().length < 3;

  const send = async (decision: Decision) => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/quote/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, name, note }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          payload?.error || 'Non è stato possibile registrare la risposta.'
        );
      }
      setDone(decision);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <p role="status" className="rounded-lg bg-slate-100 p-4 text-slate-800">
        {done === 'accepted'
          ? 'Grazie: il preventivo risulta accettato. Il fornitore riceverà la tua conferma.'
          : 'Risposta registrata: il preventivo risulta rifiutato.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-base text-slate-700">
        Nome e cognome (necessari per accettare)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={120}
          className="mt-1 min-h-[48px] w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      <label className="block text-base text-slate-700">
        Note per il fornitore (facoltative)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {confirmingRefusal ? (
        <div
          role="alertdialog"
          aria-labelledby="conferma-rifiuto"
          className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4"
        >
          <p id="conferma-rifiuto" className="text-base text-red-900">
            Confermi di rifiutare il preventivo? Il fornitore riceverà la risposta e non
            potrai più cambiarla da questa pagina.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => send('rejected')}
              disabled={sending}
              className="min-h-[48px] rounded-lg bg-red-700 px-5 font-medium text-white disabled:opacity-50"
            >
              Sì, rifiuto il preventivo
            </button>
            <button
              onClick={() => setConfirmingRefusal(false)}
              disabled={sending}
              className="min-h-[48px] rounded-lg border border-slate-300 bg-white px-5 font-medium text-slate-700 disabled:opacity-50"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => send('accepted')}
            disabled={sending || nameMissing}
            aria-describedby={nameMissing ? 'serve-nome' : undefined}
            className="min-h-[48px] rounded-lg bg-green-700 px-5 font-medium text-white disabled:opacity-50"
          >
            Accetto il preventivo
          </button>
          <button
            onClick={() => setConfirmingRefusal(true)}
            disabled={sending}
            className="min-h-[48px] rounded-lg border border-slate-300 px-5 font-medium text-slate-700 disabled:opacity-50"
          >
            Rifiuto
          </button>
        </div>
      )}
      {nameMissing && !confirmingRefusal ? (
        <p id="serve-nome" className="text-base text-slate-600">
          Per accettare scrivi prima nome e cognome.
        </p>
      ) : null}
      <p className="text-xs text-slate-500">
        Rispondendo vengono registrati nome, data, indirizzo IP e browser, come prova
        della risposta data.
      </p>
    </div>
  );
}
