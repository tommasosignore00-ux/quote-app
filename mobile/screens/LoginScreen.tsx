import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import { useTheme } from '../lib/darkMode';

export default function LoginScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
        <Text style={{ color: colors.text, fontSize: 18, marginBottom: 12 }}>Inserisci il codice a 6 cifre della tua app di autenticazione.</Text>
        <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" placeholderTextColor={colors.textTertiary} />
        <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: colors.primary, minHeight: 64, justifyContent: 'center' }, loading && styles.disabled]} onPress={handleCode} disabled={loading || code.length !== 6}>
          <Text style={styles.btnText}>{loading ? '...' : 'Verifica'}</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
      <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.textTertiary} />
      <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={colors.textTertiary} />
      <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: colors.primary }, loading && styles.disabled]} onPress={handleLogin} disabled={loading}>
        <Text style={styles.btnText}>{loading ? '...' : t('auth.login')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => (navigation as any).navigate('Register')}>
        <Text style={[styles.link, { color: colors.primary }]}>{t('auth.register')}</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, backgroundColor: '#f1f5f9', justifyContent: 'center' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 16 },
  btnPrimary: { backgroundColor: '#c2410c', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.6 },
  link: { color: '#c2410c', textAlign: 'center', fontSize: 14 },
});
