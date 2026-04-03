import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Alert } from 'react-native';
import { useTheme } from '../lib/darkMode';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Punto 27: GDPR consent
  const [gdprConsent, setGdprConsent] = useState(false);

  // Punto 35: Referral code from deep link
  const [referralCode, setReferralCode] = useState<string | null>(null);

  useEffect(() => {
    const parseReferral = async () => {
      try {
        const url = await Linking.getInitialURL();
        if (url) {
          const match = url.match(/[?&]ref=([A-Za-z0-9-]+)/);
          if (match) setReferralCode(match[1]);
        }
      } catch {}
    };
    parseReferral();
    const sub = Linking.addEventListener('url', ({ url }) => {
      const match = url.match(/[?&]ref=([A-Za-z0-9-]+)/);
      if (match) setReferralCode(match[1]);
    });
    return () => sub.remove();
  }, []);

  const handleRegister = async () => {
    // Punto 27: Block registration without GDPR consent
    if (!gdprConsent) {
      Alert.alert('Consenso necessario', 'Devi accettare la privacy policy per registrarti.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t('messages.error'), t('auth.passwordMismatch'));
      return;
    }
    setLoading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw authError;
      if (authData.user) {
        // Punto 35: Resolve referral code to referrer ID
        let referredBy: string | null = null;
        if (referralCode) {
          const { data: referrer } = await supabase
            .from('profiles')
            .select('id')
            .eq('referral_code', referralCode)
            .maybeSingle();
          referredBy = referrer?.id || null;
        }

        await supabase.from('profiles').upsert({
          id: authData.user.id,
          email,
          country_code: 'IT',
          language: 'it',
          onboarding_completed: false,
          // Punto 27: GDPR consent timestamp
          gdpr_consent_at: new Date().toISOString(),
          gdpr_consent_version: '1.0',
          // Punto 35: Referral tracking
          referred_by: referredBy,
        });

        // Punto 35: Create affiliate_referrals record
        if (referredBy) {
          await supabase.from('affiliate_referrals').insert({
            referrer_id: referredBy,
            referred_id: authData.user.id,
            referral_code: referralCode,
            status: 'registered',
          }).catch(() => {});
        }

        Alert.alert(t('messages.success'), t('auth.registrationComplete'));
        (navigation as any).navigate('Login');
      }
    } catch (err: unknown) {
      Alert.alert(t('messages.error'), (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={colors.textTertiary} />
        <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={colors.textTertiary} />
        <TextInput style={[styles.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]} placeholder={t('auth.confirmPassword')} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholderTextColor={colors.textTertiary} />

        {/* Punto 35: Show referral code if captured */}
        {referralCode && (
          <View style={{ backgroundColor: '#eff6ff', padding: 10, borderRadius: 8, marginBottom: 12 }}>
            <Text style={{ fontSize: 13, color: '#1e40af' }}>🎁 Codice referral: {referralCode}</Text>
          </View>
        )}

        {/* Punto 27: GDPR Consent checkbox */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}>
          <TouchableOpacity onPress={() => setGdprConsent(!gdprConsent)} style={{ marginTop: 2 }}>
            <Text style={{ fontSize: 20 }}>{gdprConsent ? '☑️' : '⬜'}</Text>
          </TouchableOpacity>
          <Text style={{ flex: 1, marginLeft: 8, fontSize: 13, color: colors.text }}>
            Accetto il trattamento dei dati personali ai sensi del GDPR (Reg. UE 2016/679).
            <Text style={{ color: '#dc2626' }} onPress={() => Linking.openURL('https://sites.google.com/view/privacypolicy-quoteapp/home-page')}>
              {' '}Leggi l'informativa
            </Text>
          </Text>
        </View>

        <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: colors.primary }, loading && styles.disabled]} onPress={handleRegister} disabled={loading}>
          <Text style={styles.btnText}>{loading ? '...' : t('auth.register')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => (navigation as any).navigate('Login')}>
          <Text style={[styles.link, { color: colors.primary }]}>{t('auth.login')}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  scroll: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 16, marginBottom: 16, fontSize: 16 },
  btnPrimary: { backgroundColor: '#dc2626', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 16 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  disabled: { opacity: 0.6 },
  link: { color: '#dc2626', textAlign: 'center', fontSize: 14 },
});
