import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';
import { triggerHaptic } from '../lib/haptics';
import { subscribeToDecisionHold } from '../lib/notifications';
import { fetchUnseenAcceptances, markAcceptanceSeen, type QuoteVersionRow } from '../lib/quoteTracking';

/** A client's answer: appears live, or when the app comes back to the foreground. */
export default function QuoteAcceptedPopup() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const [queue, setQueue] = useState<QuoteVersionRow[]>([]);
  const [held, setHeld] = useState(false);
  useEffect(() => subscribeToDecisionHold(setHeld), []);

  const refresh = useCallback(async () => {
    const unseen = await fetchUnseenAcceptances();
    setQueue((previous) => {
      if (unseen.length > previous.length) triggerHaptic('aiSuccess');
      return unseen;
    });
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel('quote-acceptances')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'preventivi_versioni' }, refresh)
      .subscribe();
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      supabase.removeChannel(channel);
      appState.remove();
    };
  }, [refresh]);

  const current = queue[0];
  if (!current || held) return null;
  const accepted = current.client_decision === 'accepted';

  const close = async (openList: boolean) => {
    setQueue((items) => items.slice(1));
    await markAcceptanceSeen(current.id);
    if (openList) (navigation as any).navigate('Preventivi');
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.modalBg }]}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{accepted ? '✓' : '–'}</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{accepted ? 'Preventivo accettato' : 'Preventivo rifiutato'}</Text>
          <Text style={[styles.body, { color: colors.text }]}>
            {current.lavori?.clienti?.name || 'Il cliente'} {accepted ? 'ha accettato' : 'ha rifiutato'} «{current.lavori?.title || 'il preventivo'}»
          </Text>
          {current.client_signer_name ? (
            <Text style={[styles.signer, { color: colors.textSecondary }]}>Firmato da {current.client_signer_name}</Text>
          ) : null}
          {current.client_note ? (
            <Text style={[styles.signer, { color: colors.textSecondary }]}>{current.client_note}</Text>
          ) : null}
          <TouchableOpacity style={styles.primary} onPress={() => close(true)} accessibilityRole="button">
            <Text style={styles.primaryText}>Vedi nei preventivi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondary, { borderColor: colors.border }]}
            onPress={() => close(false)}
            accessibilityRole="button"
          >
            <Text style={[styles.secondaryText, { color: colors.text }]}>Chiudi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  card: { borderRadius: 24, padding: 24, alignItems: 'center', gap: 12 },
  badge: { width: 88, height: 88, borderRadius: 44, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 48, fontWeight: '800' },
  title: { fontSize: 30, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  signer: { fontSize: 18, textAlign: 'center' },
  primary: { alignSelf: 'stretch', minHeight: 72, borderRadius: 18, backgroundColor: '#16a34a', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  secondary: { alignSelf: 'stretch', minHeight: 64, borderRadius: 18, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 20, fontWeight: '700' },
});
