'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'react-hot-toast';

export const dynamic = 'force-dynamic';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenParam = searchParams?.get('token');
  const emailParam = searchParams?.get('email');

  const [email, setEmail] = useState(emailParam || '');
  const [token, setToken] = useState(tokenParam || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !token || !newPassword || !confirmPassword) {
      toast.error('Compila tutti i campi');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('Le password non coincidono');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          email,
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Operazione non riuscita. Richiedi un nuovo link.');
        return;
      }

      toast.success('Password aggiornata');
      router.push('/auth/login');
    } catch (err: any) {
      console.error('Reset password error:', err);
      toast.error('Si è verificato un errore');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Nuova password</h1>
        <p className="text-gray-600 mb-8">Scegli la nuova password del tuo account</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="nome@azienda.it"
              disabled={!!emailParam}
            />
          </div>

          {/* Token */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Codice del link
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              placeholder="Incolla il codice ricevuto"
              disabled={!!tokenParam}
            />
          </div>

          {/* Nuova password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nuova password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Almeno 8 caratteri"
            />
          </div>

          {/* Conferma password */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Conferma password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ripeti la password"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition mt-6"
          >
            {loading ? 'Salvataggio...' : 'Salva la password'}
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100" />
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
