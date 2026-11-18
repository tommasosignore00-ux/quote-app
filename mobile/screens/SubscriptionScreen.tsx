import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';
import { StatusPill, cantiere, radius, space, ufficio, type PillKind } from '../components/ui';

const formatDay = (value: string) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/**
 * Subscription status only. The app sells nothing and links to no payment page:
 * App Store and Play Store require their own in-app purchase for that.
 * Only the date is shown, never "N days left".
 */
export default function SubscriptionScreen() {
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

  const pill: { kind: PillKind; label: string } = isTrial
    ? { kind: 'accepted', label: 'Prova gratuita attiva' }
    : status === 'past_due'
      ? { kind: 'waiting', label: 'Pagamento da aggiornare' }
      : isSubscribed
        ? { kind: 'accepted', label: 'Attivo' }
        : { kind: 'toSend', label: 'Non attivo' };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      {profile ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <StatusPill kind={pill.kind} label={pill.label} icon={pill.kind === 'toSend' ? 'information-circle-outline' : undefined} />
          {isSubscribed ? (
            <>
              <Text style={[cantiere.titleSm, { color: colors.text }]}>Abbonamento {planName}</Text>
              {billingDate ? (
                <Text style={[ufficio.body, { color: colors.text }]}>
                  {billingLabel} {formatDay(billingDate)}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[ufficio.body, { color: colors.text }]}>Il tuo account non ha un abbonamento attivo.</Text>
          )}
        </View>
      ) : null}

      {profile?.is_founding_member && (
        <View style={styles.row}>
          <Ionicons name="ribbon-outline" size={24} color={colors.text} />
          <Text style={[ufficio.body, { color: colors.text, flex: 1 }]}>
            Cliente fondatore: il tuo prezzo resta bloccato finché l'abbonamento resta attivo senza interruzioni.
          </Text>
        </View>
      )}

      {/* A plain sentence, no big number. */}
      {quotesThisMonth !== null && (
        <Text style={[ufficio.body, styles.quotes, { color: colors.textSecondary }]}>
          {quotesThisMonth === 1
            ? 'Questo mese hai inviato 1 preventivo.'
            : `Questo mese hai inviato ${quotesThisMonth} preventivi.`}
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.s4, gap: space.s5 },
  card: { borderWidth: 1, borderRadius: radius.control, padding: space.s4, gap: space.s3 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.s3 },
  quotes: {},
});
