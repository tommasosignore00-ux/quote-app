/** Titolo sopra un gruppo di righe, con azione facoltativa a destra (spec 2.3). */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/darkMode';
import { ufficio, space } from './theme';

export default function SectionHeader({ title, action, first }: { title: string; action?: React.ReactNode; first?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, first && { marginTop: 0 }]}>
      <Text style={[ufficio.title, styles.title, { color: colors.text }]} accessibilityRole="header">
        {title}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.s5, marginBottom: space.s2, gap: space.s3 },
  title: { flex: 1 },
});
