/** Stato a parole e icona, non solo a colore (spec 2.6). È un'etichetta: non si tocca. */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/darkMode';
import { FONT_FAMILY, space } from './theme';
import type { IconName } from './ButtonBase';

export type PillKind = 'accepted' | 'waiting' | 'toSend' | 'refused' | 'queued' | 'locked' | 'neutral';

const ICONS: Record<PillKind, IconName> = {
  accepted: 'checkmark-circle-outline',
  waiting: 'time-outline',
  toSend: 'paper-plane-outline',
  refused: 'close-circle-outline',
  queued: 'cloud-offline-outline',
  locked: 'lock-closed-outline',
  neutral: 'information-circle-outline',
};

export default function StatusPill({ kind, label, icon }: { kind: PillKind; label: string; icon?: IconName }) {
  const { colors } = useTheme();
  const tone = {
    accepted: [colors.successText, colors.successBg],
    waiting: [colors.warningText, colors.warningBg],
    queued: [colors.warningText, colors.warningBg],
    toSend: [colors.text, colors.surfaceSecondary],
    locked: [colors.text, colors.surfaceSecondary],
    neutral: [colors.text, colors.surfaceSecondary],
    refused: [colors.dangerBgText, colors.dangerBg],
  }[kind];
  return (
    <View style={[styles.pill, { backgroundColor: tone[1] }]} accessibilityRole="text" accessibilityLabel={label}>
      <Ionicons name={icon || ICONS[kind]} size={20} color={tone[0]} />
      <Text style={[styles.text, { color: tone[0] }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, minHeight: 36, paddingHorizontal: space.s3, borderRadius: 999 },
  text: { fontFamily: FONT_FAMILY.bodyBold, fontWeight: '700', fontSize: 16, lineHeight: 22 },
});
