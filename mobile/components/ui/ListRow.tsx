/**
 * Riga toccabile dentro un gruppo (spec 2.2). Tocco = apre; pressione lunga =
 * scorciatoia per le azioni (sempre raggiungibili anche da un pulsante visibile).
 * Niente "Elimina" dentro la riga.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/darkMode';
import { cantiere, radius, space, ufficio } from './theme';
import type { IconName } from './ButtonBase';

type Props = {
  title: string;
  subtitle?: string | null;
  /** Testo a destra (es. prezzo) o un elemento (es. StatusPill). */
  value?: string | React.ReactNode;
  left?: React.ReactNode;
  icon?: IconName;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  /** Tinta "voce appena aggiunta". */
  highlighted?: boolean;
  scale?: 'cantiere' | 'ufficio';
  /** Nasconde la freccia (es. righe non apribili). */
  hideChevron?: boolean;
  first?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
};

export default function ListRow({
  title,
  subtitle,
  value,
  left,
  icon,
  onPress,
  onLongPress,
  selected,
  highlighted,
  scale = 'cantiere',
  hideChevron,
  first,
  accessibilityLabel,
  accessibilityHint,
  style,
}: Props) {
  const { colors } = useTheme();
  const titleStyle = scale === 'cantiere' ? cantiere.title : ufficio.row;
  const priceStyle = scale === 'cantiere' ? cantiere.price : ufficio.price;
  const bg = selected || highlighted ? colors.mark : colors.surface;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      disabled={!onPress && !onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || [title, subtitle, typeof value === 'string' ? value : null].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ selected: Boolean(selected) }}
      accessibilityActions={onLongPress ? [{ name: 'longpress', label: 'Modifica o elimina' }] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') onLongPress?.();
      }}
      style={({ pressed }) => [
        styles.row,
        { minHeight: scale === 'cantiere' ? 72 : 64, backgroundColor: pressed ? colors.surfaceSecondary : bg },
        style,
      ]}
    >
      {!first ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
      {selected ? <View style={[styles.selectedBar, { backgroundColor: colors.primary }]} /> : null}
      {left ?? (icon ? <Ionicons name={icon} size={28} color={colors.text} /> : null)}
      <View style={styles.center}>
        <Text style={[titleStyle, { color: colors.text }]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[cantiere.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {typeof value === 'string' ? <Text style={[priceStyle, { color: colors.text }]}>{value}</Text> : value}
      {selected ? (
        <Ionicons name="checkmark-circle" size={24} color={colors.primaryText} />
      ) : !hideChevron && onPress ? (
        <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
      ) : null}
    </Pressable>
  );
}

/** Contenitore del gruppo di righe: raggio 12, bordo 1pt. */
export function ListGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.surface }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.control, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s3, paddingHorizontal: space.s4, paddingVertical: space.s3 },
  separator: { position: 'absolute', top: 0, left: space.s4, right: 0, height: 1 },
  selectedBar: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4 },
  center: { flex: 1, gap: 2 },
});
