import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
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

const STAGE_COLORS: Record<QuoteStage, { bg: string; text: string }> = {
  accepted: { bg: '#dcfce7', text: '#166534' },
  rejected: { bg: '#fee2e2', text: '#991b1b' },
  sent: { bg: '#fef3c7', text: '#92400e' },
  validated: { bg: '#e2e8f0', text: '#334155' },
};

const FILTERS: Array<{ key: QuoteStage | 'all'; label: string }> = [
  { key: 'all', label: 'Tutti' },
  { key: 'accepted', label: 'Accettati' },
  { key: 'sent', label: 'In attesa' },
  { key: 'validated', label: 'Da inviare' },
  { key: 'rejected', label: 'Rifiutati' },
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PreventiviScreen() {
  const { colors } = useTheme();
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
    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => openQuote(item)}
        accessibilityRole="button"
      >
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {item.lavori?.clienti?.name || '—'} · {item.lavori?.title || '—'}
        </Text>
        <View style={[styles.stage, { backgroundColor: STAGE_COLORS[stage].bg }]}>
          <Text style={[styles.stageText, { color: STAGE_COLORS[stage].text }]}>
            {stage === 'accepted' ? '🔒 ' : ''}
            {STAGE_LABELS[stage]}
          </Text>
        </View>
        <Text style={[styles.detail, { color: colors.textSecondary }]}>
          Revisione {item.revision}
          {item.sent_at ? ` · Inviato il ${formatDate(item.sent_at)}` : ''}
        </Text>
        {item.client_decision ? (
          <Text style={[styles.detail, { color: colors.text }]}>
            {item.client_decision === 'accepted' ? 'Accettato' : 'Rifiutato'} il {formatDate(item.client_decision_at)}
            {item.client_signer_name ? ` da ${item.client_signer_name}` : ''}
          </Text>
        ) : null}
        {item.client_note ? <Text style={[styles.detail, { color: colors.textSecondary }]}>{item.client_note}</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {FILTERS.map((item) => (
            <TouchableOpacity
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[styles.filter, { backgroundColor: filter === item.key ? colors.primary : colors.card }]}
              accessibilityRole="button"
            >
              <Text style={[styles.filterText, { color: filter === item.key ? '#fff' : colors.text }]}>{item.label}</Text>
            </TouchableOpacity>
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
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>Nessun preventivo in questa sezione.</Text>}
        />
      )}

      <Modal visible={Boolean(viewing)} animationType="slide" onRequestClose={() => setViewing(null)}>
        <View style={[styles.viewer, { backgroundColor: colors.background }]}>
          {viewing ? <WebView originWhitelist={['*']} source={{ html: viewing.html }} style={{ flex: 1 }} scalesPageToFit javaScriptEnabled={false} /> : null}
          <TouchableOpacity style={[styles.close, { backgroundColor: colors.primary }]} onPress={() => setViewing(null)} accessibilityRole="button">
            <Text style={styles.closeText}>Chiudi</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filters: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, gap: 8 },
  filter: { minHeight: 56, paddingHorizontal: 20, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 18, fontWeight: '700' },
  card: { minHeight: 72, borderWidth: 2, borderRadius: 16, padding: 16, marginBottom: 12, gap: 8 },
  title: { fontSize: 21, fontWeight: '800' },
  stage: { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  stageText: { fontSize: 17, fontWeight: '800' },
  detail: { fontSize: 16 },
  empty: { fontSize: 18, textAlign: 'center', marginTop: 32 },
  viewer: { flex: 1, paddingTop: 54 },
  close: { minHeight: 72, margin: 16, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 22, fontWeight: '800' },
});
