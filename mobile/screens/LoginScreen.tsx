import React, { useState } from 'react';
import { Text, StyleSheet, KeyboardAvoidingView, Platform, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import { useTheme } from '../lib/darkMode';
import { PrimaryButton, TertiaryButton, TextField, FONT_FAMILY, space, ufficio } from '../components/ui';

export default function LoginScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');

  const continueToApp = async (userId: string) => {
    const { data: profile } = await supabase.from('profiles').select('onboarding_completed').eq('id', userId).single();
    (navigation as any).reset({ index: 0, routes: [{ name: profile?.onboarding_completed ? 'Dashboard' : 'Onboarding' }] });
  };

  const handleCode = async () => {
    setLoading(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (!factor) throw new Error('Nessun autenticatore configurato');
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) throw new Error('Codice non corretto');
      const { data } = await supabase.auth.getUser();
      if (data.user) await continueToApp(data.user.id);
    } catch (err) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(
          error.code === 'email_not_confirmed'
            ? "Conferma prima il tuo indirizzo: apri il link che ti abbiamo inviato via email."
            : 'Email o password non corrette.'
        );
      }
      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') {
        setNeedsCode(true);
        return;
      }
      await continueToApp(data.user.id);
    } catch (err: unknown) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (needsCode) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[ufficio.body, { color: colors.text, marginBottom: space.s4 }]}>Inserisci il codice a 6 cifre della tua app di autenticazione.</Text>
          <TextField
            label="Codice a 6 cifre"
            scale="cantiere"
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            maxLength={6}
            textContentType="oneTimeCode"
            style={styles.code}
          />
          <PrimaryButton label="Verifica" onPress={handleCode} loading={loading} loadingLabel="Verifico…" disabled={code.length !== 6} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <TextField label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="Es. mario.rossi@email.it" />
        <TextField
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoComplete="password"
          textContentType="password"
          right={
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Nascondi la password' : 'Mostra la password'}
              style={styles.eye}
            >
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={24} color={colors.textSecondary} />
            </Pressable>
          }
        />
        <PrimaryButton label={t('auth.login')} onPress={handleLogin} loading={loading} loadingLabel="Accedo…" style={{ marginTop: space.s2 }} />
        <TertiaryButton label="Non hai un account? Registrati" onPress={() => (navigation as any).navigate('Register')} style={styles.link} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: space.s5, flexGrow: 1, justifyContent: 'center' },
  eye: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
  code: { fontFamily: FONT_FAMILY.display, fontSize: 28, fontWeight: '800', letterSpacing: 4, fontVariant: ['tabular-nums'] },
  link: { alignSelf: 'center', marginTop: space.s3 },
});
