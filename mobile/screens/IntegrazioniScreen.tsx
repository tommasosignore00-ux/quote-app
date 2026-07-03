import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';

interface Integrazione {
  id: string;
  profile_id: string;
  provider: string;
  is_active: boolean;
  access_token?: string;
  refresh_token?: string;
  expires_at?: string;
  last_sync?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

const PROVIDERS = [
  { id: 'xero', name: 'Xero', description: 'Contabilità', icon: '📊', category: 'Contabilità' },
  { id: 'quickbooks', name: 'QuickBooks', description: 'Contabilità', icon: '💼', category: 'Contabilità' },
  { id: 'fortnox', name: 'Fortnox', description: 'Contabilità', icon: '📈', category: 'Contabilità' },
  { id: 'pipedrive', name: 'Pipedrive', description: 'CRM', icon: '👥', category: 'CRM' },
  { id: 'hubspot', name: 'HubSpot', description: 'CRM', icon: '🟠', category: 'CRM' },
  { id: 'google_calendar', name: 'Google Calendar', description: 'Calendario', icon: '📅', category: 'Calendario' },
  { id: 'apple_calendar', name: 'Apple Calendar', description: 'Calendario', icon: '🍎', category: 'Calendario' },
];

export default function IntegrazioniScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [integrazioni, setIntegrazioni] = useState<Record<string, Integrazione>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIntegrazioni();
  }, []);

  const fetchIntegrazioni = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('integrazioni')
        .select('*')
        .eq('profile_id', user.id);

      if (data) {
        const map: Record<string, Integrazione> = {};
        data.forEach(i => map[i.provider] = i);
        setIntegrazioni(map);
      }
    } catch (error) {
      console.error('Error fetching integrazioni:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (provider: string) => {
    Alert.alert(
      'Connetti ' + provider,
      'Questa funzionalità è in lavorazione!',
      [{ text: 'OK' }]
    );
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
      Alert.alert('Successo', 'Integrazione disconnessa!');
    } catch (error) {
      Alert.alert('Errore', (error as Error).message);
    }
  };

  const handleSync = async (provider: string) => {
    Alert.alert(
      'Sincronizza ' + provider,
      'Questa funzionalità è in lavorazione!',
      [{ text: 'OK' }]
    );
  };

  const groupedProviders = PROVIDERS.reduce((acc, p) => {
    if (!acc[p.category]) acc[p.category] = [];
    acc[p.category].push(p);
    return acc;
  }, {} as Record<string, typeof PROVIDERS>);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Integrazioni</Text>
      </View>

      <FlatList
        data={Object.entries(groupedProviders)}
        keyExtractor={([category]) => category}
        contentContainerStyle={styles.list}
        renderItem={({ item: [category, providers] }) => (
          <View style={styles.category}>
            <Text style={[styles.categoryTitle, { color: colors.secondaryText }]}>
              {category}
            </Text>
            {providers.map(provider => {
              const integrazione = integrazioni[provider.id];
              return (
                <View
                  key={provider.id}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.icon}>{provider.icon}</Text>
                    <View style={styles.cardInfo}>
                      <Text style={[styles.providerName, { color: colors.text }]}>
                        {provider.name}
                      </Text>
                      <Text style={[styles.providerDesc, { color: colors.secondaryText }]}>
                        {provider.description}
                      </Text>
                    </View>
                    <View style={styles.status}>
                      {integrazione?.is_active ? (
                        <Text style={styles.statusActive}>✅</Text>
                      ) : (
                        <Text style={styles.statusInactive}>❌</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.actions}>
                    {integrazione?.is_active ? (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: colors.secondary }]}
                          onPress={() => handleSync(provider.id)}
                        >
                          <Text style={styles.actionBtnText}>🔄 Sincronizza</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: '#dc2626' }]}
                          onPress={() => handleDisconnect(provider.id)}
                        >
                          <Text style={styles.actionBtnText}>Disconnetti</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                        onPress={() => handleConnect(provider.id)}
                      >
                        <Text style={styles.actionBtnText}>🔗 Connetti</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {integrazione?.last_sync && (
                    <Text style={[styles.lastSync, { color: colors.secondaryText }]}>
                      Ultima sincronizzazione: {new Date(integrazione.last_sync).toLocaleString()}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 24, fontWeight: 'bold' },
  list: { padding: 16 },
  category: { marginBottom: 24 },
  categoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  icon: { fontSize: 32, marginRight: 12 },
  cardInfo: { flex: 1 },
  providerName: { fontSize: 16, fontWeight: 'bold' },
  providerDesc: { fontSize: 12, marginTop: 2 },
  status: { padding: 4 },
  statusActive: { fontSize: 20 },
  statusInactive: { fontSize: 20, opacity: 0.5 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionBtnText: { color: 'white', fontSize: 12, fontWeight: 'bold' },
  lastSync: {
    fontSize: 10,
    marginTop: 8,
    textAlign: 'right',
  },
});
