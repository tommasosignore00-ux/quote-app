/**
 * Base comune dei pulsanti (spec 2.1). Si usano PrimaryButton, SecondaryButton,
 * DangerButton e TertiaryButton, non questo file direttamente.
 */
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/darkMode';
import { cantiere, radius, space, ufficio } from './theme';
import { useReduceMotion } from './useReduceMotion';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export type ButtonProps = {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
  /** Mostra l'indicatore al posto dell'icona e `loadingLabel` al posto del testo. */
  loading?: boolean;
  loadingLabel?: string;
  /** "cantiere" (64, testo 22/20) o "ufficio" (56, testo 20/18). */
  scale?: 'cantiere' | 'ufficio';
  minHeight?: number;
  /** Metà larghezza in coppia: passare `style={{ flex: 1 }}`. */
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

type Variant = 'primary' | 'secondary' | 'danger' | 'dangerFilled';

export function ButtonBase({
  variant,
  label,
  onPress,
  icon,
  disabled,
  loading,
  loadingLabel,
  scale = 'cantiere',
  minHeight,
  style,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps & { variant: Variant }) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const off = Boolean(disabled || loading);

  const height = minHeight ?? (variant === 'danger' || variant === 'dangerFilled' ? 56 : scale === 'cantiere' ? 64 : 56);
  const primaryText = scale === 'cantiere' ? cantiere.title : ufficio.title;
  const secondaryText = scale === 'cantiere' ? cantiere.titleSm : { ...ufficio.title, fontSize: 18, lineHeight: 24 };

  const palette = {
    primary: { bg: colors.primary, pressed: colors.primaryDark, border: colors.primary, fg: colors.onPrimary, text: primaryText },
    secondary: { bg: 'transparent', pressed: colors.surfaceSecondary, border: colors.text, fg: colors.text, text: secondaryText },
    danger: { bg: 'transparent', pressed: colors.dangerBg, border: colors.dangerText, fg: colors.dangerText, text: secondaryText },
    dangerFilled: { bg: colors.danger, pressed: colors.danger, border: colors.danger, fg: colors.onPrimary, text: primaryText },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: off, busy: Boolean(loading) }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          backgroundColor: pressed ? palette.pressed : palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'primary' || variant === 'dangerFilled' ? 0 : 2,
          opacity: off && !loading ? 0.45 : 1,
        },
        // Gloves: pressed buttons shrink a little (colour only with "Riduci movimento").
        pressed && !reduceMotion ? styles.pressedScale : null,
        style,
      ]}
    >
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.fg} />
        ) : icon ? (
          <Ionicons name={icon} size={scale === 'cantiere' ? 26 : 24} color={palette.fg} />
        ) : null}
        <Text style={[palette.text, styles.text, { color: palette.fg }]} numberOfLines={2}>
          {loading && loadingLabel ? loadingLabel : label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.s4 },
  inner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s2 },
  text: { textAlign: 'center', flexShrink: 1 },
  pressedScale: { transform: [{ scale: 0.98 }] },
});
