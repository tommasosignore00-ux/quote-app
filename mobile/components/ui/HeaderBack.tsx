/** Pulsante "indietro" della testata per i livelli interni di una schermata (area ≥ 48). */
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/darkMode';

export default function HeaderBack({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Indietro: ${label}`}
      hitSlop={8}
      style={({ pressed }) => [styles.btn, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name="chevron-back" size={26} color={colors.appHeaderText} />
      <Text style={[styles.text, { color: colors.appHeaderText }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 48, minWidth: 48, flexDirection: 'row', alignItems: 'center', paddingRight: 8, maxWidth: 180 },
  text: { fontSize: 18, fontWeight: '600' },
});
