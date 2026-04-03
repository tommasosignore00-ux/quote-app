import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';

export default function AuthScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase.from('profiles').select('onboarding_completed').eq('id', session.user.id).single();
        if (profile?.onboarding_completed) {
          (navigation as any).reset({ index: 0, routes: [{ name: 'Dashboard' }] });
        } else {
          (navigation as any).reset({ index: 0, routes: [{ name: 'Onboarding' }] });
        }
      }
    };
    checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) checkSession();
    });
    return () => subscription.unsubscribe();
  }, [navigation]);

  return (
    <View style={[styles.container, { backgroundColor: colors.headerBg }]}>
      <Text style={[styles.title, { color: colors.headerText }]}>{t('app.title')}</Text>
      <Text style={[styles.subtitle, { color: colors.textTertiary }]}>{t('app.subtitle')}</Text>
      <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: colors.primary }]} onPress={() => (navigation as any).navigate('Register')}>
        <Text style={styles.btnText}>{t('auth.register')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btnSecondary} onPress={() => (navigation as any).navigate('Login')}>
        <Text style={styles.btnSecondaryText}>{t('auth.login')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a', padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#94a3b8', marginBottom: 32 },
  btnPrimary: { backgroundColor: '#dc2626', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', maxWidth: 280, alignItems: 'center', marginBottom: 12 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  btnSecondary: { paddingVertical: 14, paddingHorizontal: 32, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', borderRadius: 12, width: '100%', maxWidth: 280, alignItems: 'center' },
  btnSecondaryText: { color: '#fff', fontSize: 16 },
});
