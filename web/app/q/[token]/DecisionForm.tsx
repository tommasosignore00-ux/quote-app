'use client';

import { useState } from 'react';

type Decision = 'accepted' | 'rejected';

export default function DecisionForm({ token }: { token: string }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Decision | null>(null);

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
      if (!res.ok)
        {throw new Error(
          payload?.error || 'Non è stato possibile registrare la risposta.'
        );}
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
      <label className="block text-sm text-slate-700">
        Nome e cognome (necessari per accettare)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={120}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block text-sm text-slate-700">
        Note per il fornitore (facoltative)
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => send('accepted')}
          disabled={sending || name.trim().length < 3}
          className="rounded-lg bg-green-700 px-5 py-2 font-medium text-white disabled:opacity-50"
        >
          Accetto il preventivo
        </button>
        <button
          onClick={() => send('rejected')}
          disabled={sending}
          className="rounded-lg border border-slate-300 px-5 py-2 font-medium text-slate-700 disabled:opacity-50"
        >
          Rifiuto
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Rispondendo vengono registrati nome, data, indirizzo IP e browser, come prova
        della risposta data.
      </p>
    </div>
  );
}
