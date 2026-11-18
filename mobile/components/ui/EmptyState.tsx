/** Lista vuota: una frase e al massimo un'azione (spec 2.5). */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/darkMode';
import { cantiere, radius, space } from './theme';
import type { IconName } from './ButtonBase';

export default function EmptyState({ text, icon, action }: { text: string; icon?: IconName; action?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {icon ? <Ionicons name={icon} size={40} color={colors.textSecondary} /> : null}
      <Text style={[cantiere.body, styles.text, { color: colors.text }]}>{text}</Text>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.control, borderWidth: 1, padding: space.s5, alignItems: 'center', gap: space.s3 },
  text: { textAlign: 'center' },
  action: { alignSelf: 'stretch' },
});
