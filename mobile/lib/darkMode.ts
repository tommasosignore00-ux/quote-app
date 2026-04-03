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

export const lightColors = {
  background: '#f1f5f9',
  surface: '#ffffff',
  surfaceSecondary: '#f8fafc',
  text: '#0f172a',
  textSecondary: '#64748b',
  textTertiary: '#94a3b8',
  primary: '#dc2626',
  primaryDark: '#b91c1c',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  success: '#10b981',
  successBg: '#d1fae5',
  successText: '#065f46',
  error: '#ef4444',
  errorBg: '#fef2f2',
  warning: '#f59e0b',
  warningBg: '#fffbeb',
  overlay: 'rgba(0,0,0,0.5)',
  card: '#ffffff',
  cardShadow: '#000',
  navBg: '#ffffff',
  inputBg: '#ffffff',
  modalBg: '#ffffff',
  headerBg: '#0f172a',
  headerText: '#ffffff',
  // Onboarding
  onboardingBg: '#0f172a',
  onboardingCard: 'rgba(255,255,255,0.1)',
  onboardingText: '#ffffff',
  onboardingTextSecondary: '#cbd5e1',
};

export const darkColors: typeof lightColors = {
  background: '#0f172a',
  surface: '#1e293b',
  surfaceSecondary: '#334155',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  textTertiary: '#64748b',
  primary: '#ef4444',
  primaryDark: '#dc2626',
  border: '#334155',
  borderLight: '#1e293b',
  success: '#34d399',
  successBg: '#064e3b',
  successText: '#a7f3d0',
  error: '#f87171',
  errorBg: '#450a0a',
  warning: '#fbbf24',
  warningBg: '#451a03',
  overlay: 'rgba(0,0,0,0.7)',
  card: '#1e293b',
  cardShadow: '#000',
  navBg: '#1e293b',
  inputBg: '#334155',
  modalBg: '#1e293b',
  headerBg: '#020617',
  headerText: '#f1f5f9',
  // Onboarding
  onboardingBg: '#020617',
  onboardingCard: 'rgba(255,255,255,0.05)',
  onboardingText: '#f1f5f9',
  onboardingTextSecondary: '#94a3b8',
};

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
