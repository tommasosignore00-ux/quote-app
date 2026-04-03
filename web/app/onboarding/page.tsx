'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { loadStripe } from '@stripe/stripe-js';
import toast from 'react-hot-toast';
import { setLanguage } from '@/lib/language';

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!);

const TUTORIAL_STEPS = [
  { key: 'voice', icon: '🎤', title_key: 'onboarding.voice', desc_key: 'onboarding.voiceDesc' },
  { key: 'listini', icon: '📋', title_key: 'onboarding.listini', desc_key: 'onboarding.listiniDesc' },
  { key: 'preventivo', icon: '📄', title_key: 'onboarding.preventivo', desc_key: 'onboarding.preventivoDesc' },
];

export default function OnboardingPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [mainStep, setMainStep] = useState(1); // 1: Welcome, 2: Tutorial, 3: Company Info, 4: Plan, 5: Done
  const [tutorialStep, setTutorialStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [selectedPlan, setSelectedPlan] = useState<'price_monthly' | 'price_yearly'>('price_monthly');
  const [formData, setFormData] = useState({
    company_name: '',
    vat_number: '',
    country_code: 'IT',
    language: i18n.language || 'en',
  });

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = '/auth/login';
        return;
      }
      setUser(data.session.user);

      // Load profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        // Only redirect if onboarding is truly completed
        if (profileData.onboarding_completed === true) {
          console.log('Onboarding already completed, redirecting to dashboard');
          window.location.href = '/dashboard';
        }
      }
    };

    checkAuth();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleContinueCompanyInfo = () => {
    if (!formData.company_name.trim()) {
      toast.error('Company name is required');
      return;
    }
    setMainStep(4);
  };

  const handleCheckout = async (plan: 'price_monthly' | 'price_yearly') => {
    if (!user) return;

    setSelectedPlan(plan);
    setLoading(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          email: user.email,
          companyName: formData.company_name,
          priceId: plan,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to create checkout session');
        return;
      }

      const stripe = await stripePromise;
      if (stripe) {
        await stripe.redirectToCheckout({ sessionId: data.sessionId });
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      toast.error('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipToTrial = async () => {
    await finishOnboarding();
  };

  const finishOnboarding = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          company_name: formData.company_name,
          vat_number: formData.vat_number,
          country_code: formData.country_code,
          language: formData.language,
          onboarding_completed: true,
        })
        .eq('id', user.id);

      if (error) throw error;

      await setLanguage(formData.language);
      setMainStep(5);
      setTimeout(() => router.push('/dashboard'), 2000);
    } catch (err: any) {
      console.error('Finish onboarding error:', err);
      toast.error('Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Welcome
  if (mainStep === 1) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white/10 backdrop-blur rounded-2xl p-8 text-white text-center">
          <div className="text-6xl mb-6">🚀</div>
          <h1 className="text-4xl font-bold mb-4">Welcome to QuoteApp!</h1>
          <p className="text-slate-200 mb-8 text-lg">
            Create professional quotes and manage your clients with ease.
          </p>
          <ul className="text-left space-y-3 mb-8 text-slate-300">
            <li className="flex items-center">
              <span className="text-green-400 mr-3 text-xl">✓</span> Voice-powered quote creation
            </li>
            <li className="flex items-center">
              <span className="text-green-400 mr-3 text-xl">✓</span> Multi-language support
            </li>
            <li className="flex items-center">
              <span className="text-green-400 mr-3 text-xl">✓</span> Professional templates for 32 countries
            </li>
            <li className="flex items-center">
              <span className="text-green-400 mr-3 text-xl">✓</span> Secure client & quote management
            </li>
          </ul>
          <button
            onClick={() => setMainStep(2)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            Get Started
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Tutorial
  if (mainStep === 2) {
    const current = TUTORIAL_STEPS[tutorialStep];
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white/10 backdrop-blur rounded-2xl p-8 text-white">
          <div className="flex justify-center gap-2 mb-6">
            {TUTORIAL_STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setTutorialStep(i)}
                className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition ${
                  i === tutorialStep ? 'bg-blue-600' : 'bg-white/20'
                }`}
              >
                {s.icon}
              </button>
            ))}
          </div>
          <h2 className="text-2xl font-bold mb-2">{t(current.title_key)}</h2>
          <p className="text-slate-200 mb-8">{t(current.desc_key)}</p>
          <div className="bg-white/10 rounded-xl h-40 flex items-center justify-center text-6xl mb-8">
            {current.icon}
          </div>
          <div className="flex gap-4">
            {tutorialStep > 0 && (
              <button 
                onClick={() => setTutorialStep(tutorialStep - 1)} 
                className="flex-1 py-3 px-4 rounded-lg bg-white/20 hover:bg-white/30"
              >
                Back
              </button>
            )}
            {tutorialStep < TUTORIAL_STEPS.length - 1 ? (
              <button 
                onClick={() => setTutorialStep(tutorialStep + 1)} 
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition"
              >
                Next
              </button>
            ) : (
              <button 
                onClick={() => setMainStep(3)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition"
              >
                Continue
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Step 3: Company Info
  if (mainStep === 3) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white/10 backdrop-blur rounded-2xl p-8 text-white">
          <h2 className="text-2xl font-bold mb-2">Company Information</h2>
          <p className="text-slate-300 mb-6">Tell us about your company</p>

          <form className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Company Name *</label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                placeholder="Your Company Name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">VAT Number (optional)</label>
              <input
                type="text"
                name="vat_number"
                value={formData.vat_number}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500"
                placeholder="IT12345678901"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Country</label>
              <select
                name="country_code"
                value={formData.country_code}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="IT">Italy</option>
                <option value="ES">Spain</option>
                <option value="FR">France</option>
                <option value="DE">Germany</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Preferred Language</label>
              <select
                name="language"
                value={formData.language}
                onChange={handleInputChange}
                className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-blue-500"
              >
                <option value="en">English</option>
                <option value="it">Italiano</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
              </select>
            </div>
          </form>

          <div className="flex gap-4 mt-8">
            <button
              onClick={() => setMainStep(2)}
              className="flex-1 py-3 rounded-lg bg-white/20 hover:bg-white/30 transition"
            >
              Back
            </button>
            <button
              onClick={handleContinueCompanyInfo}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 4: Choose Plan
  if (mainStep === 4) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <h2 className="text-3xl font-bold text-white mb-4 text-center">Choose Your Plan</h2>
          <p className="text-slate-300 text-center mb-8">Get started with our flexible pricing</p>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Monthly */}
            <div className="bg-white/10 border border-white/20 rounded-lg p-6 hover:border-blue-500 transition">
              <h3 className="text-xl font-bold text-white mb-2">Monthly</h3>
              <p className="text-4xl font-bold text-blue-400 mb-2">€29</p>
              <p className="text-slate-300 text-sm mb-6">/month, cancel anytime + 7 day trial</p>
              <button
                onClick={() => handleCheckout('price_monthly')}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-2 rounded-lg transition"
              >
                {loading && selectedPlan === 'price_monthly' ? 'Processing...' : 'Choose Monthly'}
              </button>
            </div>

            {/* Yearly */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 border border-blue-400 rounded-lg p-6 relative">
              <div className="absolute top-0 right-0 bg-green-500 text-white px-3 py-1 rounded-bl text-xs font-bold">
                SAVE 17%
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Yearly</h3>
              <p className="text-4xl font-bold text-white mb-2">€290</p>
              <p className="text-blue-100 text-sm mb-6">/year (€24.17/month) + 7 day trial</p>
              <button
                onClick={() => handleCheckout('price_yearly')}
                disabled={loading}
                className="w-full bg-white hover:bg-slate-100 text-blue-600 font-semibold py-2 rounded-lg transition"
              >
                {loading && selectedPlan === 'price_yearly' ? 'Processing...' : 'Choose Yearly'}
              </button>
            </div>
          </div>

          <div className="bg-white/10 border border-white/20 rounded-lg p-4 mb-8">
            <p className="text-sm text-slate-300">
              <strong className="text-white">What's included:</strong> Unlimited quotes, clients, price lists, voice transcription, 21 languages, professional templates, and more.
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setMainStep(3)}
              className="flex-1 py-3 rounded-lg bg-white/20 hover:bg-white/30 text-white transition"
            >
              Back
            </button>
            <button
              onClick={handleSkipToTrial}
              className="flex-1 bg-slate-600 hover:bg-slate-700 text-white font-semibold py-3 rounded-lg transition"
            >
              Skip (Start Free Trial)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 5: Done
  if (mainStep === 5) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white/10 backdrop-blur rounded-2xl p-8 text-white text-center">
          <div className="text-6xl mb-6">✅</div>
          <h1 className="text-3xl font-bold mb-4">All Set!</h1>
          <p className="text-slate-200 mb-8">
            Your account is ready. Let's start creating amazing quotes.
          </p>
          <button
            onClick={() => router.push('/dashboard')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return null;
}
