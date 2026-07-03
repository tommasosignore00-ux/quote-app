'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Calendar, Users, Building2, CheckCircle2, XCircle, Link2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface Integrazione {
  id: string;
  provider: string;
  is_active: boolean;
  last_sync?: string;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
}

const PROVIDERS = [
  { id: 'xero', name: 'Xero', description: 'Contabilità', icon: Building2, category: 'Contabilità' },
  { id: 'quickbooks', name: 'QuickBooks', description: 'Contabilità', icon: Building2, category: 'Contabilità' },
  { id: 'fortnox', name: 'Fortnox', description: 'Contabilità', icon: Building2, category: 'Contabilità' },
  { id: 'pipedrive', name: 'Pipedrive', description: 'CRM', icon: Users, category: 'CRM' },
  { id: 'hubspot', name: 'HubSpot', description: 'CRM', icon: Users, category: 'CRM' },
  { id: 'google_calendar', name: 'Google Calendar', description: 'Calendario', icon: Calendar, category: 'Calendario' },
  { id: 'apple_calendar', name: 'Apple Calendar', description: 'Calendario', icon: Calendar, category: 'Calendario' },
];

export default function IntegrazioniPage() {
  const [integrazioni, setIntegrazioni] = useState<Record<string, Integrazione>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIntegrazioni();
  }, []);

  const fetchIntegrazioni = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('integrazioni')
      .select('*')
      .eq('profile_id', user.id);

    if (data) {
      const map: Record<string, Integrazione> = {};
      data.forEach((i) => map[i.provider] = i);
      setIntegrazioni(map);
    }
    setLoading(false);
  };

  const handleConnect = async (provider: string) => {
    toast.success(`Connessione a ${provider} avviata (feature in lavorazione)`);
  };

  const handleDisconnect = async (provider: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('integrazioni')
        .delete()
        .eq('profile_id', user.id)
        .eq('provider', provider);

      fetchIntegrazioni();
      toast.success('Integrazione disconnessa');
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleSync = async (provider: string) => {
    toast.success(`Sincronizzazione con ${provider} (feature in lavorazione)`);
  };

  const groupedProviders = PROVIDERS.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {} as Record<string, typeof PROVIDERS>);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Integrazioni</h1>
        <p className="text-gray-600">Collega i tuoi strumenti preferiti</p>
      </div>

      {Object.keys(groupedProviders).map((category) => (
        <div key={category} className="mb-8">
          <h2 className="text-lg font-semibold mb-4">{category}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groupedProviders[category].map((provider) => {
              const integrazione = integrazioni[provider.id];
              const Icon = provider.icon;
              return (
                <div key={provider.id} className="bg-white p-6 rounded-xl shadow border border-gray-200">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-indigo-100 rounded-lg">
                        <Icon size={24} className="text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{provider.name}</h3>
                        <p className="text-sm text-gray-500">{provider.description}</p>
                      </div>
                    </div>
                    {integrazione?.is_active ? (
                      <CheckCircle2 size={20} className="text-green-500" />
                    ) : (
                      <XCircle size={20} className="text-gray-400" />
                    )}
                  </div>
                  <div className="mt-4">
                    {integrazione?.is_active ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSync(provider.id)}
                          className="flex-1 btn-secondary"
                        >
                          Sincronizza
                        </button>
                        <button
                          onClick={() => handleDisconnect(provider.id)}
                          className="px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-lg"
                        >
                          Disconnetti
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnect(provider.id)}
                        className="w-full btn-primary flex items-center justify-center gap-2"
                      >
                        <Link2 size={16} />
                        Connetti
                      </button>
                    )}
                  </div>
                  {integrazione?.last_sync && (
                    <p className="text-xs text-gray-400 mt-2">
                      Ultima sincronizzazione: {new Date(integrazione.last_sync).toLocaleString()}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
