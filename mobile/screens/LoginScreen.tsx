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

  const handleLogin = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: profile } = await supabase.from('profiles').select('onboarding_completed').eq('id', data.user.id).single();
      if (profile?.onboarding_completed) {
        (navigation as any).reset({ index: 0, routes: [{ name: 'Dashboard' }] });
      } else {
        (navigation as any).reset({ index: 0, routes: [{ name: 'Onboarding' }] });
      }
    } catch (err: unknown) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
  btnPrimary: { backgroundColor: '#dc2626', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.6 },
  link: { color: '#dc2626', textAlign: 'center', fontSize: 14 },
});
