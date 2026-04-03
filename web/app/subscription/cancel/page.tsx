'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

export default function SubscriptionCancelPage() {
  const { t } = useTranslation();
  const router = useRouter();

  useEffect(() => {
    toast.error('Subscription cancelled. Your trial has been cancelled.');
    setTimeout(() => {
      router.push('/dashboard/subscription');
    }, 3000);
  }, [router, t]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="mb-6">
          <div className="text-6xl">❌</div>
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">Subscription Cancelled</h1>
        <p className="text-slate-300 mb-8">
          Your subscription process was cancelled. You can try again anytime.
        </p>
        
        <button
          onClick={() => router.push('/dashboard/subscription')}
          className="btn-primary px-8 py-3"
        >
          Back to Subscription
        </button>
      </div>
    </div>
  );
}
