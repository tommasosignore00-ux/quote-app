import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';

/**
 * Subscription status only. The app sells nothing and links to no payment page:
 * App Store and Play Store require their own in-app purchase for that.
 */
export default function SubscriptionScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [profile, setProfile] = useState<any>(null);
  const [quotesThisMonth, setQuotesThisMonth] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileData } = await supabase
        .from('profiles')
        .select('subscription_status, subscription_plan, trial_ends_at, subscription_period_end, subscription_cancel_at_period_end, is_founding_member')
        .eq('id', user.id)
        .single();
      setProfile(profileData);
      const { data: usage } = await supabase.rpc('get_quote_usage', { p_profile_id: user.id }).maybeSingle();
      if (usage) setQuotesThisMonth(Number((usage as any).quotes_generated) || 0);
    };
    load();
  }, []);

  const status = profile?.subscription_status;
  const isTrial = status === 'trialing';
  const isSubscribed = ['active', 'trialing', 'past_due'].includes(status);
  const billingDate = isTrial ? profile?.trial_ends_at : profile?.subscription_period_end;
  const billingLabel = isTrial
    ? 'Periodo di prova fino al'
    : profile?.subscription_cancel_at_period_end
      ? 'Termina il'
      : 'Si rinnova il';
  const planName =
    profile?.subscription_plan === 'team' ? 'Team' : profile?.subscription_plan === 'yearly' ? 'Annuale' : 'Mensile';

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t('subscription.title') || 'Abbonamento'}</Text>

      {profile?.is_founding_member && (
        <View style={styles.foundingBadge}>
          <Text style={styles.foundingBadgeTitle}>Cliente fondatore</Text>
          <Text style={styles.foundingBadgeText}>
            Il tuo prezzo resta bloccato finché l'abbonamento resta attivo senza interruzioni.
          </Text>
        </View>
      )}

      {isSubscribed ? (
        <View style={[styles.activeBox, { backgroundColor: colors.successBg, borderLeftColor: colors.success }]}>
          <Text style={[styles.activeText, { color: colors.successText }]}>
            {isTrial ? 'Prova gratuita attiva' : status === 'past_due' ? 'Pagamento da aggiornare' : `Abbonamento ${planName} attivo`}
          </Text>
          {billingDate ? (
            <Text style={[styles.dateText, { color: colors.success }]}>
              {billingLabel}: {new Date(billingDate).toLocaleDateString('it-IT')}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.infoText, { color: colors.text }]}>Il tuo account non ha un abbonamento attivo.</Text>
        </View>
      )}

      {quotesThisMonth !== null && (
        <View style={[styles.infoBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text, marginBottom: 4 }}>Preventivi inviati questo mese</Text>
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>{quotesThisMonth}</Text>
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
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
  },
  activeText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  dateText: {
    fontSize: 16,
  },
  infoBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  infoText: {
    fontSize: 16,
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
    fontSize: 16,
  },
});
