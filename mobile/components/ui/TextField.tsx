/**
 * Campo con etichetta sempre visibile sopra (spec 2.4). Il testo guida è solo un esempio.
 * Attivo: bordo 3pt `focus`. Errore: bordo 3pt rosso e riga con il motivo sotto.
 */
import React, { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/darkMode';
import { radius, space, ufficio } from './theme';
import type { IconName } from './ButtonBase';

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  help?: string | null;
  scale?: 'cantiere' | 'ufficio';
  icon?: IconName;
  /** Elemento a destra dentro il campo (es. occhio della password). */
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, help, scale = 'ufficio', icon, right, containerStyle, style, onFocus, onBlur, multiline, ...input },
  ref
) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.dangerText : focused ? colors.focus : colors.inputBorder;
  const borderWidth = error || focused ? 3 : 2;
  const minHeight = scale === 'cantiere' ? 64 : 56;
  const fontSize = scale === 'cantiere' ? 20 : 18;

  return (
    <View style={[styles.wrap, containerStyle]}>
      <Text style={[ufficio.label, styles.label, { color: colors.text }]}>{label}</Text>
      <View
        style={[
          styles.box,
          { minHeight, borderColor, borderWidth, backgroundColor: colors.inputBg, paddingHorizontal: space.s4 - (borderWidth - 2) },
        ]}
      >
        {icon ? <Ionicons name={icon} size={22} color={colors.textSecondary} /> : null}
        <TextInput
          ref={ref}
          {...input}
          multiline={multiline}
          accessibilityLabel={input.accessibilityLabel || label}
          accessibilityHint={error || input.accessibilityHint}
          placeholderTextColor={colors.textTertiary}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { fontSize, color: colors.text, minHeight: minHeight - 6 }, multiline && styles.multiline, style]}
        />
        {right}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle-outline" size={20} color={colors.dangerText} />
          <Text style={[ufficio.label, styles.flex, { color: colors.dangerText }]}>{error}</Text>
        </View>
      ) : help ? (
        <Text style={[ufficio.label, styles.help, { color: colors.textSecondary, fontWeight: '400' }]}>{help}</Text>
      ) : null}
    </View>
  );
});

export default TextField;

const styles = StyleSheet.create({
  wrap: { marginBottom: space.s4 },
  label: { marginBottom: 6 },
  box: { flexDirection: 'row', alignItems: 'center', gap: space.s2, borderRadius: radius.control },
  input: { flex: 1, paddingVertical: space.s2 },
  multiline: { textAlignVertical: 'top', paddingTop: space.s3 },
  errorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  help: { marginTop: 6 },
  flex: { flex: 1 },
});
