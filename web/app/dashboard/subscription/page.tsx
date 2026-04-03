'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

export default function SubscriptionPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);

      if (currentUser) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('subscription_status, trial_ends_at, stripe_customer_id, subscription_plan')
          .eq('id', currentUser.id)
          .single();

        console.log('[Subscription Debug] user:', currentUser.id, 'profile:', JSON.stringify(profile), 'error:', error);
        setSubscription(profile);
      }
    };

    getUser();
  }, []);

  const status = subscription?.subscription_status || '';
  const trialEndsAt = subscription?.trial_ends_at ? new Date(subscription.trial_ends_at) : null;
  const skipSub = process.env.NEXT_PUBLIC_SKIP_SUBSCRIPTION === 'true';
  const isActive = status === 'active';
  const isTeam = status === 'team';
  const isTrial = status === 'trialing' || (!isActive && !isTeam && trialEndsAt && trialEndsAt > new Date());
  const isSubscribed = isActive || isTeam || isTrial || skipSub;
  const currentPlan = isTeam ? 'team' : (subscription?.subscription_plan || '');

  const handleSubscribe = async (plan: 'monthly' | 'yearly' | 'team') => {
    if (!user) {
      toast.error(t('messages.notAuthenticated'));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, email: user.email, plan }),
      });
      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No checkout URL');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user) return;

    setLoading(true);
    try {
      if (!subscription?.stripe_customer_id) {
        throw new Error('No Stripe customer found');
      }

      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: subscription.stripe_customer_id }),
      });

      const { url } = await res.json();
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{t('subscription.title')}</h1>

      {/* Piano attuale */}
      {isSubscribed && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-semibold text-green-800">
                {isTeam
                  ? t('subscription.activeTeam')
                  : isActive
                    ? t('subscription.active')
                    : isTrial
                      ? 'Trial attivo'
                      : 'Accesso attivo'}
              </p>
              <p className="mt-1 text-sm text-green-700">
                {trialEndsAt
                  ? `Scade il ${trialEndsAt.toLocaleDateString('it-IT')}`
                  : ''}
              </p>
            </div>
            {subscription?.stripe_customer_id && (
              <button
                onClick={handleManageSubscription}
                disabled={loading}
                className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
              >
                {loading ? '...' : t('subscription.manage')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Piani disponibili — sempre visibili */}
      <div>
        <p className="text-sm text-slate-600 mb-4">
          {isSubscribed ? 'Confronta i piani o cambia abbonamento.' : t('subscription.chooseYourPlan')}
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Monthly */}
          <div className={`rounded-2xl border bg-white p-6 shadow-sm ${currentPlan === 'monthly' ? 'border-green-400 ring-2 ring-green-200' : 'border-slate-200'}`}>
            {currentPlan === 'monthly' && <span className="mb-3 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Piano attuale</span>}
            <h3 className="text-lg font-semibold text-slate-900 mb-1">{t('subscription.monthly')}</h3>
            <p className="text-3xl font-bold text-slate-900 mb-1">
              €29.99<span className="text-base font-normal text-slate-500">{t('subscription.perMonth')}</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>✔ {t('subscription.unlimitedQuotes')}</li>
              <li>✔ {t('subscription.noWatermark')}</li>
              <li>✔ {t('subscription.digitalSignature')}</li>
              <li>✔ {t('subscription.multiExport')}</li>
              <li>✔ {t('subscription.aiFeatures')}</li>
            </ul>
            <button
              onClick={() => handleSubscribe('monthly')}
              disabled={loading || currentPlan === 'monthly'}
              className="mt-6 w-full rounded-lg bg-slate-700 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {currentPlan === 'monthly' ? 'Attivo' : loading ? '...' : t('subscription.subscribe')}
            </button>
          </div>

          {/* Yearly */}
          <div className={`relative rounded-2xl border-2 bg-white p-6 shadow-sm ${currentPlan === 'yearly' ? 'border-green-400 ring-2 ring-green-200' : 'border-slate-900'}`}>
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white">
              {currentPlan === 'yearly' ? 'Piano attuale' : t('subscription.bestValue')}
            </span>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">{t('subscription.yearly')}</h3>
            <p className="text-3xl font-bold text-slate-900 mb-1">
              €299.99<span className="text-base font-normal text-slate-500">{t('subscription.perYear')}</span>
            </p>
            <p className="text-sm font-semibold text-green-600">{t('subscription.saveTwoMonths')}</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>✔ {t('subscription.everythingPro')}</li>
              <li>✔ {t('subscription.saveTwoMonths')}</li>
            </ul>
            <button
              onClick={() => handleSubscribe('yearly')}
              disabled={loading || currentPlan === 'yearly'}
              className="mt-6 w-full rounded-lg bg-slate-900 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-50"
            >
              {currentPlan === 'yearly' ? 'Attivo' : loading ? '...' : t('subscription.subscribe')}
            </button>
          </div>

          {/* Team */}
          <div className={`relative rounded-2xl border-2 bg-white p-6 shadow-sm ${isTeam ? 'border-green-400 ring-2 ring-green-200' : 'border-indigo-600'}`}>
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3 py-1 text-xs font-bold text-white">
              Team
            </span>
            {isTeam && <span className="mb-3 inline-block rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Piano attuale</span>}
            <h3 className="text-lg font-semibold text-slate-900 mb-1">{t('subscription.team')}</h3>
            <p className="text-3xl font-bold text-slate-900 mb-1">
              €79.99<span className="text-base font-normal text-slate-500">{t('subscription.perMonth')}</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>✔ {t('subscription.everythingPro')}</li>
              <li>✔ {t('subscription.upTo10Users')}</li>
              <li>✔ {t('subscription.rolesPermissions')}</li>
              <li>✔ {t('subscription.sharedDashboard')}</li>
              <li>✔ {t('subscription.apiAccess')}</li>
              <li>✔ {t('subscription.advancedReports')}</li>
            </ul>
            <button
              onClick={() => handleSubscribe('team')}
              disabled={loading || isTeam}
              className="mt-6 w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            >
              {isTeam ? 'Attivo' : loading ? '...' : t('subscription.subscribe')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
