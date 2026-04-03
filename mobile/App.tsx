import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, StyleSheet, DeviceEventEmitter, Platform } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { watchEvents } from 'react-native-watch-connectivity';
import i18n from './lib/i18n';
import { isSupabaseConfigured } from './lib/supabase';
import { ThemeProvider, useTheme } from './lib/darkMode';

import AuthScreen from './screens/AuthScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import DashboardScreen from './screens/DashboardScreen';
import ProfileScreen from './screens/ProfileScreen';
import ListiniScreen from './screens/ListiniScreen';
import QuoteScreen from './screens/QuoteScreen';
import SubscriptionScreen from './screens/SubscriptionScreen';

const Stack = createNativeStackNavigator();
export const navigationRef = createNavigationContainerRef();

function AppNavigator() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    if (Platform.OS !== 'ios' || !watchEvents || typeof watchEvents.on !== 'function') {
      return;
    }

    const handleWatchAction = (message: any, reply?: (payload: any) => void) => {
      if (message?.action === 'start_recording') {
        if (navigationRef.isReady()) {
          navigationRef.navigate('Dashboard' as never, { startVoice: true } as never);
        }
        if (typeof reply === 'function') {
          reply({ recording: true });
        } else if (typeof watchEvents.sendMessage === 'function') {
          watchEvents.sendMessage({ recording: true });
        }
      }

      if (message?.action === 'stop_recording') {
        DeviceEventEmitter.emit('stopVoiceRecording');
        if (typeof reply === 'function') {
          reply({ recording: false });
        } else if (typeof watchEvents.sendMessage === 'function') {
          watchEvents.sendMessage({ recording: false });
        }
      }
    };

    const unsubscribeMessage = watchEvents.on('message', (message: any, reply?: (payload: any) => void) => {
      handleWatchAction(message, reply);
    });

    // Fallback path if watch app sends queued context while iPhone app wasn't reachable.
    const unsubscribeContext = watchEvents.on('application-context', (message: any) => {
      handleWatchAction(message);
    });

    return () => {
      unsubscribeMessage();
      unsubscribeContext();
    };
  }, []);

  return (
    <NavigationContainer ref={navigationRef}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack.Navigator screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.headerBg },
        headerTintColor: colors.headerText,
        headerTitleStyle: { color: colors.headerText },
        contentStyle: { backgroundColor: colors.background },
      }}>
        <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ title: i18n.t('navigation.login') }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ title: i18n.t('navigation.register') }} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: i18n.t('app.title') }} />
        <Stack.Screen name="Quote" component={QuoteScreen} options={{ title: i18n.t('navigation.quote') }} />
        <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: i18n.t('navigation.profile') }} />
        <Stack.Screen name="Listini" component={ListiniScreen} options={{ title: i18n.t('navigation.listini') }} />
        <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ title: i18n.t('navigation.subscription') || 'Abbonamento' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <View style={styles.missingConfigContainer}>
        <Text style={styles.missingConfigTitle}>Configurazione mancante</Text>
        <Text style={styles.missingConfigText}>
          Imposta EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY per avviare l'app.
        </Text>
      </View>
    );
  }

  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  missingConfigContainer: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 24 },
  missingConfigTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 8, textAlign: 'center' },
  missingConfigText: { fontSize: 14, color: '#cbd5e1', textAlign: 'center' },
});
