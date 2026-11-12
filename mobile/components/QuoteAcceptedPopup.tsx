import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';
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
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.modalBg }]}>
          {/* Tono calmo: verde chiaro se accettato, neutro (né verde né rosso) se rifiutato. */}
          <View
            style={[styles.badge, { backgroundColor: accepted ? colors.successBg : colors.surfaceSecondary }]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name={accepted ? 'checkmark' : 'close'} size={48} color={accepted ? colors.success : colors.textSecondary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{accepted ? 'Preventivo accettato' : 'Preventivo rifiutato'}</Text>
          <Text style={[styles.body, { color: colors.text }]}>
            {current.lavori?.clienti?.name || 'Il cliente'} {accepted ? 'ha accettato' : 'ha rifiutato'} «{current.lavori?.title || 'il preventivo'}»
          </Text>
          {accepted ? (
            <Text style={[styles.signer, { color: colors.textSecondary }]}>Il preventivo è bloccato: non si può più modificare.</Text>
          ) : null}
          {current.client_signer_name ? (
            <Text style={[styles.signer, { color: colors.textSecondary }]}>Firmato da {current.client_signer_name}</Text>
          ) : null}
          {current.client_note ? (
            <Text style={[styles.signer, { color: colors.textSecondary }]}>{current.client_note}</Text>
          ) : null}
          <TouchableOpacity style={[styles.primary, { backgroundColor: colors.primary }]} onPress={() => close(true)} accessibilityRole="button">
            <Text style={[styles.primaryText, { color: colors.onPrimary }]}>Vedi nei preventivi</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondary, { borderColor: colors.text }]}
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
  overlay: { flex: 1, justifyContent: 'center', padding: 20 },
  card: { borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 },
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 30, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  signer: { fontSize: 18, textAlign: 'center' },
  // "Vedi nei preventivi" arancio come ogni azione principale; "Chiudi" a contorno.
  primary: { alignSelf: 'stretch', minHeight: 72, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { fontSize: 22, fontWeight: '800' },
  secondary: { alignSelf: 'stretch', minHeight: 64, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 20, fontWeight: '700' },
});
