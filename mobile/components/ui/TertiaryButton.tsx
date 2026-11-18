/** Link: testo arancio sottolineato, area di tocco almeno 48×48 (spec 2.1). */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/darkMode';
import { FONT_FAMILY, space } from './theme';
import type { IconName } from './ButtonBase';

type Props = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityRole?: 'button' | 'link';
};

export default function TertiaryButton({ label, onPress, icon, disabled, style, accessibilityLabel, accessibilityHint, accessibilityRole = 'button' }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(disabled) }}
      hitSlop={4}
      style={({ pressed }) => [styles.base, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }, style]}
    >
      <View style={styles.inner}>
        {icon ? <Ionicons name={icon} size={22} color={colors.primaryText} /> : null}
        <Text style={[styles.text, { color: colors.primaryText }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, minWidth: 48, justifyContent: 'center', paddingHorizontal: space.s1 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: space.s2 },
  text: { fontFamily: FONT_FAMILY.bodyBold, fontWeight: '700', fontSize: 18, lineHeight: 24, textDecorationLine: 'underline' },
});
