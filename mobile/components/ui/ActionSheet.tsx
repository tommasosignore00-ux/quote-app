/**
 * Foglio dal basso con le azioni di una riga (spec 2.8).
 * Passo 1: azioni, poi (separata da 24) l'azione distruttiva, poi "Annulla".
 * Passo 2: conferma nello stesso foglio, "Sì, elimina" pieno e "Annulla" sotto,
 * più vicino al pollice. Nessun Alert.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/darkMode';
import { triggerHaptic } from '../../lib/haptics';
import { cantiere, radius, shadows, space } from './theme';
import type { IconName } from './ButtonBase';
import DangerButton from './DangerButton';
import SecondaryButton from './SecondaryButton';

export type SheetAction = { label: string; icon: IconName; onPress: () => void; accessibilityLabel?: string };

export type SheetDestructive = {
  label: string;
  confirmTitle: string;
  confirmMessage: string;
  confirmLabel?: string;
  onConfirm: () => Promise<boolean | void> | boolean | void;
};

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  actions?: SheetAction[];
  destructive?: SheetDestructive | null;
  /** Apre direttamente il passo di conferma (es. "Elimina la voce" da un dettaglio). */
  startOnConfirm?: boolean;
  onClose: () => void;
};

export default function ActionSheet({ visible, title, subtitle, actions = [], destructive, startOnConfirm, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setConfirming(Boolean(startOnConfirm && destructive));
      setBusy(false);
      if (startOnConfirm && destructive) triggerHaptic('aiError');
    }
  }, [visible, startOnConfirm, destructive]);

  const askConfirm = () => {
    setConfirming(true);
    triggerHaptic('aiError');
  };

  const confirm = async () => {
    if (!destructive) return;
    setBusy(true);
    try {
      const result = await destructive.onConfirm();
      if (result !== false) {
        triggerHaptic('aiSuccess');
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    if (confirming && !startOnConfirm) setConfirming(false);
    else onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cancel}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel="Chiudi" accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            shadows.sheet,
            { backgroundColor: colors.modalBg, shadowColor: colors.shadow, paddingBottom: space.s5 + insets.bottom },
          ]}
        >
          {confirming && destructive ? (
            <>
              <Text style={[cantiere.title, { color: colors.text }]} accessibilityRole="header">
                {destructive.confirmTitle}
              </Text>
              <Text style={[cantiere.body, styles.message, { color: colors.text }]}>{destructive.confirmMessage}</Text>
              <DangerButton filled label={destructive.confirmLabel || 'Sì, elimina'} onPress={confirm} loading={busy} loadingLabel="Elimino…" minHeight={64} />
              <SecondaryButton label="Annulla" onPress={cancel} style={styles.gap16} disabled={busy} />
            </>
          ) : (
            <>
              <Text style={[cantiere.title, { color: colors.text }]} accessibilityRole="header" numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? <Text style={[cantiere.meta, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
              {actions.length > 0 ? (
                <View style={[styles.group, { borderColor: colors.border }]}>
                  {actions.map((action, index) => (
                    <Pressable
                      key={action.label}
                      onPress={() => {
                        onClose();
                        // Dopo che il foglio è sceso: due Modal non si animano insieme.
                        setTimeout(action.onPress, 350);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={action.accessibilityLabel || action.label}
                      style={({ pressed }) => [
                        styles.option,
                        { backgroundColor: pressed ? colors.surfaceSecondary : colors.surface },
                        index > 0 && { borderTopWidth: 1, borderTopColor: colors.border },
                      ]}
                    >
                      <Ionicons name={action.icon} size={24} color={colors.text} />
                      <Text style={[styles.optionText, { color: colors.text }]}>{action.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {destructive ? (
                <>
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                  <Pressable
                    onPress={askConfirm}
                    accessibilityRole="button"
                    accessibilityLabel={destructive.label}
                    style={({ pressed }) => [styles.option, styles.dangerOption, { backgroundColor: pressed ? colors.dangerBg : 'transparent' }]}
                  >
                    <Ionicons name="trash-outline" size={24} color={colors.dangerText} />
                    <Text style={[styles.optionText, { color: colors.dangerText }]}>{destructive.label}</Text>
                  </Pressable>
                </>
              ) : null}
              <SecondaryButton label="Annulla" onPress={onClose} style={styles.gap16} />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: space.s4,
    paddingTop: space.s5,
    gap: space.s2,
  },
  message: { marginTop: space.s2, marginBottom: space.s4 },
  group: { borderWidth: 1, borderRadius: radius.control, overflow: 'hidden', marginTop: space.s3 },
  option: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingHorizontal: space.s4 },
  dangerOption: { borderRadius: radius.control },
  optionText: { fontSize: 20, lineHeight: 26, fontWeight: '600', flex: 1 },
  divider: { height: 1, marginTop: space.s5 - space.s2, marginBottom: space.s2 },
  gap16: { marginTop: space.s4 },
});
