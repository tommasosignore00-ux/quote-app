/**
 * Azione fissa in basso (spec 2.7): un PrimaryButton, eventualmente un Secondary
 * sopra. Il contenuto che scorre deve lasciare `BOTTOM_ACTION_BAR_SPACE` in fondo.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/darkMode';
import { space } from './theme';

/** Altezza indicativa con un solo pulsante da 64 (12 + 64 + 12), senza area sicura. */
export const BOTTOM_ACTION_BAR_HEIGHT = 88;

export default function BottomActionBar({ children, aboveTabBar }: { children: React.ReactNode; aboveTabBar?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: space.s3 + (aboveTabBar ? 0 : insets.bottom),
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderTopWidth: 1, paddingHorizontal: space.s4, paddingTop: space.s3, gap: space.s3 },
});
