import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useTheme } from '../lib/darkMode';
import { BrandMark, PrimaryButton, SecondaryButton, FONT_FAMILY, space } from '../components/ui';

export default function AuthScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();

  useEffect(() => {
    const checkSession = async (atStartup: boolean) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // A session saved halfway through two-factor login never opens the app.
        const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
          // During login the code is being asked right now: only a leftover session is closed.
          if (atStartup) await supabase.auth.signOut({ scope: 'local' });
          return;
        }
        const { data: profile } = await supabase.from('profiles').select('onboarding_completed').eq('id', session.user.id).single();
        if (profile?.onboarding_completed) {
          (navigation as any).reset({ index: 0, routes: [{ name: 'Dashboard' }] });
        } else {
          (navigation as any).reset({ index: 0, routes: [{ name: 'Onboarding' }] });
        }
      }
    };
    checkSession(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: unknown) => {
      if (session) checkSession(false);
    });
    return () => subscription.unsubscribe();
  }, [navigation]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <BrandMark size={96} />
      <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{t('app.title')}</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{t('app.subtitle')}</Text>
      <View style={styles.buttons}>
        <PrimaryButton label={t('auth.register')} onPress={() => (navigation as any).navigate('Register')} />
        <SecondaryButton label={t('auth.login')} onPress={() => (navigation as any).navigate('Login')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: space.s5 },
  title: { fontFamily: FONT_FAMILY.display, fontSize: 32, lineHeight: 38, fontWeight: '800', marginTop: space.s4, marginBottom: space.s2 },
  subtitle: { fontSize: 18, lineHeight: 24, textAlign: 'center', marginBottom: space.s6 },
  buttons: { width: '100%', maxWidth: 360, gap: space.s3 },
});
