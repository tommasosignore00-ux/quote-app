/**
 * Chip di scelta (IVA, filtri): attivo = fondo inchiostro, testo foglio, spunta;
 * non attivo = foglio con bordo 2pt `inputBorder`. Stato annunciato ai lettori di schermo.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/darkMode';
import { space } from './theme';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  minHeight?: number;
  rounded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export default function Chip({ label, selected, onPress, minHeight = 52, rounded, style, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          minHeight,
          borderRadius: rounded ? minHeight / 2 : 12,
          backgroundColor: selected ? colors.text : pressed ? colors.surfaceSecondary : colors.surface,
          borderColor: selected ? colors.text : colors.inputBorder,
        },
        style,
      ]}
    >
      <View style={styles.inner}>
        {selected ? <Ionicons name="checkmark" size={20} color={colors.surface} /> : null}
        <Text style={[styles.text, { color: selected ? colors.surface : colors.text }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minWidth: 64, paddingHorizontal: space.s4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  text: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
});
