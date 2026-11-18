import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Pressable, SafeAreaView, StyleSheet, Text, View, ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  BottomTabBar,
  Chip,
  EmptyState,
  SecondaryButton,
  StatusPill,
  TertiaryButton,
  cantiere,
  radius,
  space,
  type PillKind,
} from '../components/ui';
import { WebView } from 'react-native-webview';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';
import {
  fetchQuoteVersions,
  latestPerJob,
  quoteStage,
  STAGE_LABELS,
  type QuoteStage,
  type QuoteVersionRow,
} from '../lib/quoteTracking';

const STAGE_PILL: Record<QuoteStage, PillKind> = {
  accepted: 'accepted',
  rejected: 'refused',
  sent: 'waiting',
  validated: 'toSend',
};

const FILTERS: Array<{ key: QuoteStage | 'all'; label: string }> = [
  { key: 'all', label: 'Tutti' },
  { key: 'accepted', label: 'Accettati' },
  { key: 'sent', label: 'In attesa' },
  { key: 'validated', label: 'Da inviare' },
  { key: 'rejected', label: 'Rifiutati' },
];

/** Days a sent quote has been waiting for an answer; shown from the third day. */
const WAITING_DAYS = 3;

function daysWaiting(row: QuoteVersionRow): number {
  if (!row.sent_at || row.client_decision) return 0;
  return Math.floor((Date.now() - new Date(row.sent_at).getTime()) / 86400000);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PreventiviScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const [rows, setRows] = useState<QuoteVersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<QuoteStage | 'all'>('all');
  const [viewing, setViewing] = useState<{ title: string; html: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchQuoteVersions()
        .then((data) => setRows(latestPerJob(data)))
        .catch((err: Error) => Alert.alert('Errore', err.message))
        .finally(() => setLoading(false));
    }, [])
  );

  const visible = useMemo(
    () => rows.filter((row) => filter === 'all' || quoteStage(row) === filter),
    [rows, filter]
  );

  const openQuote = async (row: QuoteVersionRow) => {
    const { data, error } = await supabase.from('preventivi_versioni').select('html_content').eq('id', row.id).single();
    if (error) {
      Alert.alert('Errore', error.message);
      return;
    }
    setViewing({ title: row.lavori?.title || 'Preventivo', html: data?.html_content || '' });
  };

  const renderItem = ({ item }: { item: QuoteVersionRow }) => {
    const stage = quoteStage(item);
    // Only a label and a call the user makes himself: nothing is ever sent to the client.
    const waiting = daysWaiting(item);
    const phone = item.lavori?.clienti?.phone?.trim();
    const clientName = item.lavori?.clienti?.name || '—';
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {/* The tappable part and the call button are siblings, so VoiceOver reaches both. */}
        <Pressable
          onPress={() => openQuote(item)}
          accessibilityRole="button"
          accessibilityHint="Apre il preventivo"
          style={({ pressed }) => [styles.cardMain, pressed && { opacity: 0.7 }]}
        >
          <Text style={[cantiere.titleSm, { color: colors.text }]} numberOfLines={2}>
            {clientName} · {item.lavori?.title || '—'}
          </Text>
          <StatusPill
            kind={STAGE_PILL[stage]}
            label={STAGE_LABELS[stage]}
            icon={stage === 'accepted' ? 'lock-closed-outline' : undefined}
          />
          <Text style={[cantiere.meta, { color: colors.textSecondary }]}>
            Revisione {item.revision}
            {item.sent_at ? ` · Inviato il ${formatDate(item.sent_at)}` : ''}
          </Text>
          {item.client_decision ? (
            <Text style={[cantiere.meta, { color: colors.text }]}>
              {item.client_decision === 'accepted' ? 'Accettato' : 'Rifiutato'} il {formatDate(item.client_decision_at)}
              {item.client_signer_name ? ` da ${item.client_signer_name}` : ''}
            </Text>
          ) : null}
          {item.client_note ? <Text style={[cantiere.meta, { color: colors.textSecondary, fontWeight: '400' }]}>{item.client_note}</Text> : null}
        </Pressable>
        {waiting >= WAITING_DAYS ? (
          <View style={styles.waiting}>
            <View style={styles.waitingRow}>
              <Ionicons name="time-outline" size={22} color={colors.warningText} />
              <Text style={[styles.waitingText, { color: colors.warningText }]}>In attesa da {waiting} giorni</Text>
            </View>
            {phone ? (
              <SecondaryButton
                label="Chiama il cliente"
                icon="call-outline"
                minHeight={64}
                onPress={() => Linking.openURL(`tel:${phone.replace(/[^+\d]/g, '')}`)}
                accessibilityLabel={`Chiama ${item.lavori?.clienti?.name || 'il cliente'}`}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const filterLabel = FILTERS.find((f) => f.key === filter)?.label || '';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((item) => (
            <Chip
              key={item.key}
              label={item.label}
              selected={filter === item.key}
              onPress={() => setFilter(item.key)}
              minHeight={56}
              rounded
              style={styles.filter}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: space.s4, paddingBottom: space.s5 }}
          ListEmptyComponent={
            rows.length === 0 ? (
              <EmptyState
                text="Qui trovi i preventivi che mandi. Si preparano da un lavoro."
                action={<SecondaryButton label="Vai ai lavori" icon="hammer-outline" onPress={() => navigation.navigate('Dashboard')} />}
              />
            ) : (
              <EmptyState
                text={`Nessun preventivo «${filterLabel}».`}
                action={<View style={{ alignItems: 'center' }}><TertiaryButton label="Mostra tutti" onPress={() => setFilter('all')} /></View>}
              />
            )
          }
        />
      )}

      <BottomTabBar active="Preventivi" />

      <Modal visible={Boolean(viewing)} animationType="slide" onRequestClose={() => setViewing(null)}>
        <SafeAreaView style={[styles.viewer, { backgroundColor: colors.background }]}>
          <View style={[styles.viewerHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
            <Text style={[cantiere.titleSm, { color: colors.text, flex: 1 }]} numberOfLines={1}>{viewing?.title}</Text>
          </View>
          {viewing ? <WebView originWhitelist={['*']} source={{ html: viewing.html }} style={{ flex: 1 }} scalesPageToFit javaScriptEnabled={false} /> : null}
          <View style={[styles.viewerFooter, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
            <SecondaryButton label="Chiudi" icon="close-outline" onPress={() => setViewing(null)} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Filters unchanged in size: 56 high, 20 side padding, fully rounded.
  filters: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, gap: 8 },
  filter: { paddingHorizontal: 20 },
  card: { borderWidth: 1, borderRadius: radius.control, padding: space.s4, marginBottom: space.s3, gap: space.s3 },
  cardMain: { gap: space.s2 },
  viewer: { flex: 1 },
  viewerHeader: { paddingHorizontal: space.s4, paddingVertical: space.s3, borderBottomWidth: 1 },
  viewerFooter: { padding: space.s4, borderTopWidth: 1 },
  waiting: { gap: 10 },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  waitingText: { fontSize: 18, fontWeight: '700' },
});
