/**
 * Dark mode context and theme.
 * Punto 7: Dark Mode - interface optimized for low-light/sunlight.
 */
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DARK_MODE_KEY = '@quoteapp:dark_mode';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  colors: typeof lightColors;
}

/**
 * Palette "carta e inchiostro" (spec Mastrovoce, lotto 1).
 * Tutte le chiavi storiche restano, così il codice esistente continua a funzionare;
 * le chiavi nuove sono segnate con "nuovo".
 *
 * Nota: `headerBg`/`headerText` e `onboarding*` tengono per ora i valori scuri,
 * perché AuthScreen e OnboardingScreen hanno ancora testo bianco scritto a mano
 * (diventerebbe invisibile su carta). Le nuove `appHeaderBg`/`appHeaderText`
 * portano già i valori chiari della testata: App.tsx li userà nel suo lotto.
 */
export const lightColors = {
  background: '#faf7f2',
  surface: '#ffffff',
  surfaceSecondary: '#f1ece3',
  mark: '#fff1e8', // nuovo: riga selezionata, voce appena aggiunta
  text: '#0f172a',
  textSecondary: '#57534e',
  textTertiary: '#78716c', // solo testo guida (placeholder)
  primary: '#c2410c', // fondo pulsante principale e microfono
  primaryText: '#c2410c', // nuovo: testo arancio su bianco o carta
  primaryDark: '#9a3412', // solo fondo premuto
  primaryStrong: '#9a3412', // nuovo: prezzi unitari, arancio su mark/surfaceSecondary
  onPrimary: '#ffffff', // nuovo: testo e icone sopra arancio, rosso, grigio
  danger: '#b91c1c',
  dangerText: '#b91c1c', // nuovo: testo rosso (in scuro è più chiaro)
  dangerBg: '#fef2f2', // nuovo: fondo di "Togli" e riquadri d'errore
  dangerBgText: '#b91c1c', // nuovo: testo sopra dangerBg
  recording: '#b91c1c', // nuovo: microfono mentre registra
  recordingRing: 'transparent', // nuovo: anello del microfono in registrazione (solo scuro)
  processing: '#57534e', // nuovo: microfono mentre "sta capendo"
  border: '#ddd5c7', // decorativo, mai unico bordo di un campo
  inputBorder: '#78716c', // nuovo: bordo di campi, caselle, chip
  borderLight: '#f1ece3',
  success: '#166534',
  successBg: '#dcfce7',
  successText: '#166534',
  error: '#b91c1c',
  errorBg: '#fef2f2',
  warning: '#92400e',
  warningText: '#92400e', // nuovo
  warningBg: '#fef3c7',
  overlay: 'rgba(15,23,42,0.55)',
  focus: '#c2410c', // nuovo: contorno del campo attivo
  shadow: '#0f172a', // nuovo: colore delle ombre (in scuro niente ombre)
  card: '#ffffff',
  cardShadow: '#000',
  navBg: '#ffffff',
  inputBg: '#ffffff',
  modalBg: '#ffffff',
  headerBg: '#0f172a',
  headerText: '#ffffff',
  appHeaderBg: '#faf7f2', // nuovo: testata chiara (spec 1.1)
  appHeaderText: '#0f172a', // nuovo
  // Onboarding
  onboardingBg: '#0f172a',
  onboardingCard: 'rgba(255,255,255,0.1)',
  onboardingText: '#ffffff',
  onboardingTextSecondary: '#cbd5e1',
};

export const darkColors: typeof lightColors = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceSecondary: '#273449',
  mark: '#431407',
  text: '#f1f5f9',
  textSecondary: '#cbd5e1',
  textTertiary: '#94a3b8',
  primary: '#c2410c', // uguale al chiaro: bianco sopra regge 5,18:1
  primaryText: '#fb923c',
  primaryDark: '#9a3412',
  primaryStrong: '#fdba74',
  onPrimary: '#ffffff',
  danger: '#b91c1c', // fondo; per il testo usare dangerText
  dangerText: '#f87171',
  dangerBg: '#450a0a',
  dangerBgText: '#fca5a5',
  recording: '#b91c1c',
  recordingRing: '#f87171', // senza anello il rosso si perde sul fondo scuro
  processing: '#475569',
  border: '#334155',
  inputBorder: '#94a3b8',
  borderLight: '#1e293b',
  success: '#86efac',
  successBg: '#052e16',
  successText: '#86efac',
  error: '#f87171',
  errorBg: '#450a0a',
  warning: '#fcd34d',
  warningText: '#fcd34d',
  warningBg: '#451a03',
  overlay: 'rgba(2,6,23,0.7)',
  focus: '#fb923c',
  shadow: 'transparent',
  card: '#1e293b',
  cardShadow: '#000',
  navBg: '#1e293b',
  inputBg: '#273449',
  modalBg: '#1e293b',
  headerBg: '#020617',
  headerText: '#f1f5f9',
  appHeaderBg: '#0f172a',
  appHeaderText: '#f1f5f9',
  // Onboarding
  onboardingBg: '#020617',
  onboardingCard: 'rgba(255,255,255,0.05)',
  onboardingText: '#f1f5f9',
  onboardingTextSecondary: '#94a3b8',
};

export type ThemeColors = typeof lightColors;

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  isDark: false,
  setMode: () => {},
  colors: lightColors,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(DARK_MODE_KEY).then((stored) => {
      if (stored && ['light', 'dark', 'system'].includes(stored)) {
        setModeState(stored as ThemeMode);
      }
    });
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem(DARK_MODE_KEY, newMode);
  };

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const colors = isDark ? darkColors : lightColors;

  return React.createElement(
    ThemeContext.Provider,
    { value: { mode, isDark, setMode, colors } },
    children
  );
}

export function useTheme(): ThemeContextType {
  return useContext(ThemeContext);
}

/**
 * Create dynamic styles based on current theme.
 */
export function useThemedStyles<T>(
  factory: (colors: typeof lightColors) => T
): T {
  const { colors } = useTheme();
  return React.useMemo(() => factory(colors), [colors]);
}
