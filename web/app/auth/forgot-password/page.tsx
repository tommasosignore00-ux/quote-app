'use client';

import { useState } from 'react';
import { toast } from 'react-hot-toast';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      toast.error('Inserisci la tua email');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Invio non riuscito. Riprova.');
        return;
      }

      toast.success('Reset email sent! Check your inbox.');
      setSubmitted(true);
      setEmail('');
    } catch (err: any) {
      console.error('Forgot password error:', err);
      toast.error('Si è verificato un errore');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Controlla la tua email
          </h2>
          <p className="text-gray-600 mb-4">
            Se l&apos;indirizzo è registrato, abbiamo inviato il link a{' '}
            <strong>{email}</strong>
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Il link vale per un&apos;ora. Se non vedi l&apos;email, controlla anche nello
            spam.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="text-primary hover:underline font-semibold"
          >
            Usa un&apos;altra email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Password dimenticata?</h1>
        <p className="text-gray-600 mb-8">
          Inserisci la tua email: ti mandiamo il link per sceglierne una nuova.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="nome@azienda.it"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition mt-6"
          >
            {loading ? 'Invio in corso...' : 'Invia il link'}
          </button>
        </form>

        {/* Back to Login */}
        <p className="text-center text-gray-600 mt-6">
          Ricordi la password?{' '}
          <a href="/auth/login" className="text-primary hover:underline font-semibold">
            Accedi
          </a>
        </p>
      </div>
    </div>
  );
}
