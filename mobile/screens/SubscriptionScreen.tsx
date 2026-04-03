import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { stripeCheckout, stripePortal } from '../lib/supabaseFunctions';
import { useTheme } from '../lib/darkMode';

// Punto 31: Plan tiers
const PLANS = [
  {
    key: 'free',
    name: 'Free',
    price: '€0',
    period: '',
    features: [
      'Creazione e invio preventivi (max 5/mese)',
      '1 utente',
      'PDF con watermark',
      '1 template standard',
      'Cronologia ultimi 10 preventivi',
      'Notifiche base',
    ],
    priceId: null
  },
  {
    key: 'pro_monthly',
    name: 'Pro Mensile',
    price: '€29.99',
    period: '/mese',
    features: [
      'Preventivi illimitati',
      'PDF senza watermark',
      'Firma digitale',
      'Export multi-formato (Excel, Word, XML, JSON, CSV)',
      'Template personalizzati',
      'Cronologia avanzata',
      'Notifiche avanzate e promemoria',
      'Funzioni AI (suggerimenti, cross-selling)',
      'Branding personalizzato',
      'Supporto prioritario',
    ],
    priceId: 'price_pro_monthly'
  },
  {
    key: 'pro_yearly',
    name: 'Pro Annuale',
    price: '€299.99',
    period: '/anno',
    features: [
      'Tutto Pro',
      'Risparmia 2 mesi!'
    ],
    priceId: 'price_pro_yearly',
    badge: 'BEST VALUE'
  },
  {
    key: 'team',
    name: 'Team',
    price: '€79.99',
    period: '/mese',
    features: [
      'Tutto Pro',
      '5 utenti inclusi',
      '€7.99/mese per ogni utente extra',
      'Ruoli e permessi (admin, tecnico, sola lettura)',
      'Dashboard condivisa',
      'Gestione multi-azienda/sede',
      'Download massivo dati',
      'Accesso API/automazioni',
      'Report e statistiche avanzate',
    ],
    priceId: 'price_team'
  },
];

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [managingSubscription, setManagingSubscription] = useState(false);
  const [usageInfo, setUsageInfo] = useState<any>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setUser(currentUser);

      if (currentUser) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        setProfile(profileData);

        // Punto 33: Load quote usage (read-only)
        const { data: usage } = await supabase.rpc('get_quote_usage', { p_profile_id: currentUser.id }).maybeSingle();
        if (usage) setUsageInfo(usage);
      }
    };

    getUser();
  }, []);

  const handleSubscribe = async (planKey: string) => {
    if (!user) {
      Alert.alert(t('messages.error'), 'User not found');
      return;
    }
    const plan = PLANS.find(p => p.key === planKey);
    if (!plan?.priceId) return;

    // Map plan key to the existing checkout function param
    const checkoutPlan = planKey === 'pro_monthly' ? 'monthly' : planKey === 'pro_yearly' ? 'yearly' : planKey;

    setLoadingPlan(planKey);
    try {
      const { url } = await stripeCheckout(checkoutPlan as any, user.id, profile?.is_founding_member);
      if (url) {
        await Linking.openURL(url);
      }
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleManageSubscription = async () => {
    if (!profile?.stripe_customer_id) {
      Alert.alert(t('messages.error'), 'No Stripe customer found');
      return;
    }

    setManagingSubscription(true);
    try {
      const { url } = await stripePortal(profile.stripe_customer_id);
      if (url) {
        await Linking.openURL(url);
      }
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setManagingSubscription(false);
    }
  };

  const isSubscribed = profile?.subscription_status === 'active';

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('subscription.title') || 'Abbonamento'}</Text>

      {/* Punto 39: Founding Member Badge */}
      {profile?.is_founding_member && (
        <View style={styles.foundingBadge}>
          <Text style={styles.foundingBadgeTitle}>🏆 Founding Member!</Text>
          <Text style={styles.foundingBadgeText}>
            Prezzo bloccato: €{profile.founding_member_locked_price || '19.99'}/mese per sempre
          </Text>
        </View>
      )}

      {/* Punto 33: Quote Usage Counter */}
      {usageInfo && (
        <View style={[styles.usageBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text, marginBottom: 4 }}>📊 Utilizzo preventivi</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: usageInfo.within_limit ? '#059669' : '#dc2626' }}>{usageInfo.quotes_generated}</Text>
            <Text style={{ fontSize: 16, color: colors.textSecondary }}>/{usageInfo.quotes_limit} questo mese</Text>
          </View>
          {usageInfo.overage_count > 0 && (
            <Text style={{ color: '#dc2626', fontSize: 13, marginTop: 4 }}>⚠️ {usageInfo.overage_count} extra (€1.50/cad.)</Text>
          )}
        </View>
      )}

      {isSubscribed ? (
        <View style={[styles.activeBox, { backgroundColor: colors.successBg, borderLeftColor: colors.success }]}>
          <Text style={[styles.activeText, { color: colors.successText }]}>✅ {t('subscription.active') || 'Abbonamento Attivo'}</Text>
          <Text style={[styles.dateText, { color: colors.success }]}>
            {t('subscription.expires') || 'Scade il'}: {new Date(profile.subscription_end_date).toLocaleDateString('it-IT')}
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.manageButton, { backgroundColor: colors.primary }]}
            onPress={handleManageSubscription}
            disabled={managingSubscription}
          >
            {managingSubscription ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('subscription.manage') || 'Gestisci abbonamento'}</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.plansContainer}>
          {PLANS.map(plan => (
            <View key={plan.key} style={[styles.planCard, { backgroundColor: colors.card, borderColor: plan.badge ? '#dc2626' : colors.border }]}>
              {plan.badge && (
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeText}>{plan.badge}</Text>
                </View>
              )}
              <Text style={[styles.planName, { color: colors.text }]}>{plan.name}</Text>
              <Text style={[styles.planPrice, { color: colors.text }]}>{plan.price}<Text style={{ fontSize: 14, fontWeight: '400' }}>{plan.period}</Text></Text>
              {plan.features.map((f, i) => (
                <Text key={i} style={{ color: colors.textSecondary, fontSize: 14, marginBottom: 4 }}>✓ {f}</Text>
              ))}
              {plan.priceId ? (
                <TouchableOpacity
                  style={[styles.button, plan.badge ? styles.primaryButton : {}, { backgroundColor: colors.primary, marginTop: 12 }]}
                  onPress={() => handleSubscribe(plan.key)}
                  disabled={!!loadingPlan}
                >
                  {loadingPlan === plan.key ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>{t('subscription.subscribe') || 'Sottoscrivi'}</Text>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={[styles.button, { backgroundColor: '#e2e8f0', marginTop: 12 }]}>
                  <Text style={[styles.buttonText, { color: '#64748b' }]}>Piano attuale</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#1e293b',
  },
  activeBox: {
    backgroundColor: '#d1fae5',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  activeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#065f46',
    marginBottom: 10,
  },
  dateText: {
    fontSize: 14,
    color: '#047857',
  },
  plansContainer: {
    flexDirection: 'column',
    gap: 16,
  },
  planCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  planName: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 8,
  },
  savingText: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '600',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#64748b',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#0f172a',
  },
  manageButton: {
    backgroundColor: '#0f172a',
    marginTop: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  foundingBadge: {
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#f59e0b',
  },
  foundingBadgeTitle: {
    fontWeight: '700',
    fontSize: 18,
    color: '#92400e',
    marginBottom: 4,
  },
  foundingBadgeText: {
    color: '#78350f',
    fontSize: 14,
  },
  usageBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  planBadge: {
    position: 'absolute',
    top: -10,
    right: 12,
    backgroundColor: '#dc2626',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  planBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
