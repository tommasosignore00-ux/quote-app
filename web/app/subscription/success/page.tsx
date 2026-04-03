'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export const dynamic = 'force-dynamic';

export default function SubscriptionSuccessPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId) {
      toast.error('Session ID not found');
      router.push('/dashboard/subscription');
      return;
    }

    const handleSuccess = async () => {
      try {
        setLoading(true);

        // Get current user
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          // User session lost, redirect to login with return URL
          toast.error('Please log in to activate your subscription');
          setTimeout(() => {
            router.push('/auth/login');
          }, 1500);
          return;
        }

        // Poll for subscription status with retries
        let attempts = 0;
        const maxAttempts = 10; // Try for up to 20 seconds
        let subscriptionActive = false;

        while (attempts < maxAttempts && !subscriptionActive) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('subscription_status, trial_expires_at')
            .eq('id', user.id)
            .single();

          if (profile?.subscription_status === 'active' || profile?.subscription_status === 'trialing') {
            subscriptionActive = true;
            toast.success(t('subscription.successMessage') || 'Subscription activated! Welcome to QuoteApp');
            setTimeout(() => {
              router.push('/dashboard');
            }, 1500);
            break;
          }

          if (attempts < maxAttempts - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          attempts++;
        }

        if (!subscriptionActive) {
          // After retries, redirect to dashboard anyway
          // The subscription will be active once webhook processes
          toast.success('Proceeding to dashboard...');
          setTimeout(() => {
            router.push('/dashboard');
          }, 2000);
        }
      } catch (err: any) {
        console.error('Subscription success error:', err);
        toast.error('Error confirming subscription');
        setTimeout(() => {
          router.push('/dashboard');
        }, 2000);
      } finally {
        setLoading(false);
      }
    };

    handleSuccess();
  }, [searchParams, router, t]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
      <div className="text-center">
        <div className="mb-6 animate-bounce">
          <div className="text-6xl">✅</div>
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">
          {loading ? 'Processing your subscription...' : 'Subscription Confirmed!'}
        </h1>
        <p className="text-slate-300 mb-8">
          {loading ? 'Please wait while we confirm your subscription.' : 'You now have access to all features!'}
        </p>
        
        {loading && (
          <div className="flex justify-center gap-2 mb-8">
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-red-600 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
          </div>
        )}

        <button
          onClick={() => router.push('/dashboard')}
          className="btn-primary px-8 py-3"
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
