/**
 * Barra in basso condivisa (spec 3.1): Lavori, Preventivi, Listini, Profilo.
 * Quattro voci a larghezza uguale; la voce attiva ha icona piena, colore arancio,
 * barretta in alto e `selected` per i lettori di schermo.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/darkMode';
import { FONT_FAMILY } from './theme';
import type { IconName } from './ButtonBase';

export type TabName = 'Dashboard' | 'Preventivi' | 'Listini' | 'Profile';

const TABS: { name: TabName; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'Dashboard', label: 'Lavori', icon: 'hammer-outline', iconActive: 'hammer' },
  { name: 'Preventivi', label: 'Preventivi', icon: 'document-text-outline', iconActive: 'document-text' },
  { name: 'Listini', label: 'Listini', icon: 'pricetags-outline', iconActive: 'pricetags' },
  { name: 'Profile', label: 'Profilo', icon: 'person-circle-outline', iconActive: 'person-circle' },
];

/** Altezza senza area sicura: serve per posare il microfono flottante sopra la barra. */
export const BOTTOM_TAB_BAR_HEIGHT = 64;

export default function BottomTabBar({ active, onReselect }: { active: TabName; onReselect?: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  return (
    <View
      style={[styles.bar, { backgroundColor: colors.navBg, borderTopColor: colors.border, paddingBottom: insets.bottom }]}
      accessibilityRole="tablist"
    >
      {TABS.map((tab) => {
        const selected = tab.name === active;
        const color = selected ? colors.primaryText : colors.textSecondary;
        return (
          <Pressable
            key={tab.name}
            onPress={() => {
              if (selected) return onReselect?.();
              // Lavori resta sempre in fondo alla pila: tra le altre sezioni si sostituisce.
              if (tab.name === 'Dashboard' || active === 'Dashboard') navigation.navigate(tab.name);
              else navigation.replace(tab.name);
            }}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surfaceSecondary }]}
          >
            {selected ? <View style={[styles.marker, { backgroundColor: colors.primary }]} /> : null}
            <Ionicons name={selected ? tab.iconActive : tab.icon} size={26} color={color} />
            <Text
              style={[styles.label, { color, fontFamily: selected ? FONT_FAMILY.bodyBold : FONT_FAMILY.bodySemi, fontWeight: selected ? '700' : '600' }]}
              maxFontSizeMultiplier={1.3}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: 1 },
  item: { flex: 1, minHeight: BOTTOM_TAB_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 4 },
  marker: { position: 'absolute', top: 0, width: 32, height: 3, borderRadius: 2 },
  label: { fontSize: 16, lineHeight: 20 },
});
